/**
 * Admin Service - Authentication & Authorization
 * 管理员服务 - 认证与授权
 *
 * 处理管理员登录、权限验证、操作日志
 */

const { supabase } = require('../utils/supabase');

// 开发模式：设为true时，首次登录自动创建管理员账号
const DEV_MODE = true;

/**
 * 使用微信登录获取管理员信息
 * 通过openid查询admins表验证权限
 *
 * @returns {Promise<{admin: object, token: string}>}
 */
async function login() {
  return new Promise((resolve, reject) => {
    // 调用微信登录获取code
    wx.login({
      success: async (loginRes) => {
        if (!loginRes.code) {
          reject(new Error('微信登录失败'));
          return;
        }

        try {
          // 在真实环境中，应该将code发送到后端换取openid
          // 这里为了演示，生成一个模拟的openid
          const openid = await getOpenidFromCode(loginRes.code);

          // 查询admins表验证管理员权限
          const { data: admin, error } = await supabase
            .from('admins')
            .select('*')
            .eq('openid', openid)
            .eq('is_active', true)
            .single();

          if (error) {
            // PGRST116表示没有找到记录
            if (error.code === 'PGRST116') {
              // 开发模式：自动创建管理员账号
              if (DEV_MODE) {
                console.log('[AdminService] DEV_MODE: Creating admin for openid:', openid);
                const newAdmin = await createDevAdmin(openid);
                if (newAdmin) {
                  const token = generateToken(newAdmin.id);
                  resolve({ admin: newAdmin, token });
                  return;
                }
              }
              reject(new Error('无管理员权限'));
            } else {
              reject(new Error('验证管理员权限失败'));
            }
            return;
          }

          if (!admin) {
            reject(new Error('无管理员权限'));
            return;
          }

          // 更新最后登录时间
          await supabase
            .from('admins')
            .update({ last_login_at: new Date().toISOString() })
            .eq('id', admin.id);

          // 生成token（简化版，实际应使用JWT）
          const token = generateToken(admin.id);

          // 记录登录日志
          await logAdminAction(admin.id, 'login', null, null, { ip: 'miniprogram' });

          console.log('[AdminService] Login success:', admin.nickname);

          resolve({ admin, token });
        } catch (err) {
          console.error('[AdminService] Login failed:', err);
          reject(err);
        }
      },
      fail: (err) => {
        console.error('[AdminService] wx.login failed:', err);
        reject(new Error('微信登录失败'));
      }
    });
  });
}

/**
 * 从code获取openid
 * 注意：生产环境中这应该在服务端完成
 *
 * @param {string} code - 微信登录code
 * @returns {Promise<string>}
 */
async function getOpenidFromCode(code) {
  // 生产环境：应调用服务端API，服务端使用code换取openid
  // 这里使用本地存储的openid或生成新的

  let openid = wx.getStorageSync('admin_openid');

  if (!openid) {
    // 生成一个模拟openid用于测试
    openid = 'admin_' + generateUUID();
    wx.setStorageSync('admin_openid', openid);
    console.log('[AdminService] Generated new admin openid:', openid.slice(0, 16) + '...');
  }

  return openid;
}

/**
 * 生成简单token
 * 注意：生产环境应使用JWT
 */
function generateToken(adminId) {
  const timestamp = Date.now();
  const random = Math.random().toString(36).slice(2);
  return `${adminId}_${timestamp}_${random}`;
}

/**
 * 生成UUID
 */
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/**
 * 开发模式：创建管理员账号
 * 仅用于开发测试，生产环境应关闭DEV_MODE
 *
 * @param {string} openid - 微信openid
 * @returns {Promise<object>}
 */
async function createDevAdmin(openid) {
  try {
    const { data: admin, error } = await supabase
      .from('admins')
      .insert({
        openid,
        nickname: '开发管理员',
        role: 'super_admin',
        permissions: ['*'],
        is_active: true,
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) {
      console.error('[AdminService] Failed to create dev admin:', error);
      return null;
    }

    console.log('[AdminService] DEV_MODE: Admin created:', admin.id);
    return admin;
  } catch (err) {
    console.error('[AdminService] Failed to create dev admin:', err);
    return null;
  }
}

/**
 * 验证token有效性
 *
 * @param {string} token - 管理员token
 * @returns {Promise<boolean>}
 */
async function verifyToken(token) {
  if (!token) return false;

  try {
    // 解析token获取adminId
    const parts = token.split('_');
    if (parts.length < 2) return false;

    const adminId = parts[0];

    // 查询管理员是否存在且有效
    const { data: admin, error } = await supabase
      .from('admins')
      .select('id, is_active')
      .eq('id', adminId)
      .eq('is_active', true)
      .single();

    if (error || !admin) {
      return false;
    }

    return true;
  } catch (err) {
    console.error('[AdminService] Token verification failed:', err);
    return false;
  }
}

/**
 * 退出登录
 */
function logout() {
  const app = getApp();
  if (app) {
    app.clearLoginState();
  }
  console.log('[AdminService] Logged out');
}

/**
 * 获取管理员信息
 *
 * @param {string} adminId - 管理员ID
 * @returns {Promise<object>}
 */
async function getAdminInfo(adminId) {
  const { data, error } = await supabase
    .from('admins')
    .select('*')
    .eq('id', adminId)
    .single();

  if (error) {
    throw new Error('获取管理员信息失败');
  }

  return data;
}

/**
 * 检查权限
 *
 * @param {string} adminId - 管理员ID
 * @param {string} permission - 权限标识
 * @returns {Promise<boolean>}
 */
async function checkPermission(adminId, permission) {
  const { data: admin, error } = await supabase
    .from('admins')
    .select('permissions')
    .eq('id', adminId)
    .single();

  if (error || !admin) {
    return false;
  }

  const permissions = admin.permissions || [];

  // 检查是否有全部权限或特定权限
  return permissions.includes('*') || permissions.includes(permission);
}

/**
 * 记录管理操作日志
 *
 * @param {string} adminId - 管理员ID
 * @param {string} action - 操作类型
 * @param {string} targetType - 操作对象类型
 * @param {string} targetId - 操作对象ID
 * @param {object} details - 操作详情
 */
async function logAdminAction(adminId, action, targetType, targetId, details = {}) {
  try {
    await supabase.from('admin_logs').insert({
      admin_id: adminId,
      action,
      target_type: targetType,
      target_id: targetId,
      details,
      created_at: new Date().toISOString()
    });
  } catch (err) {
    console.error('[AdminService] Failed to log action:', err);
  }
}

module.exports = {
  login,
  logout,
  verifyToken,
  getAdminInfo,
  checkPermission,
  logAdminAction
};
