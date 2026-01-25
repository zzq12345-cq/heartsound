/**
 * HeartSound Mini Program Entry
 * 心音智鉴小程序入口文件
 *
 * 修复记录:
 * - 修复onHide时心跳定时器应停止以节省资源
 * - 增强错误处理
 */

// Import services
const deviceService = require('./services/device');
const userService = require('./services/user');

App({
  /**
   * Global data shared across all pages
   */
  globalData: {
    // User info
    userInfo: null,
    openId: null,
    userId: null,  // Supabase user ID

    // Device connection state
    deviceConnected: false,
    deviceInfo: null,
    deviceIP: null,

    // System info
    systemInfo: null,
    statusBarHeight: 44,

    // Health tips
    healthTips: [],

    // WebSocket connection
    socketTask: null,
    socketConnected: false
  },

  /**
   * App launch lifecycle
   */
  onLaunch() {
    console.log('[App] HeartSound launching...');

    // Get system info
    this.initSystemInfo();

    // Initialize user (async, non-blocking)
    this.initUser();

    // Check local device connection
    this.checkSavedDevice();

    // Load health tips
    this.loadHealthTips();

    console.log('[App] HeartSound launched');
  },

  /**
   * Initialize user - get or create user in Supabase
   * 初始化用户 - 在Supabase中获取或创建用户
   */
  async initUser() {
    try {
      // Check if we have a cached openId
      let openId = wx.getStorageSync('openId');

      if (!openId) {
        // Generate a local UUID as temporary openId
        // In production, this should be obtained via wx.login() + backend
        openId = this.generateUUID();
        wx.setStorageSync('openId', openId);
        console.log('[App] Generated new openId:', openId.slice(0, 8) + '...');
      } else {
        console.log('[App] Using cached openId:', openId.slice(0, 8) + '...');
      }

      this.globalData.openId = openId;

      // Get or create user in Supabase
      const user = await userService.getOrCreateUser(openId);

      if (user) {
        this.globalData.userId = user.id;
        this.globalData.userInfo = {
          nickname: user.nickname,
          avatarUrl: user.avatar_url
        };
        console.log('[App] User initialized:', user.id);
      }
    } catch (error) {
      console.error('[App] Failed to initialize user:', error);
      // App continues to work, but cloud features will be limited
    }
  },

  /**
   * Generate UUID v4
   * 生成UUID作为临时用户标识
   */
  generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  },

  /**
   * Initialize system info
   */
  initSystemInfo() {
    try {
      const systemInfo = wx.getSystemInfoSync();
      this.globalData.systemInfo = systemInfo;
      this.globalData.statusBarHeight = systemInfo.statusBarHeight || 44;
      console.log('[App] System info:', systemInfo.platform, systemInfo.model);
    } catch (e) {
      console.error('[App] Failed to get system info:', e);
    }
  },

  /**
   * Check if there's a saved device connection
   */
  checkSavedDevice() {
    try {
      const savedDevice = wx.getStorageSync('deviceInfo');
      const savedIP = wx.getStorageSync('deviceIP');

      if (savedDevice && savedIP) {
        console.log('[App] Found saved device:', savedIP);
        this.globalData.deviceIP = savedIP;
        this.globalData.deviceInfo = savedDevice;

        // Verify device is still available
        this.verifyDeviceConnection(savedIP);
      }
    } catch (e) {
      console.error('[App] Failed to check saved device:', e);
    }
  },

  /**
   * Verify device connection
   */
  verifyDeviceConnection(ip) {
    deviceService.ping(ip)
      .then(() => {
        console.log('[App] Device verified:', ip);
        this.globalData.deviceConnected = true;
        this.startHeartbeat();
      })
      .catch((err) => {
        console.warn('[App] Device not available:', err.message);
        this.globalData.deviceConnected = false;
      });
  },

  /**
   * Load health tips from storage or API
   */
  loadHealthTips() {
    // Default health tips (will be fetched from Supabase later)
    this.globalData.healthTips = [
      {
        id: 1,
        content: '成年人正常静息心率为60-100次/分钟',
        category: '心率知识'
      },
      {
        id: 2,
        content: '规律运动有助于降低静息心率，改善心脏功能',
        category: '健康建议'
      },
      {
        id: 3,
        content: '心音检测建议在安静环境下进行，避免噪音干扰',
        category: '检测提示'
      },
      {
        id: 4,
        content: '如持续感到心悸、胸闷，请及时就医检查',
        category: '健康警示'
      }
    ];
  },

  /**
   * Start heartbeat detection (every 10 seconds)
   */
  startHeartbeat() {
    if (this._heartbeatTimer) {
      clearInterval(this._heartbeatTimer);
    }

    this._heartbeatTimer = setInterval(() => {
      if (this.globalData.deviceIP) {
        deviceService.ping(this.globalData.deviceIP)
          .then(() => {
            if (!this.globalData.deviceConnected) {
              console.log('[App] Device reconnected');
              this.globalData.deviceConnected = true;
              this.notifyDeviceStatusChange(true);
            }
          })
          .catch(() => {
            if (this.globalData.deviceConnected) {
              console.warn('[App] Device disconnected');
              this.globalData.deviceConnected = false;
              this.notifyDeviceStatusChange(false);
            }
          });
      }
    }, 10000); // 10 seconds

    console.log('[App] Heartbeat started');
  },

  /**
   * Stop heartbeat detection
   */
  stopHeartbeat() {
    if (this._heartbeatTimer) {
      clearInterval(this._heartbeatTimer);
      this._heartbeatTimer = null;
      console.log('[App] Heartbeat stopped');
    }
  },

  /**
   * Notify pages about device status change
   */
  notifyDeviceStatusChange(connected) {
    const pages = getCurrentPages();
    const currentPage = pages[pages.length - 1];

    if (currentPage && currentPage.onDeviceStatusChange) {
      currentPage.onDeviceStatusChange(connected);
    }
  },

  /**
   * Save device connection
   */
  saveDeviceConnection(ip, deviceInfo) {
    this.globalData.deviceIP = ip;
    this.globalData.deviceInfo = deviceInfo;
    this.globalData.deviceConnected = true;

    wx.setStorageSync('deviceIP', ip);
    wx.setStorageSync('deviceInfo', deviceInfo);

    this.startHeartbeat();
    console.log('[App] Device connection saved:', ip);
  },

  /**
   * Clear device connection
   */
  clearDeviceConnection() {
    this.stopHeartbeat();

    this.globalData.deviceIP = null;
    this.globalData.deviceInfo = null;
    this.globalData.deviceConnected = false;

    wx.removeStorageSync('deviceIP');
    wx.removeStorageSync('deviceInfo');

    console.log('[App] Device connection cleared');
  },

  /**
   * App show lifecycle
   */
  onShow() {
    console.log('[App] App shown');
    // Resume heartbeat if device was connected
    if (this.globalData.deviceIP && !this._heartbeatTimer) {
      this.verifyDeviceConnection(this.globalData.deviceIP);
    }
  },

  /**
   * App hide lifecycle
   * 修复：后台时停止心跳节省资源
   */
  onHide() {
    console.log('[App] App hidden');
    // 修复：停止心跳以节省资源，onShow时会重新启动
    this.stopHeartbeat();
  },

  /**
   * Global error handler
   */
  onError(error) {
    console.error('[App] Global error:', error);
  }
});
