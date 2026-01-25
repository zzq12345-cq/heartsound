/**
 * User Service
 * 用户服务模块
 *
 * Handles user authentication, profile, and data management.
 */

const { supabase } = require('../utils/supabase');

/**
 * Get or create user by OpenID
 * 根据OpenID获取或创建用户
 *
 * @param {string} openId - WeChat OpenID
 * @returns {Promise<object>} User data
 */
async function getOrCreateUser(openId) {
  if (!openId) {
    throw new Error('OpenID is required');
  }

  // Try to find existing user
  const { data: existingUser, error: findError } = await supabase
    .from('users')
    .select('*')
    .eq('openid', openId)
    .single();

  if (existingUser) {
    console.log('[UserService] Found existing user:', existingUser.id);
    return existingUser;
  }

  // Create new user - use .select().single() to return the created record
  const { data: newUser, error: createError } = await supabase
    .from('users')
    .insert({
      openid: openId,
      nickname: '用户' + openId.slice(-6),
      avatar_url: null,
      created_at: new Date().toISOString()
    })
    .select()
    .single();

  if (createError) {
    console.error('[UserService] Failed to create user:', createError);
    throw new Error('创建用户失败');
  }

  console.log('[UserService] Created new user:', newUser.id);
  return newUser;
}

/**
 * Update user profile
 * 更新用户资料
 *
 * @param {string} userId - User ID
 * @param {object} profile - Profile data
 * @returns {Promise<object>}
 */
async function updateProfile(userId, profile) {
  const { data, error } = await supabase
    .from('users')
    .update({
      nickname: profile.nickname,
      avatar_url: profile.avatarUrl,
      updated_at: new Date().toISOString()
    })
    .eq('id', userId);

  if (error) {
    console.error('[UserService] Failed to update profile:', error);
    throw new Error('更新资料失败');
  }

  return data;
}

/**
 * Get user detection records with pagination and filtering
 * 获取用户检测记录（支持分页和筛选）
 *
 * @param {string} userId - User ID
 * @param {object} options - Query options
 * @param {number} options.page - Page number (1-based)
 * @param {number} options.pageSize - Records per page
 * @param {string} options.riskLevel - Filter by risk level: 'all'|'safe'|'warning'|'danger'
 * @returns {Promise<object>} { data: array, hasMore: boolean, total: number }
 */
async function getDetectionRecords(userId, options = {}) {
  const { page = 1, pageSize = 20, riskLevel = 'all' } = options;
  const offset = (page - 1) * pageSize;

  // Build query
  let query = supabase
    .from('detection_records')
    .select('*', { count: 'exact' })
    .eq('user_id', userId);

  // Apply risk level filter if specified
  if (riskLevel && riskLevel !== 'all') {
    query = query.eq('risk_level', riskLevel);
  }

  // Apply ordering and pagination using range()
  const { data, error, count } = await query
    .order('created_at', { ascending: false })
    .range(offset, offset + pageSize - 1);

  if (error) {
    console.error('[UserService] Failed to get records:', error);
    throw new Error('获取记录失败');
  }

  const records = data || [];
  const total = count || 0;
  const hasMore = offset + records.length < total;

  return {
    data: records,
    hasMore,
    total,
    page,
    pageSize
  };
}

/**
 * Get single detection record by ID
 * 根据ID获取单条检测记录
 *
 * @param {string} recordId - Record ID (UUID)
 * @returns {Promise<object|null>} Record data or null if not found
 */
async function getRecordById(recordId) {
  if (!recordId) {
    throw new Error('Record ID is required');
  }

  const { data, error } = await supabase
    .from('detection_records')
    .select('*')
    .eq('id', recordId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      // No rows found
      console.warn('[UserService] Record not found:', recordId);
      return null;
    }
    console.error('[UserService] Failed to get record:', error);
    throw new Error('获取记录失败');
  }

  return data;
}

/**
 * Save detection record
 * 保存检测记录
 *
 * @param {string} userId - User ID
 * @param {string} deviceId - Device ID
 * @param {object} result - Detection result
 * @returns {Promise<object>}
 */
async function saveDetectionRecord(userId, deviceId, result) {
  const { data, error } = await supabase
    .from('detection_records')
    .insert({
      user_id: userId,
      device_id: deviceId,
      result_category: result.category || 'normal',
      result_label: result.label || '心音正常',
      confidence: result.confidence || 0,
      risk_level: result.risk_level || 'safe',
      probabilities: result.probabilities || {},
      health_advice: result.health_advice || null,
      duration_seconds: result.duration_seconds || 30
    })
    .select()
    .single();

  if (error) {
    console.error('[UserService] Failed to save record:', error);
    throw new Error('保存记录失败');
  }

  return data;
}

/**
 * Get health tips
 * 获取健康小贴士
 *
 * @param {number} limit - Maximum number of tips
 * @returns {Promise<array>}
 */
async function getHealthTips(limit = 10) {
  const { data, error } = await supabase
    .from('health_tips')
    .select('*')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
    .limit(limit);

  if (error) {
    console.error('[UserService] Failed to get health tips:', error);
    return []; // Return empty array on error
  }

  return data || [];
}

/**
 * Get user statistics
 * 获取用户统计数据
 *
 * @param {string} userId - User ID
 * @returns {Promise<object>}
 */
async function getUserStats(userId) {
  const { data, error } = await supabase
    .from('detection_records')
    .select('risk_level, created_at')
    .eq('user_id', userId);

  if (error) {
    console.error('[UserService] Failed to get stats:', error);
    return {
      totalDetections: 0,
      safeCount: 0,
      warningCount: 0,
      dangerCount: 0,
      lastDetectionAt: null
    };
  }

  const records = data || [];
  const stats = {
    totalDetections: records.length,
    safeCount: records.filter(r => r.risk_level === 'safe').length,
    warningCount: records.filter(r => r.risk_level === 'warning').length,
    dangerCount: records.filter(r => r.risk_level === 'danger').length,
    lastDetectionAt: records.length > 0 ? records[0].created_at : null
  };

  return stats;
}

module.exports = {
  getOrCreateUser,
  updateProfile,
  getDetectionRecords,
  getRecordById,
  saveDetectionRecord,
  getHealthTips,
  getUserStats
};
