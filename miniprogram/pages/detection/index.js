/**
 * Detection Page - Heart Sound Detection
 * 检测页 - 心音检测 (IMPL-005 will implement full functionality)
 */

const app = getApp();

Page({
  data: {
    deviceConnected: false,
    deviceInfo: null
  },

  onLoad() {
    console.log('[DetectionPage] Page loaded');
  },

  onShow() {
    this.checkDeviceStatus();
  },

  checkDeviceStatus() {
    const { deviceConnected, deviceInfo } = app.globalData;
    this.setData({
      deviceConnected,
      deviceInfo
    });

    if (!deviceConnected) {
      wx.showModal({
        title: '未连接设备',
        content: '请先在首页连接心音智鉴设备',
        confirmText: '去连接',
        success: (res) => {
          if (res.confirm) {
            wx.switchTab({ url: '/pages/index/index' });
          }
        }
      });
    }
  },

  onStartTap() {
    if (!this.data.deviceConnected) {
      wx.showToast({ title: '请先连接设备', icon: 'none' });
      return;
    }
    // TODO: IMPL-005 will implement full detection flow
    wx.showToast({ title: '功能开发中...', icon: 'none' });
  }
});
