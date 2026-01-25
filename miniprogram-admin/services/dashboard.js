/**
 * Dashboard Service - Statistics & Analytics
 * 看板数据服务 - 统计与分析
 *
 * 提供数据看板所需的各项统计数据
 */

const { supabase } = require('../utils/supabase');

/**
 * 获取看板摘要数据
 * 包含4个核心指标 + 增长率 + 风险分布
 *
 * @returns {Promise<object>}
 */
async function getSummary() {
  try {
    // 并行查询多个统计数据
    const [
      usersResult,
      detectionsResult,
      devicesResult,
      todayResult,
      lastWeekUsersResult,
      lastWeekDetectionsResult,
      yesterdayResult,
      riskResult
    ] = await Promise.all([
      // 总用户数
      getTotalUsers(),
      // 总检测数
      getTotalDetections(),
      // 设备统计
      getDeviceStats(),
      // 今日检测数
      getTodayDetections(),
      // 上周用户数（用于计算增长率）
      getLastWeekUsers(),
      // 上周检测数（用于计算增长率）
      getLastWeekDetections(),
      // 昨日检测数（用于计算增长率）
      getYesterdayDetections(),
      // 风险分布
      getRiskDistribution()
    ]);

    // 计算增长率
    const usersGrowth = calculateGrowth(usersResult, lastWeekUsersResult);
    const detectionsGrowth = calculateGrowth(detectionsResult, lastWeekDetectionsResult);
    const todayGrowth = calculateGrowth(todayResult, yesterdayResult);

    return {
      total_users: usersResult,
      total_detections: detectionsResult,
      total_devices: devicesResult.total,
      online_devices: devicesResult.online,
      today_detections: todayResult,
      trends: {
        users_growth: usersGrowth,
        detections_growth: detectionsGrowth,
        today_growth: todayGrowth
      },
      risk_distribution: riskResult
    };
  } catch (error) {
    console.error('[DashboardService] Failed to get summary:', error);
    throw error;
  }
}

/**
 * 获取7天检测趋势数据
 *
 * @returns {Promise<Array>}
 */
async function getWeeklyTrend() {
  try {
    const dates = [];
    const today = new Date();

    // 生成过去7天的日期
    for (let i = 6; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      dates.push(date.toISOString().split('T')[0]);
    }

    // 查询每天的检测数
    const results = [];

    for (const date of dates) {
      const startOfDay = `${date}T00:00:00.000Z`;
      const endOfDay = `${date}T23:59:59.999Z`;

      const { data, error } = await supabase
        .from('detection_records')
        .select('id')
        .gte('created_at', startOfDay)
        .lte('created_at', endOfDay);

      if (error) {
        console.error('[DashboardService] Query error for date:', date, error);
        results.push({ date, count: 0 });
      } else {
        results.push({ date, count: data ? data.length : 0 });
      }
    }

    return results;
  } catch (error) {
    console.error('[DashboardService] Failed to get weekly trend:', error);
    throw error;
  }
}

/**
 * 获取总用户数
 */
async function getTotalUsers() {
  const { data, error } = await supabase
    .from('users')
    .select('id');

  if (error) {
    console.error('[DashboardService] Failed to get total users:', error);
    return 0;
  }

  return data ? data.length : 0;
}

/**
 * 获取总检测数
 */
async function getTotalDetections() {
  const { data, error } = await supabase
    .from('detection_records')
    .select('id');

  if (error) {
    console.error('[DashboardService] Failed to get total detections:', error);
    return 0;
  }

  return data ? data.length : 0;
}

/**
 * 获取设备统计
 */
async function getDeviceStats() {
  const { data, error } = await supabase
    .from('devices')
    .select('id, last_seen_at');

  if (error) {
    console.error('[DashboardService] Failed to get device stats:', error);
    return { total: 0, online: 0 };
  }

  if (!data) {
    return { total: 0, online: 0 };
  }

  // 判断在线状态：最后在线时间在5分钟内视为在线
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const online = data.filter(d => d.last_seen_at && d.last_seen_at > fiveMinutesAgo).length;

  return { total: data.length, online };
}

/**
 * 获取今日检测数
 */
async function getTodayDetections() {
  const today = new Date().toISOString().split('T')[0];
  const startOfDay = `${today}T00:00:00.000Z`;

  const { data, error } = await supabase
    .from('detection_records')
    .select('id')
    .gte('created_at', startOfDay);

  if (error) {
    console.error('[DashboardService] Failed to get today detections:', error);
    return 0;
  }

  return data ? data.length : 0;
}

/**
 * 获取昨日检测数
 */
async function getYesterdayDetections() {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const dateStr = yesterday.toISOString().split('T')[0];

  const startOfDay = `${dateStr}T00:00:00.000Z`;
  const endOfDay = `${dateStr}T23:59:59.999Z`;

  const { data, error } = await supabase
    .from('detection_records')
    .select('id')
    .gte('created_at', startOfDay)
    .lte('created_at', endOfDay);

  if (error) {
    console.error('[DashboardService] Failed to get yesterday detections:', error);
    return 0;
  }

  return data ? data.length : 0;
}

/**
 * 获取上周新增用户数
 */
async function getLastWeekUsers() {
  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
  const twoWeeksAgo = new Date();
  twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);

  const { data, error } = await supabase
    .from('users')
    .select('id')
    .gte('created_at', twoWeeksAgo.toISOString())
    .lt('created_at', oneWeekAgo.toISOString());

  if (error) {
    console.error('[DashboardService] Failed to get last week users:', error);
    return 0;
  }

  return data ? data.length : 0;
}

/**
 * 获取上周检测数
 */
async function getLastWeekDetections() {
  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
  const twoWeeksAgo = new Date();
  twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);

  const { data, error } = await supabase
    .from('detection_records')
    .select('id')
    .gte('created_at', twoWeeksAgo.toISOString())
    .lt('created_at', oneWeekAgo.toISOString());

  if (error) {
    console.error('[DashboardService] Failed to get last week detections:', error);
    return 0;
  }

  return data ? data.length : 0;
}

/**
 * 获取风险分布
 */
async function getRiskDistribution() {
  const { data, error } = await supabase
    .from('detection_records')
    .select('risk_level');

  if (error) {
    console.error('[DashboardService] Failed to get risk distribution:', error);
    return { safe: 0, warning: 0, danger: 0 };
  }

  if (!data || data.length === 0) {
    return { safe: 0, warning: 0, danger: 0 };
  }

  const total = data.length;
  const safeCount = data.filter(d => d.risk_level === 'safe').length;
  const warningCount = data.filter(d => d.risk_level === 'warning').length;
  const dangerCount = data.filter(d => d.risk_level === 'danger').length;

  return {
    safe: parseFloat(((safeCount / total) * 100).toFixed(1)),
    warning: parseFloat(((warningCount / total) * 100).toFixed(1)),
    danger: parseFloat(((dangerCount / total) * 100).toFixed(1))
  };
}

/**
 * 计算增长率
 *
 * @param {number} current - 当前值
 * @param {number} previous - 上期值
 * @returns {number} 增长百分比
 */
function calculateGrowth(current, previous) {
  if (previous === 0) {
    return current > 0 ? 100 : 0;
  }
  return parseFloat((((current - previous) / previous) * 100).toFixed(1));
}

module.exports = {
  getSummary,
  getWeeklyTrend,
  getTotalUsers,
  getTotalDetections,
  getDeviceStats,
  getTodayDetections,
  getRiskDistribution
};
