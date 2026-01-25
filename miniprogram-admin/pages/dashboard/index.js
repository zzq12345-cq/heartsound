/**
 * Dashboard Page - Data Overview
 * 数据看板页面
 *
 * 展示4个核心指标 + 7天趋势折线图 + 风险分布饼图
 */

const dashboardService = require('../../services/dashboard');

Page({
  data: {
    // 加载状态
    loading: true,
    refreshing: false,

    // 统计数据
    summary: {
      total_users: 0,
      total_detections: 0,
      total_devices: 0,
      online_devices: 0,
      today_detections: 0,
      trends: {
        users_growth: 0,
        detections_growth: 0,
        today_growth: 0
      },
      risk_distribution: {
        safe: 0,
        warning: 0,
        danger: 0
      }
    },

    // 7天趋势数据
    weeklyTrend: [],

    // 管理员信息
    adminInfo: null
  },

  onLoad() {
    console.log('[DashboardPage] Page loaded');

    // 检查登录状态
    const app = getApp();
    if (!app.requireLogin()) {
      return;
    }

    this.setData({
      adminInfo: app.globalData.adminInfo
    });

    // 加载数据
    this.loadDashboardData();
  },

  onShow() {
    // 每次显示刷新数据
    if (!this.data.loading && this.data.summary.total_users > 0) {
      this.loadDashboardData();
    }
  },

  /**
   * 下拉刷新
   */
  onPullDownRefresh() {
    console.log('[DashboardPage] Pull down refresh');
    this.setData({ refreshing: true });

    this.loadDashboardData().finally(() => {
      wx.stopPullDownRefresh();
      this.setData({ refreshing: false });
    });
  },

  /**
   * 加载看板数据
   */
  async loadDashboardData() {
    this.setData({ loading: true });

    try {
      // 并行加载摘要和趋势数据
      const [summary, weeklyTrend] = await Promise.all([
        dashboardService.getSummary(),
        dashboardService.getWeeklyTrend()
      ]);

      console.log('[DashboardPage] Data loaded:', summary);

      this.setData({
        summary,
        weeklyTrend,
        loading: false
      });

    } catch (error) {
      console.error('[DashboardPage] Failed to load data:', error);

      wx.showToast({
        title: '数据加载失败',
        icon: 'none'
      });

      this.setData({ loading: false });
    }
  },

  /**
   * 点击统计卡片
   */
  onStatCardTap(e) {
    const { type } = e.currentTarget.dataset;

    switch (type) {
      case 'users':
        wx.switchTab({ url: '/pages/users/index' });
        break;
      case 'detections':
        // 跳转到报表页查看详情
        wx.switchTab({ url: '/pages/reports/index' });
        break;
      case 'devices':
        wx.switchTab({ url: '/pages/devices/index' });
        break;
      case 'today':
        // 显示今日详情
        this.showTodayDetail();
        break;
    }
  },

  /**
   * 显示今日详情
   */
  showTodayDetail() {
    const { today_detections, trends } = this.data.summary;

    wx.showModal({
      title: '今日检测',
      content: `今日共完成 ${today_detections} 次检测\n较昨日${trends.today_growth >= 0 ? '增长' : '下降'} ${Math.abs(trends.today_growth)}%`,
      showCancel: false,
      confirmText: '知道了'
    });
  }
});
