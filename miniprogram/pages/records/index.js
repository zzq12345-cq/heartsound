/**
 * Records Page - Health Records
 * 档案页 - 健康档案
 *
 * Features:
 * - 检测记录列表 (按时间倒序)
 * - 分页加载 (pageSize=20)
 * - 下拉刷新
 * - 风险等级筛选
 * - 空状态展示
 *
 * 修复记录:
 * - 修复下拉刷新时未重置records数组的问题
 */

const app = getApp();
const userService = require('../../services/user');

// Filter options configuration
const FILTER_OPTIONS = [
  { key: 'all', label: '全部' },
  { key: 'safe', label: '正常' },
  { key: 'warning', label: '需关注' },
  { key: 'danger', label: '请就医' }
];

Page({
  data: {
    records: [],
    loading: false,
    hasMore: true,
    page: 1,
    pageSize: 20,
    total: 0,
    currentFilter: 'all',
    filterOptions: FILTER_OPTIONS,
    isEmpty: false,
    isRefreshing: false,
    showLoadingMore: false
  },

  onLoad() {
    console.log('[RecordsPage] Page loaded');
  },

  onShow() {
    // Reload records when page shows (in case new detection happened)
    this.resetAndLoad();
  },

  /**
   * Reset state and load records
   */
  resetAndLoad() {
    this.setData({
      records: [],
      page: 1,
      hasMore: true,
      isEmpty: false
    });
    this.loadRecords();
  },

  /**
   * Load detection records from Supabase
   */
  async loadRecords() {
    // Check if user is logged in
    const userId = app.globalData.userId;
    if (!userId) {
      console.warn('[RecordsPage] User not logged in');
      this.setData({ isEmpty: true, loading: false });
      return;
    }

    // Prevent duplicate loading
    if (this.data.loading) return;

    this.setData({ loading: true });

    try {
      const { page, pageSize, currentFilter } = this.data;

      const result = await userService.getDetectionRecords(userId, {
        page,
        pageSize,
        riskLevel: currentFilter
      });

      console.log('[RecordsPage] Loaded records:', result.data.length, 'hasMore:', result.hasMore);

      // Format records with display date
      const formattedRecords = result.data.map(record => ({
        ...record,
        displayDate: this.formatDate(record.created_at)
      }));

      // Merge with existing records if loading more
      const newRecords = page === 1
        ? formattedRecords
        : [...this.data.records, ...formattedRecords];

      this.setData({
        records: newRecords,
        hasMore: result.hasMore,
        total: result.total,
        isEmpty: newRecords.length === 0,
        loading: false,
        isRefreshing: false,
        showLoadingMore: false
      });

    } catch (error) {
      console.error('[RecordsPage] Failed to load records:', error);
      wx.showToast({
        title: '加载失败',
        icon: 'none'
      });
      this.setData({
        loading: false,
        isRefreshing: false,
        showLoadingMore: false
      });
    }
  },

  /**
   * Format date for display
   * Shows '今天', '昨天', or formatted date
   */
  formatDate(dateString) {
    if (!dateString) return '';

    const date = new Date(dateString);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
    const recordDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());

    if (recordDate.getTime() === today.getTime()) {
      return `今天 ${this.formatTime(date)}`;
    } else if (recordDate.getTime() === yesterday.getTime()) {
      return `昨天 ${this.formatTime(date)}`;
    } else {
      const month = (date.getMonth() + 1).toString().padStart(2, '0');
      const day = date.getDate().toString().padStart(2, '0');
      return `${month}-${day} ${this.formatTime(date)}`;
    }
  },

  /**
   * Format time as HH:MM
   */
  formatTime(date) {
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
  },

  /**
   * Handle filter tab change
   */
  onFilterChange(e) {
    const filterKey = e.currentTarget.dataset.filter;

    if (filterKey === this.data.currentFilter) return;

    console.log('[RecordsPage] Filter changed to:', filterKey);

    this.setData({
      currentFilter: filterKey,
      records: [],
      page: 1,
      hasMore: true,
      isEmpty: false
    });

    this.loadRecords();
  },

  /**
   * Handle pull down refresh
   * 修复：刷新时重置records数组
   */
  onPullDownRefresh() {
    console.log('[RecordsPage] Pull down refresh');

    this.setData({
      isRefreshing: true,
      records: [], // 修复：重置records
      page: 1,
      hasMore: true,
      isEmpty: false
    });

    this.loadRecords().then(() => {
      wx.stopPullDownRefresh();
    }).catch(() => {
      wx.stopPullDownRefresh();
    });
  },

  /**
   * Handle reach bottom for pagination
   */
  onReachBottom() {
    console.log('[RecordsPage] Reach bottom, hasMore:', this.data.hasMore);

    if (!this.data.hasMore || this.data.loading) return;

    this.setData({
      page: this.data.page + 1,
      showLoadingMore: true
    });

    this.loadRecords();
  },

  /**
   * Handle record tap - navigate to detail
   */
  onRecordTap(e) {
    const { record } = e.currentTarget.dataset;

    if (!record || !record.id) return;

    // Navigate to detail page or show modal
    // For now, show action sheet with options
    wx.showActionSheet({
      itemList: ['查看详情', '分享'],
      success: (res) => {
        if (res.tapIndex === 0) {
          this.showRecordDetail(record);
        } else if (res.tapIndex === 1) {
          this.shareRecord(record);
        }
      }
    });
  },

  /**
   * Show record detail in modal
   */
  showRecordDetail(record) {
    const riskLabels = {
      safe: '正常',
      warning: '需关注',
      danger: '请就医'
    };

    wx.showModal({
      title: record.result_label || '检测结果',
      content: `风险等级: ${riskLabels[record.risk_level] || record.risk_level}\n置信度: ${record.confidence?.toFixed(1)}%\n检测时间: ${this.formatDate(record.created_at)}`,
      showCancel: false,
      confirmText: '确定'
    });
  },

  /**
   * Share record (placeholder)
   */
  shareRecord(record) {
    wx.showToast({
      title: '分享功能开发中',
      icon: 'none'
    });
  },

  /**
   * Navigate to detection page
   */
  goToDetection() {
    wx.switchTab({
      url: '/pages/detection/index'
    });
  }
});
