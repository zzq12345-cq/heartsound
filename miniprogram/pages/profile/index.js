/**
 * Profile Page - User Profile
 * 我的页面 - 个人中心
 *
 * Features:
 * - 用户信息展示 (头像、昵称)
 * - 检测统计数据
 * - 设备连接状态
 * - 功能菜单
 */

const app = getApp();
const userService = require('../../services/user');

// Menu items configuration
const MENU_ITEMS = [
  { key: 'records', icon: 'clipboard', color: '#1890FF', label: '健康档案', path: '/pages/records/index' },
  { key: 'ai-report', icon: 'document', color: '#722ED1', label: 'AI健康报告', path: '/pages/ai-assistant/report/index' },
  { key: 'settings', icon: 'target', color: '#4CAF50', label: '设置', action: 'showDeveloping' },
  { key: 'help', icon: 'lightbulb', color: '#FF9800', label: '帮助与反馈', action: 'openHelp' }
];

Page({
  data: {
    userInfo: null,
    stats: {
      totalDetections: 0,
      safeCount: 0,
      warningCount: 0,
      dangerCount: 0
    },
    deviceConnected: false,
    deviceInfo: null,
    lastDetectionDate: '',
    menuItems: MENU_ITEMS,
    loading: true
  },

  onLoad() {
    console.log('[ProfilePage] Page loaded');
  },

  onShow() {
    this.loadUserData();
    this.updateDeviceStatus();
  },

  /**
   * Load user info and stats
   */
  async loadUserData() {
    this.setData({ loading: true });

    try {
      // Get user info from globalData
      const userInfo = app.globalData.userInfo || {
        nickname: '心音用户',
        avatarUrl: null
      };

      // Get user stats
      const userId = app.globalData.userId;
      let stats = {
        totalDetections: 0,
        safeCount: 0,
        warningCount: 0,
        dangerCount: 0,
        lastDetectionAt: null
      };

      if (userId) {
        try {
          stats = await userService.getUserStats(userId);
        } catch (error) {
          console.warn('[ProfilePage] Failed to load stats:', error);
        }
      }

      // Format last detection date
      const lastDetectionDate = stats.lastDetectionAt
        ? this.formatDate(stats.lastDetectionAt)
        : '';

      this.setData({
        userInfo,
        stats,
        lastDetectionDate,
        loading: false
      });

      console.log('[ProfilePage] User data loaded:', stats);

    } catch (error) {
      console.error('[ProfilePage] Failed to load user data:', error);
      this.setData({ loading: false });
    }
  },

  /**
   * Update device connection status
   */
  updateDeviceStatus() {
    const deviceConnected = app.globalData.deviceConnected || false;
    const deviceInfo = app.globalData.deviceInfo || null;

    this.setData({
      deviceConnected,
      deviceInfo
    });
  },

  /**
   * Format date for display
   */
  formatDate(dateString) {
    if (!dateString) return '';

    const date = new Date(dateString);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
    const recordDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());

    if (recordDate.getTime() === today.getTime()) {
      return '今天';
    } else if (recordDate.getTime() === yesterday.getTime()) {
      return '昨天';
    } else {
      const month = (date.getMonth() + 1).toString().padStart(2, '0');
      const day = date.getDate().toString().padStart(2, '0');
      return `${month}月${day}日`;
    }
  },

  /**
   * Handle menu item tap
   */
  onMenuTap(e) {
    const { menu } = e.currentTarget.dataset;
    const menuItem = MENU_ITEMS.find(item => item.key === menu);

    if (!menuItem) return;

    console.log('[ProfilePage] Menu tapped:', menu);

    if (menuItem.path) {
      wx.navigateTo({
        url: menuItem.path,
        fail: () => {
          wx.showToast({
            title: '页面开发中',
            icon: 'none'
          });
        }
      });
    } else if (menuItem.action === 'showDeveloping') {
      wx.showToast({
        title: '功能开发中',
        icon: 'none'
      });
    } else if (menuItem.action === 'openHelp') {
      this.showHelpOptions();
    }
  },

  /**
   * Show help options
   */
  showHelpOptions() {
    wx.showActionSheet({
      itemList: ['查看使用说明', '联系客服', '常见问题'],
      success: (res) => {
        if (res.tapIndex === 0) {
          wx.showModal({
            title: '使用说明',
            content: '1. 连接心音智鉴设备\n2. 将听诊器放置于心脏位置\n3. 保持安静，完成30秒录制\n4. 查看AI分析结果',
            showCancel: false
          });
        } else {
          wx.showToast({
            title: '功能开发中',
            icon: 'none'
          });
        }
      }
    });
  },

  /**
   * Handle device card tap
   */
  onDeviceTap() {
    if (this.data.deviceConnected) {
      // Show device info
      const { deviceInfo } = this.data;
      wx.showModal({
        title: '设备信息',
        content: `设备名称: ${deviceInfo?.device_name || '心音智鉴'}\nIP地址: ${deviceInfo?.ip_address || '未知'}\n固件版本: ${deviceInfo?.firmware_version || '未知'}`,
        showCancel: false
      });
    } else {
      // Navigate to connect page
      wx.navigateTo({
        url: '/pages/connect/index'
      });
    }
  },

  /**
   * Navigate to records page
   */
  goToRecords() {
    wx.navigateTo({
      url: '/pages/records/index'
    });
  }
});
