/**
 * Index Page - Home & Device Connection
 * 首页 - 设备连接
 */

const app = getApp();
const deviceService = require('../../services/device');
const { formatRelativeTime } = require('../../utils/date');

Page({
  /**
   * Page data
   */
  data: {
    // Device connection state
    deviceStatus: 'disconnected', // 'disconnected' | 'connected' | 'error'
    deviceInfo: null,
    connecting: false,
    errorMessage: '',

    // Health tips
    healthTips: [],

    // UI state
    canStartDetection: false,

    // Welcome greeting
    greeting: '你好',

    // Last detection result (for quick stats)
    lastDetectionResult: null,
    lastDetectionTime: ''
  },

  /**
   * Page lifecycle - on load
   */
  onLoad() {
    console.log('[IndexPage] Page loaded');
    this.updateGreeting();
  },

  /**
   * Page lifecycle - on show
   */
  onShow() {
    console.log('[IndexPage] Page shown');
    this.updateGreeting();
    this.refreshDeviceStatus();
    this.loadHealthTips();
    this.loadLastDetection();
  },

  /**
   * Update greeting based on time of day
   */
  updateGreeting() {
    const hour = new Date().getHours();
    let greeting = '你好';

    if (hour >= 5 && hour < 12) {
      greeting = '早上好';
    } else if (hour >= 12 && hour < 14) {
      greeting = '中午好';
    } else if (hour >= 14 && hour < 18) {
      greeting = '下午好';
    } else if (hour >= 18 && hour < 22) {
      greeting = '晚上好';
    } else {
      greeting = '夜深了';
    }

    this.setData({ greeting });
  },

  /**
   * Load last detection result for quick stats
   */
  loadLastDetection() {
    // Try to get from storage or global data
    const lastResult = app.globalData.lastDetectionResult;
    if (lastResult) {
      this.setData({
        lastDetectionResult: lastResult,
        lastDetectionTime: formatRelativeTime(lastResult.detected_at)
      });
    }
  },

  /**
   * Refresh device connection status from app global data
   */
  refreshDeviceStatus() {
    const { deviceConnected, deviceInfo } = app.globalData;

    if (deviceConnected && deviceInfo) {
      this.setData({
        deviceStatus: 'connected',
        deviceInfo: deviceInfo,
        canStartDetection: true,
        errorMessage: ''
      });
    } else {
      this.setData({
        deviceStatus: 'disconnected',
        deviceInfo: null,
        canStartDetection: false
      });
    }
  },

  /**
   * Load health tips
   */
  loadHealthTips() {
    const tips = app.globalData.healthTips || [];
    this.setData({ healthTips: tips });
  },

  /**
   * 开发模式 - 长按模拟设备连接（方便UI测试）
   */
  onLongPressScan() {
    console.log('[IndexPage] Long press - Dev mode mock connect');

    wx.showModal({
      title: '开发模式',
      content: '是否模拟设备连接？（仅用于UI测试）',
      success: (res) => {
        if (res.confirm) {
          this.mockDeviceConnect();
        }
      }
    });
  },

  /**
   * 模拟设备连接（开发测试用）
   */
  mockDeviceConnect() {
    // 使用合法的UUID格式作为模拟设备ID（数据库要求UUID类型）
    const mockDeviceInfo = {
      device_id: '00000000-0000-0000-0000-000000000001',
      device_name: '心音智鉴(模拟)',
      ip_address: '192.168.1.100',
      firmware_version: 'v1.0.0-mock',
      model_version: 'HeartNet-v2.1',
      uptime_seconds: 3600,
      status: 'ready'
    };

    // 保存到全局
    app.globalData.deviceConnected = true;
    app.globalData.deviceIP = '192.168.1.100';
    app.globalData.deviceInfo = mockDeviceInfo;

    this.setData({
      deviceStatus: 'connected',
      deviceInfo: mockDeviceInfo,
      canStartDetection: true,
      connecting: false,
      errorMessage: ''
    });

    wx.showToast({
      title: '模拟连接成功',
      icon: 'success'
    });
  },

  /**
   * Handle scan QR code button tap
   */
  onScanTap() {
    console.log('[IndexPage] Scan button tapped');

    wx.scanCode({
      scanType: ['qrCode'],
      success: (res) => {
        console.log('[IndexPage] Scan result:', res.result);
        this.handleQRCodeResult(res.result);
      },
      fail: (err) => {
        console.error('[IndexPage] Scan failed:', err);
        if (err.errMsg.includes('cancel')) {
          // User cancelled, do nothing
        } else {
          wx.showToast({
            title: '扫码失败',
            icon: 'none'
          });
        }
      }
    });
  },

  /**
   * Handle QR code scan result
   */
  handleQRCodeResult(content) {
    const parsed = deviceService.parseQRCode(content);

    if (!parsed) {
      wx.showToast({
        title: '无效的设备二维码',
        icon: 'none'
      });
      return;
    }

    // Connect to device
    this.connectToDevice(parsed.ip, parsed.port);
  },

  /**
   * Handle manual input button tap
   */
  onManualInputTap() {
    console.log('[IndexPage] Manual input button tapped');
    wx.navigateTo({
      url: '/pages/connect/index'
    });
  },

  /**
   * Connect to device
   */
  async connectToDevice(ip, port) {
    console.log('[IndexPage] Connecting to:', ip);

    this.setData({
      connecting: true,
      deviceStatus: 'disconnected',
      errorMessage: ''
    });

    wx.showLoading({
      title: '正在连接...',
      mask: true
    });

    try {
      const deviceInfo = await deviceService.connect(ip, port);

      // Save connection to app
      app.saveDeviceConnection(ip, deviceInfo);

      this.setData({
        connecting: false,
        deviceStatus: 'connected',
        deviceInfo: deviceInfo,
        canStartDetection: true
      });

      wx.hideLoading();
      wx.showToast({
        title: '连接成功',
        icon: 'success'
      });

    } catch (err) {
      console.error('[IndexPage] Connection failed:', err);

      this.setData({
        connecting: false,
        deviceStatus: 'error',
        errorMessage: err.message,
        canStartDetection: false
      });

      wx.hideLoading();
      wx.showModal({
        title: '连接失败',
        content: err.message,
        showCancel: false
      });
    }
  },

  /**
   * Handle device card retry event
   */
  onDeviceRetry() {
    const { deviceIP } = app.globalData;
    if (deviceIP) {
      this.connectToDevice(deviceIP);
    } else {
      // No saved IP, prompt to scan or input
      wx.showActionSheet({
        itemList: ['扫码连接', '手动输入'],
        success: (res) => {
          if (res.tapIndex === 0) {
            this.onScanTap();
          } else {
            this.onManualInputTap();
          }
        }
      });
    }
  },

  /**
   * Handle device card disconnect event
   */
  onDeviceDisconnect() {
    deviceService.disconnect();
    this.setData({
      deviceStatus: 'disconnected',
      deviceInfo: null,
      canStartDetection: false
    });

    wx.showToast({
      title: '已断开连接',
      icon: 'none'
    });
  },

  /**
   * Handle device card view info event
   */
  onDeviceViewInfo() {
    const { deviceInfo } = this.data;
    if (!deviceInfo) return;

    const info = [
      `设备名称: ${deviceInfo.device_name}`,
      `设备ID: ${deviceInfo.device_id}`,
      `IP地址: ${deviceInfo.ip_address}`,
      `固件版本: ${deviceInfo.firmware_version}`,
      `模型版本: ${deviceInfo.model_version}`,
      `运行时间: ${Math.floor(deviceInfo.uptime_seconds / 60)}分钟`
    ].join('\n');

    wx.showModal({
      title: '设备信息',
      content: info,
      showCancel: false
    });
  },

  /**
   * Handle start detection button tap
   */
  onStartDetectionTap() {
    if (!this.data.canStartDetection) {
      wx.showToast({
        title: '请先连接设备',
        icon: 'none'
      });
      return;
    }

    wx.switchTab({
      url: '/pages/detection/index'
    });
  },

  /**
   * Callback when device status changes (from app.js)
   */
  onDeviceStatusChange(connected) {
    console.log('[IndexPage] Device status changed:', connected);
    this.refreshDeviceStatus();

    if (!connected && this.data.deviceStatus === 'connected') {
      // Device was connected but now disconnected
      wx.showToast({
        title: '设备连接已断开',
        icon: 'none'
      });
    }
  },

  /**
   * Pull down refresh
   */
  onPullDownRefresh() {
    this.refreshDeviceStatus();
    this.loadHealthTips();
    wx.stopPullDownRefresh();
  }
});
