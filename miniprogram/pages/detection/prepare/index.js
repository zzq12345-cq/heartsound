/**
 * Detection Prepare Page
 * 检测准备页 - 听诊器放置引导
 *
 * 修复记录:
 * - 修复onShow重复弹窗问题
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

  // 防止重复弹窗
  _isShowingModal: false,

  onLoad() {
    // 检查设备连接状态
    this.checkDeviceConnection();
    // 开始轮播提示
    this.startTipRotation();
  },

  onShow() {
    // 修复：只更新状态，不重复弹窗
    this.updateDeviceStatus();
  },

  onUnload() {
    if (this.tipTimer) {
      clearInterval(this.tipTimer);
      this.tipTimer = null;
    }
  },

  /**
   * 仅更新设备状态（不弹窗）
   */
  updateDeviceStatus() {
    const app = getApp();
    const connected = app.globalData.deviceConnected;
    this.setData({
      deviceConnected: connected,
      isReady: connected
    });
  },

  /**
   * 检查设备连接状态（首次加载时弹窗）
   */
  checkDeviceConnection() {
    const app = getApp();
    const connected = app.globalData.deviceConnected;

    this.setData({
      deviceConnected: connected,
      isReady: connected
    });

    if (!connected && !this._isShowingModal) {
      this._isShowingModal = true;
      wx.showModal({
        title: '设备未连接',
        content: '请先连接心音采集设备',
        showCancel: true,
        confirmText: '去连接',
        cancelText: '返回',
        success: (res) => {
          this._isShowingModal = false;
          if (res.confirm) {
            wx.switchTab({ url: '/pages/index/index' });
          } else {
            wx.navigateBack();
          }
        },
        fail: () => {
          this._isShowingModal = false;
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
