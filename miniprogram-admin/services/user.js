
/**
 * User Service - User Management API
 * 用户管理服务 - 查询和管理用户
 */

const { supabase } = require('../utils/supabase');

/**
 * 转义搜索关键词中的特殊字符
 * 防止 % 和 _ 在LIKE查询中被当作通配符
 */
function escapeKeyword(keyword) {
  if (!keyword) return '';
  return keyword.replace(/[%_\\]/g, '\\$&');
}

/**
 * 获取用户列表（分页）
 *
 * @param {object} options - 查询选项
 * @param {number} options.page - 页码（从1开始）
 * @param {number} options.pageSize - 每页条数
 * @param {string} options.keyword - 搜索关键词
 * @returns {Promise<{list: array, total: number, hasMore: boolean}>}
 */
async function getUsers({ page = 1, pageSize = 20, keyword = '' } = {}) {
  try {
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = supabase
      .from('users')
      .select('*', { count: 'exact' });

    // 关键词搜索（昵称或手机号）- 转义特殊字符防止查询异常
    if (keyword) {
      const escaped = escapeKeyword(keyword);
      query = query.or(`nickname.ilike.%${escaped}%,phone.ilike.%${escaped}%`);
    }

    const { data, error, count } = await query
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) {
      console.error('[UserService] getUsers error:', error);
      throw error;
    }

    return {
      list: data || [],
      total: count || 0,
      hasMore: (from + (data?.length || 0)) < count
    };
  } catch (err) {
    console.error('[UserService] getUsers failed:', err);
    throw err;
  }
}

/**
 * 获取用户详情
 *
 * @param {string} userId - 用户ID
 * @returns {Promise<object>}
 */
async function getUserById(userId) {
  try {
    // 获取用户基本信息
    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();

    if (error) {
      throw error;
    }

    // 获取用户统计数据
    const stats = await getUserStats(userId);

    // 获取绑定设备
    const devices = await getUserDevices(userId);

    return {
      ...user,
      stats,
      devices
    };
  } catch (err) {
    console.error('[UserService] getUserById failed:', err);
    throw err;
  }
}

/**
 * 获取用户统计数据
 *
 * @param {string} userId - 用户ID
 * @returns {Promise<object>}
 */
async function getUserStats(userId) {
  try {
    // 检测总数
    const { count: totalDetections } = await supabase
      .from('detection_records')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);

    // 本月检测数
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const { count: monthDetections } = await supabase
      .from('detection_records')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('created_at', startOfMonth.toISOString());

    // 风险分布
    const { data: riskData } = await supabase
      .from('detection_records')
      .select('risk_level')
      .eq('user_id', userId);

    const riskDistribution = { safe: 0, warning: 0, danger: 0 };
    (riskData || []).forEach(r => {
      if (r.risk_level === 'safe') riskDistribution.safe++;
      else if (r.risk_level === 'warning') riskDistribution.warning++;
      else if (r.risk_level === 'danger') riskDistribution.danger++;
    });

    return {
      totalDetections: totalDetections || 0,
      monthDetections: monthDetections || 0,
      riskDistribution
    };
  } catch (err) {
    console.error('[UserService] getUserStats failed:', err);
    return {
      totalDetections: 0,
      monthDetections: 0,
      riskDistribution: { safe: 0, warning: 0, danger: 0 }
    };
  }
}

/**
 * 获取用户绑定的设备
 *
 * @param {string} userId - 用户ID
 * @returns {Promise<array>}
 */
async function getUserDevices(userId) {
  try {
    const { data, error } = await supabase
      .from('user_devices')
      .select(`
        id,
        is_primary,
        bound_at,
        device:devices(id, device_id, firmware_version, last_seen_at)
      `)
      .eq('user_id', userId);

    if (error) {
      throw error;
    }

    return (data || []).map(d => ({
      ...d.device,
      is_primary: d.is_primary,
      bound_at: d.bound_at
    }));
  } catch (err) {
    console.error('[UserService] getUserDevices failed:', err);
    return [];
  }
}

/**
 * 获取用户检测记录（分页）
 *
 * @param {string} userId - 用户ID
 * @param {object} options - 查询选项
 * @returns {Promise<{list: array, total: number, hasMore: boolean}>}
 */
async function getUserRecords(userId, { page = 1, pageSize = 10 } = {}) {
  try {
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const { data, error, count } = await supabase
      .from('detection_records')
      .select('*', { count: 'exact' })
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) {
      throw error;
    }

    return {
      list: data || [],
      total: count || 0,
      hasMore: (from + (data?.length || 0)) < count
    };
  } catch (err) {
    console.error('[UserService] getUserRecords failed:', err);
    throw err;
  }
}

/**
 * 搜索用户
 *
 * @param {string} keyword - 搜索关键词
 * @param {number} limit - 返回数量限制
 * @returns {Promise<array>}
 */
async function searchUsers(keyword, limit = 10) {
  if (!keyword) return [];

  try {
    const escaped = escapeKeyword(keyword);
    const { data, error } = await supabase
      .from('users')
      .select('id, nickname, avatar_url, phone')
      .or(`nickname.ilike.%${escaped}%,phone.ilike.%${escaped}%`)
      .limit(limit);

    if (error) {
      throw error;
    }

    return data || [];
  } catch (err) {
    console.error('[UserService] searchUsers failed:', err);
    return [];
  }
}

module.exports = {
  getUsers,
  getUserById,
  getUserStats,
  getUserDevices,
  getUserRecords,
  searchUsers
};
