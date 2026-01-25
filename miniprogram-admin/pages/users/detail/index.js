/**
 * User Detail Page - User Profile & Stats
 * 用户详情页 - 用户资料和统计
 */

const userService = require('../../../services/user');

Page({
  data: {
    userId: '',
    user: null,
    records: [],
    loading: true,
    loadingRecords: false,
    hasMoreRecords: true,
    recordsPage: 1
  },

  onLoad(options) {
    console.log('[UserDetailPage] Page loaded, options:', options);

    const app = getApp();
    if (!app.requireLogin()) {
      return;
    }

    if (options.id) {
      this.setData({ userId: options.id });
      this.loadUserDetail();
      this.loadUserRecords();
    } else {
      wx.showToast({
        title: '用户ID无效',
        icon: 'error'
      });
      setTimeout(() => wx.navigateBack(), 1500);
    }
  },

  /**
   * 加载用户详情
   */
  async loadUserDetail() {
    this.setData({ loading: true });

    try {
      const user = await userService.getUserById(this.data.userId);

      this.setData({
        user: {
          ...user,
          created_at_formatted: this.formatDateTime(user.created_at),
          last_login_formatted: this.formatDateTime(user.last_login_at)
        }
      });

      // 更新页面标题
      wx.setNavigationBarTitle({
        title: user.nickname || '用户详情'
      });

      console.log('[UserDetailPage] User loaded:', user.id);
    } catch (err) {
      console.error('[UserDetailPage] Load user failed:', err);
      wx.showToast({
        title: '加载失败',
        icon: 'error'
      });
    } finally {
      this.setData({ loading: false });
    }
  },

  /**
   * 加载用户检测记录
   */
  async loadUserRecords() {
    if (this.data.loadingRecords) return;

    this.setData({ loadingRecords: true });

    try {
      const { list, hasMore } = await userService.getUserRecords(this.data.userId, {
        page: this.data.recordsPage,
        pageSize: 10
      });

      const records = list.map(r => ({
        ...r,
        created_at_formatted: this.formatDateTime(r.created_at),
        risk_class: this.getRiskClass(r.risk_level),
        confidence_formatted: r.confidence ? (r.confidence * 100).toFixed(1) : '0.0'
      }));

      this.setData({
        records: this.data.recordsPage === 1 ? records : [...this.data.records, ...records],
        hasMoreRecords: hasMore
      });

      console.log('[UserDetailPage] Records loaded:', records.length);
    } catch (err) {
      console.error('[UserDetailPage] Load records failed:', err);
    } finally {
      this.setData({ loadingRecords: false });
    }
  },

  /**
   * 加载更多记录
   */
  loadMoreRecords() {
    if (this.data.hasMoreRecords && !this.data.loadingRecords) {
      this.setData({ recordsPage: this.data.recordsPage + 1 });
      this.loadUserRecords();
    }
  },

  /**
   * 格式化日期时间
   */
  formatDateTime(dateStr) {
    if (!dateStr) return '--';
    const date = new Date(dateStr);
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    const h = String(date.getHours()).padStart(2, '0');
    const min = String(date.getMinutes()).padStart(2, '0');
    return `${y}-${m}-${d} ${h}:${min}`;
  },

  /**
   * 获取风险等级样式类
   */
  getRiskClass(riskLevel) {
    switch (riskLevel) {
      case 'safe': return 'safe';
      case 'warning': return 'warning';
      case 'danger': return 'danger';
      default: return 'unknown';
    }
  },

  /**
   * 获取风险等级文字
   */
  getRiskText(riskLevel) {
    switch (riskLevel) {
      case 'safe': return '安全';
      case 'warning': return '中等';
      case 'danger': return '高风险';
      default: return '未知';
    }
  }
});
