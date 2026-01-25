/**
 * Devices List Page - Device Management
 * 设备列表页 - 设备管理
 */

const deviceService = require('../../services/device');

Page({
  data: {
    devices: [],
    loading: false,
    loadingMore: false,
    hasMore: true,
    page: 1,
    pageSize: 20,
    keyword: '',
    statusFilter: 'all',
    total: 0,
    filters: [
      { label: '全部', value: 'all' },
      { label: '在线', value: 'online' },
      { label: '离线', value: 'offline' }
    ]
  },

  onLoad() {
    console.log('[DevicesPage] Page loaded');

    const app = getApp();
    if (!app.requireLogin()) {
      return;
    }

    this.loadDevices();
  },

  onShow() {
    // 每次显示时刷新数据
    if (this.data.devices.length > 0) {
      this.loadDevices(true);
    }
  },

  /**
   * 下拉刷新
   */
  onPullDownRefresh() {
    this.loadDevices(true).then(() => {
      wx.stopPullDownRefresh();
    });
  },

  /**
   * 上拉加载更多
   */
  onReachBottom() {
    if (this.data.hasMore && !this.data.loadingMore) {
      this.loadMoreDevices();
    }
  },

  /**
   * 加载设备列表
   */
  async loadDevices(refresh = false) {
    if (this.data.loading) return;

    this.setData({ loading: true });

    try {
      const { list, total, hasMore } = await deviceService.getDevices({
        page: 1,
        pageSize: this.data.pageSize,
        status: this.data.statusFilter,
        keyword: this.data.keyword
      });

      this.setData({
        devices: list,
        total,
        hasMore,
        page: 1
      });

      console.log('[DevicesPage] Loaded devices:', list.length, 'total:', total);
    } catch (err) {
      console.error('[DevicesPage] Load devices failed:', err);
      wx.showToast({
        title: '加载失败',
        icon: 'error'
      });
    } finally {
      this.setData({ loading: false });
    }
  },

  /**
   * 加载更多
   */
  async loadMoreDevices() {
    if (this.data.loadingMore || !this.data.hasMore) return;

    this.setData({ loadingMore: true });

    try {
      const nextPage = this.data.page + 1;
      const { list, hasMore } = await deviceService.getDevices({
        page: nextPage,
        pageSize: this.data.pageSize,
        status: this.data.statusFilter,
        keyword: this.data.keyword
      });

      this.setData({
        devices: [...this.data.devices, ...list],
        page: nextPage,
        hasMore
      });

      console.log('[DevicesPage] Loaded more devices:', list.length);
    } catch (err) {
      console.error('[DevicesPage] Load more failed:', err);
    } finally {
      this.setData({ loadingMore: false });
    }
  },

  /**
   * 搜索
   */
  onSearch(e) {
    const { keyword } = e.detail;
    this.setData({ keyword });
    this.loadDevices(true);
  },

  /**
   * 筛选变更
   */
  onFilterChange(e) {
    const { value } = e.detail;
    this.setData({ statusFilter: value });
    this.loadDevices(true);
  },

  /**
   * 点击设备卡片
   */
  onDeviceTap(e) {
    const { device } = e.detail;
    wx.navigateTo({
      url: `/pages/devices/detail/index?id=${device.id}`
    });
  }
});
