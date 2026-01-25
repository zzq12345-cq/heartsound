/**
 * HeartSound Admin - App Entry
 * 心音智鉴管理后台 - 入口文件
 *
 * 管理后台专用入口，处理管理员认证和全局状态
 */

const adminService = require('./services/admin');

App({
  /**
   * 全局数据
   */
  globalData: {
    // 管理员信息
    adminInfo: null,
    adminId: null,
    isLoggedIn: false,

    // 系统信息
    systemInfo: null,
    statusBarHeight: 44,

    // 配置
    version: '1.0.0'
  },

  /**
   * 小程序启动
   */
  onLaunch() {
    console.log('[Admin] HeartSound Admin launching...');

    // 获取系统信息
    this.initSystemInfo();

    // 检查登录状态
    this.checkLoginStatus();

    console.log('[Admin] HeartSound Admin launched');
  },

  /**
   * 初始化系统信息
   */
  initSystemInfo() {
    try {
      const systemInfo = wx.getSystemInfoSync();
      this.globalData.systemInfo = systemInfo;
      this.globalData.statusBarHeight = systemInfo.statusBarHeight || 44;
      console.log('[Admin] System info:', systemInfo.platform, systemInfo.model);
    } catch (e) {
      console.error('[Admin] Failed to get system info:', e);
    }
  },

  /**
   * 检查登录状态
   */
  async checkLoginStatus() {
    try {
      const adminToken = wx.getStorageSync('admin_token');
      const adminInfo = wx.getStorageSync('admin_info');

      if (adminToken && adminInfo) {
        // 验证token是否有效
        const isValid = await adminService.verifyToken(adminToken);

        if (isValid) {
          this.globalData.adminId = adminInfo.id;
          this.globalData.adminInfo = adminInfo;
          this.globalData.isLoggedIn = true;
          console.log('[Admin] Auto login success:', adminInfo.nickname);
          return;
        }
      }

      // Token无效或不存在，需要重新登录
      this.clearLoginState();

    } catch (error) {
      console.error('[Admin] Check login status failed:', error);
      this.clearLoginState();
    }
  },

  /**
   * 保存登录状态
   */
  saveLoginState(adminInfo, token) {
    this.globalData.adminId = adminInfo.id;
    this.globalData.adminInfo = adminInfo;
    this.globalData.isLoggedIn = true;

    wx.setStorageSync('admin_token', token);
    wx.setStorageSync('admin_info', adminInfo);

    console.log('[Admin] Login state saved:', adminInfo.nickname);
  },

  /**
   * 清除登录状态
   */
  clearLoginState() {
    this.globalData.adminId = null;
    this.globalData.adminInfo = null;
    this.globalData.isLoggedIn = false;

    wx.removeStorageSync('admin_token');
    wx.removeStorageSync('admin_info');

    console.log('[Admin] Login state cleared');
  },

  /**
   * 检查是否需要登录
   */
  requireLogin() {
    if (!this.globalData.isLoggedIn) {
      wx.redirectTo({
        url: '/pages/login/index'
      });
      return false;
    }
    return true;
  },

  /**
   * 小程序显示
   */
  onShow() {
    console.log('[Admin] App shown');
  },

  /**
   * 小程序隐藏
   */
  onHide() {
    console.log('[Admin] App hidden');
  },

  /**
   * 全局错误处理
   */
  onError(error) {
    console.error('[Admin] Global error:', error);
  }
});
