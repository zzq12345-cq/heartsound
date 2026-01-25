/**
 * Login Page - Admin Authentication
 * 管理员登录页面
 *
 * 验证管理员权限，非管理员无法进入后台
 */

const adminService = require('../../services/admin');

Page({
  data: {
    loading: false,
    errorMessage: ''
  },

  onLoad() {
    console.log('[LoginPage] Page loaded');
    // 检查是否已登录
    this.checkExistingLogin();
  },

  /**
   * 检查现有登录状态
   */
  checkExistingLogin() {
    const app = getApp();
    if (app.globalData.isLoggedIn) {
      // 已登录，直接跳转到看板
      wx.switchTab({
        url: '/pages/dashboard/index'
      });
    }
  },

  /**
   * 点击登录按钮
   */
  async onLoginTap() {
    if (this.data.loading) return;

    this.setData({
      loading: true,
      errorMessage: ''
    });

    try {
      // 调用管理员登录
      const { admin, token } = await adminService.login();

      // 保存登录状态
      const app = getApp();
      app.saveLoginState(admin, token);

      console.log('[LoginPage] Login success:', admin.nickname);

      // 跳转到看板
      wx.switchTab({
        url: '/pages/dashboard/index'
      });

    } catch (error) {
      console.error('[LoginPage] Login failed:', error);

      let errorMessage = error.message || '登录失败';

      // 友好提示
      if (errorMessage.includes('无管理员权限')) {
        errorMessage = '您没有管理员权限，请联系超级管理员';
      }

      this.setData({
        errorMessage,
        loading: false
      });

      wx.showToast({
        title: errorMessage,
        icon: 'none',
        duration: 3000
      });
    }
  },

  /**
   * 清除错误信息
   */
  clearError() {
    this.setData({ errorMessage: '' });
  }
});
