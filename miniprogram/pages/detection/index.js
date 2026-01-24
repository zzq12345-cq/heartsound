/**
 * Detection Page - Heart Sound Detection Entry
 * 检测页 - 心音检测入口（TabBar页面）
 */

const app = getApp();

Page({
  data: {
    deviceConnected: false,
    deviceInfo: null,
    // 最近检测记录
    recentRecords: [],
    // 健康小贴士
    tips: [
      '每周进行2-3次心音检测，可以更好地追踪心脏健康变化',
      '检测前保持安静，避免剧烈运动后立即检测',
      '将听诊器放置在心脏正上方可获得最佳录音效果'
    ],
    currentTip: 0
  },

  onLoad() {
    console.log('[DetectionPage] Page loaded');
  },

  onShow() {
    this.checkDeviceStatus();
    this.loadRecentRecords();
    this.startTipRotation();
  },

  onHide() {
    if (this.tipTimer) {
      clearInterval(this.tipTimer);
    }
  },

  /**
   * 检查设备连接状态
   */
  checkDeviceStatus() {
    const { deviceConnected, deviceInfo } = app.globalData;
    this.setData({
      deviceConnected,
      deviceInfo
    });
  },

  /**
   * 加载最近检测记录
   */
  loadRecentRecords() {
    try {
      const history = wx.getStorageSync('detectionHistory') || [];
      this.setData({
        recentRecords: history.slice(0, 3)
      });
    } catch (error) {
      console.error('加载历史记录失败:', error);
    }
  },

  /**
   * 轮播健康小贴士
   */
  startTipRotation() {
    this.tipTimer = setInterval(() => {
      const nextTip = (this.data.currentTip + 1) % this.data.tips.length;
      this.setData({ currentTip: nextTip });
    }, 5000);
  },

  /**
   * 开始检测
   */
  onStartTap() {
    if (!this.data.deviceConnected) {
      wx.showModal({
        title: '未连接设备',
        content: '请先在首页连接心音智鉴设备',
        confirmText: '去连接',
        cancelText: '取消',
        success: (res) => {
          if (res.confirm) {
            wx.switchTab({ url: '/pages/index/index' });
          }
        }
      });
      return;
    }

    // 跳转到检测准备页
    wx.navigateTo({
      url: '/pages/detection/prepare/index'
    });
  },

  /**
   * 查看历史记录详情
   */
  onRecordTap(e) {
    const { index } = e.currentTarget.dataset;
    const record = this.data.recentRecords[index];
    if (record) {
      wx.setStorageSync('detectionResult', record);
      wx.navigateTo({
        url: `/pages/detection/result/index?sessionId=${record.sessionId || ''}`
      });
    }
  },

  /**
   * 查看全部历史
   */
  viewAllRecords() {
    wx.switchTab({
      url: '/pages/records/index'
    });
  }
});
