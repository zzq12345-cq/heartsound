/**
 * Users List Page - User Management
 * 用户列表页 - 用户管理
 */

const userService = require('../../services/user');

Page({
  data: {
    users: [],
    loading: false,
    loadingMore: false,
    hasMore: true,
    page: 1,
    pageSize: 20,
    keyword: '',
    total: 0
  },

  onLoad() {
    console.log('[UsersPage] Page loaded');

    const app = getApp();
    if (!app.requireLogin()) {
      return;
    }

    this.loadUsers();
  },

  onShow() {
    // 每次显示时刷新数据
    if (this.data.users.length > 0) {
      this.loadUsers(true);
    }
  },

  /**
   * 下拉刷新
   */
  onPullDownRefresh() {
    this.loadUsers(true).then(() => {
      wx.stopPullDownRefresh();
    });
  },

  /**
   * 上拉加载更多
   */
  onReachBottom() {
    if (this.data.hasMore && !this.data.loadingMore) {
      this.loadMoreUsers();
    }
  },

  /**
   * 加载用户列表
   */
  async loadUsers(refresh = false) {
    if (this.data.loading) return;

    this.setData({ loading: true });

    try {
      const { list, total, hasMore } = await userService.getUsers({
        page: 1,
        pageSize: this.data.pageSize,
        keyword: this.data.keyword
      });

      // 格式化时间
      const users = list.map(u => this.formatUser(u));

      this.setData({
        users,
        total,
        hasMore,
        page: 1
      });

      console.log('[UsersPage] Loaded users:', users.length, 'total:', total);
    } catch (err) {
      console.error('[UsersPage] Load users failed:', err);
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
  async loadMoreUsers() {
    if (this.data.loadingMore || !this.data.hasMore) return;

    this.setData({ loadingMore: true });

    try {
      const nextPage = this.data.page + 1;
      const { list, hasMore } = await userService.getUsers({
        page: nextPage,
        pageSize: this.data.pageSize,
        keyword: this.data.keyword
      });

      const newUsers = list.map(u => this.formatUser(u));

      this.setData({
        users: [...this.data.users, ...newUsers],
        page: nextPage,
        hasMore
      });

      console.log('[UsersPage] Loaded more users:', newUsers.length);
    } catch (err) {
      console.error('[UsersPage] Load more failed:', err);
    } finally {
      this.setData({ loadingMore: false });
    }
  },

  /**
   * 格式化用户数据
   */
  formatUser(user) {
    return {
      ...user,
      created_at_formatted: this.formatDate(user.created_at),
      detection_count: user.detection_count || 0,
      device_count: user.device_count || 0
    };
  },

  /**
   * 格式化日期
   */
  formatDate(dateStr) {
    if (!dateStr) return '--';
    const date = new Date(dateStr);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  },

  /**
   * 搜索
   */
  onSearch(e) {
    const { keyword } = e.detail;
    this.setData({ keyword });
    this.loadUsers(true);
  },

  /**
   * 点击用户卡片
   */
  onUserTap(e) {
    const { user } = e.detail;
    wx.navigateTo({
      url: `/pages/users/detail/index?id=${user.id}`
    });
  }
});
