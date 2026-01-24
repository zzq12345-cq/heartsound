/**
 * Detection Prepare Page
 * 检测准备页 - 听诊器放置引导
 */

const deviceService = require('../../../services/device');

Page({
  data: {
    isReady: false,
    deviceConnected: false,
    tips: [
      '请找一个安静的环境',
      '将听诊器放置在左胸前心脏位置',
      '保持安静，避免说话',
      '避免衣物摩擦干扰'
    ],
    currentTip: 0
  },

  onLoad() {
    // 检查设备连接状态
    this.checkDeviceConnection();
    // 开始轮播提示
    this.startTipRotation();
  },

  onShow() {
    this.checkDeviceConnection();
  },

  onUnload() {
    if (this.tipTimer) {
      clearInterval(this.tipTimer);
    }
  },

  /**
   * 检查设备连接状态
   */
  checkDeviceConnection() {
    const app = getApp();
    const connected = app.globalData.deviceConnected;

    this.setData({
      deviceConnected: connected,
      isReady: connected
    });

    if (!connected) {
      wx.showModal({
        title: '设备未连接',
        content: '请先连接心音采集设备',
        showCancel: true,
        confirmText: '去连接',
        cancelText: '返回',
        success: (res) => {
          if (res.confirm) {
            wx.switchTab({ url: '/pages/index/index' });
          } else {
            wx.navigateBack();
          }
        }
      });
    }
  },

  /**
   * 轮播提示信息
   */
  startTipRotation() {
    this.tipTimer = setInterval(() => {
      const nextTip = (this.data.currentTip + 1) % this.data.tips.length;
      this.setData({ currentTip: nextTip });
    }, 3000);
  },

  /**
   * 开始检测
   */
  startDetection() {
    if (!this.data.isReady) {
      wx.showToast({
        title: '请先连接设备',
        icon: 'none'
      });
      return;
    }

    // 振动反馈
    wx.vibrateShort({ type: 'medium' });

    // 0.5秒后跳转录制页
    setTimeout(() => {
      wx.redirectTo({
        url: '/pages/detection/recording/index'
      });
    }, 500);
  },

  /**
   * 返回首页
   */
  goBack() {
    wx.navigateBack({
      fail: () => {
        wx.switchTab({ url: '/pages/index/index' });
      }
    });
  }
});
