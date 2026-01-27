/**
 * Device Service - Device Management API
 * 设备管理服务 - 查询、分配和管理设备
 */

const { supabase } = require('../utils/supabase');
const adminService = require('./admin');

/**
 * 转义搜索关键词中的特殊字符
 * 防止 % 和 _ 在LIKE查询中被当作通配符
 */
function escapeKeyword(keyword) {
  if (!keyword) return '';
  return keyword.replace(/[%_\\]/g, '\\$&');
}

/**
 * 获取设备列表（分页）
 *
 * @param {object} options - 查询选项
 * @param {number} options.page - 页码
 * @param {number} options.pageSize - 每页条数
 * @param {string} options.status - 状态筛选：all, online, offline, unassigned
 * @param {string} options.keyword - 搜索关键词
 * @returns {Promise<{list: array, total: number, hasMore: boolean}>}
 */
async function getDevices({ page = 1, pageSize = 20, status = 'all', keyword = '' } = {}) {
  try {
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = supabase
      .from('devices')
      .select('*', { count: 'exact' });

    // 状态筛选 - 5分钟内有心跳视为在线
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    if (status === 'online') {
      query = query.gte('last_seen_at', fiveMinutesAgo);
    } else if (status === 'offline') {
      // 离线包括：超过5分钟未心跳 或 从未上报过心跳(null)
      query = query.or(`last_seen_at.lt.${fiveMinutesAgo},last_seen_at.is.null`);
    }

    // 关键词搜索 - 转义特殊字符防止查询异常
    if (keyword) {
      const escaped = escapeKeyword(keyword);
      query = query.or(`device_id.ilike.%${escaped}%,ip_address.ilike.%${escaped}%`);
    }

    const { data, error, count } = await query
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) {
      console.error('[DeviceService] getDevices error:', error);
      throw error;
    }

    // 获取每个设备的分配信息
    const devicesWithAssignment = await Promise.all(
      (data || []).map(async (device) => {
        const assignment = await getDeviceAssignment(device.id);
        return {
          ...device,
          assigned_user: assignment,
          is_online: isDeviceOnline(device.last_seen_at)
        };
      })
    );

    return {
      list: devicesWithAssignment,
      total: count || 0,
      hasMore: (from + (data?.length || 0)) < count
    };
  } catch (err) {
    console.error('[DeviceService] getDevices failed:', err);
    throw err;
  }
}

/**
 * 判断设备是否在线
 */
function isDeviceOnline(lastSeenAt) {
  if (!lastSeenAt) return false;
  const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
  return new Date(lastSeenAt).getTime() > fiveMinutesAgo;
}

/**
 * 获取设备分配信息
 *
 * @param {string} deviceId - 设备ID（数据库ID）
 * @returns {Promise<object|null>}
 */
async function getDeviceAssignment(deviceId) {
  try {
    const { data, error } = await supabase
      .from('user_devices')
      .select(`
        id,
        is_primary,
        bound_at,
        user:users(id, nickname, avatar_url)
      `)
      .eq('device_id', deviceId)
      .single();

    if (error && error.code !== 'PGRST116') {
      throw error;
    }

    return data ? data.user : null;
  } catch (err) {
    console.error('[DeviceService] getDeviceAssignment failed:', err);
    return null;
  }
}

/**
 * 获取设备详情
 *
 * @param {string} deviceId - 设备ID
 * @returns {Promise<object>}
 */
async function getDeviceById(deviceId) {
  try {
    const { data: device, error } = await supabase
      .from('devices')
      .select('*')
      .eq('id', deviceId)
      .single();

    if (error) {
      throw error;
    }

    // 获取分配用户
    const assigned_user = await getDeviceAssignment(deviceId);

    // 获取使用统计
    const stats = await getDeviceStats(deviceId);

    return {
      ...device,
      assigned_user,
      stats,
      is_online: isDeviceOnline(device.last_seen_at)
    };
  } catch (err) {
    console.error('[DeviceService] getDeviceById failed:', err);
    throw err;
  }
}

/**
 * 获取设备使用统计
 *
 * @param {string} deviceId - 设备ID
 * @returns {Promise<object>}
 */
async function getDeviceStats(deviceId) {
  try {
    // 总检测次数
    const { count: totalDetections } = await supabase
      .from('detection_records')
      .select('*', { count: 'exact', head: true })
      .eq('device_id', deviceId);

    // 本月检测次数
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const { count: monthDetections } = await supabase
      .from('detection_records')
      .select('*', { count: 'exact', head: true })
      .eq('device_id', deviceId)
      .gte('created_at', startOfMonth.toISOString());

    return {
      totalDetections: totalDetections || 0,
      monthDetections: monthDetections || 0
    };
  } catch (err) {
    console.error('[DeviceService] getDeviceStats failed:', err);
    return { totalDetections: 0, monthDetections: 0 };
  }
}

/**
 * 分配设备给用户
 *
 * @param {string} deviceId - 设备ID（数据库ID）
 * @param {string} userId - 用户ID
 * @param {boolean} isPrimary - 是否为主设备
 * @param {string} adminId - 操作管理员ID（用于日志记录）
 * @returns {Promise<boolean>}
 */
async function assignDevice(deviceId, userId, isPrimary = true, adminId = null) {
  try {
    // 检查是否已分配
    const existing = await getDeviceAssignment(deviceId);
    if (existing) {
      throw new Error('设备已分配给其他用户');
    }

    // 创建分配记录
    const { error } = await supabase
      .from('user_devices')
      .insert({
        device_id: deviceId,
        user_id: userId,
        is_primary: isPrimary,
        bound_at: new Date().toISOString()
      });

    if (error) {
      throw error;
    }

    // 记录操作日志
    if (adminId) {
      await adminService.logAdminAction(
        adminId,
        'assign_device',
        'device',
        deviceId,
        { user_id: userId, is_primary: isPrimary }
      );
    }

    console.log('[DeviceService] Device assigned:', deviceId, '->', userId);
    return true;
  } catch (err) {
    console.error('[DeviceService] assignDevice failed:', err);
    throw err;
  }
}

/**
 * 解绑设备
 *
 * @param {string} deviceId - 设备ID
 * @param {string} adminId - 操作管理员ID（用于日志记录）
 * @returns {Promise<boolean>}
 */
async function unassignDevice(deviceId, adminId = null) {
  try {
    // 获取当前分配信息（用于日志）
    const currentAssignment = await getDeviceAssignment(deviceId);

    const { error } = await supabase
      .from('user_devices')
      .delete()
      .eq('device_id', deviceId);

    if (error) {
      throw error;
    }

    // 记录操作日志
    if (adminId) {
      await adminService.logAdminAction(
        adminId,
        'unassign_device',
        'device',
        deviceId,
        { previous_user_id: currentAssignment?.id }
      );
    }

    console.log('[DeviceService] Device unassigned:', deviceId);
    return true;
  } catch (err) {
    console.error('[DeviceService] unassignDevice failed:', err);
    throw err;
  }
}

/**
 * 添加新设备
 *
 * @param {object} deviceInfo - 设备信息
 * @param {string} adminId - 操作管理员ID（用于日志记录）
 * @returns {Promise<object>}
 */
async function addDevice(deviceInfo, adminId = null) {
  try {
    const { data, error } = await supabase
      .from('devices')
      .insert({
        device_id: deviceInfo.device_id,
        ip_address: deviceInfo.ip_address || null,
        firmware_version: deviceInfo.firmware_version || '1.0.0',
        model_version: deviceInfo.model_version || '1.0.0',
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) {
      throw error;
    }

    // 记录操作日志
    if (adminId) {
      await adminService.logAdminAction(
        adminId,
        'add_device',
        'device',
        data.id,
        { device_id: deviceInfo.device_id }
      );
    }

    console.log('[DeviceService] Device added:', data.id);
    return data;
  } catch (err) {
    console.error('[DeviceService] addDevice failed:', err);
    throw err;
  }
}

/**
 * 搜索设备
 *
 * @param {string} keyword - 搜索关键词
 * @param {number} limit - 返回数量
 * @returns {Promise<array>}
 */
async function searchDevices(keyword, limit = 10) {
  if (!keyword) return [];

  try {
    const escaped = escapeKeyword(keyword);
    const { data, error } = await supabase
      .from('devices')
      .select('id, device_id, ip_address, last_seen_at')
      .or(`device_id.ilike.%${escaped}%,ip_address.ilike.%${escaped}%`)
      .limit(limit);

    if (error) {
      throw error;
    }

    return (data || []).map(d => ({
      ...d,
      is_online: isDeviceOnline(d.last_seen_at)
    }));
  } catch (err) {
    console.error('[DeviceService] searchDevices failed:', err);
    return [];
  }
}

module.exports = {
  getDevices,
  getDeviceById,
  getDeviceAssignment,
  getDeviceStats,
  assignDevice,
  unassignDevice,
  addDevice,
  searchDevices,
  isDeviceOnline
};
