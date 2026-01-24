/**
 * Connect Page - Manual IP Input
 * 手动连接页 - IP地址输入
 */

const app = getApp();
const deviceService = require('../../services/device');

Page({
  /**
   * Page data
   */
  data: {
    ipAddress: '',
    connecting: false,
    showHelp: false,
    inputError: ''
  },

  /**
   * Page lifecycle
   */
  onLoad() {
    // Pre-fill with last used IP if available
    const lastIP = wx.getStorageSync('lastInputIP');
    if (lastIP) {
      this.setData({ ipAddress: lastIP });
    }
  },

  /**
   * Handle IP input change
   */
  onInputChange(e) {
    const value = e.detail.value;
    this.setData({
      ipAddress: value,
      inputError: ''
    });
  },

  /**
   * Handle input blur - validate
   */
  onInputBlur() {
    const { ipAddress } = this.data;
    if (ipAddress && !deviceService.validateIP(ipAddress)) {
      this.setData({
        inputError: '请输入有效的IP地址格式 (如: 192.168.1.100)'
      });
    }
  },

  /**
   * Clear input
   */
  onClearInput() {
    this.setData({
      ipAddress: '',
      inputError: ''
    });
  },

  /**
   * Toggle help section
   */
  onToggleHelp() {
    this.setData({
      showHelp: !this.data.showHelp
    });
  },

  /**
   * Handle connect button tap
   */
  async onConnectTap() {
    const { ipAddress, connecting } = this.data;

    if (connecting) return;

    // Validate input
    if (!ipAddress) {
      this.setData({ inputError: '请输入IP地址' });
      return;
    }

    if (!deviceService.validateIP(ipAddress)) {
      this.setData({ inputError: '请输入有效的IP地址格式' });
      return;
    }

    // Start connection
    this.setData({ connecting: true, inputError: '' });

    wx.showLoading({
      title: '正在连接...',
      mask: true
    });

    try {
      const deviceInfo = await deviceService.connect(ipAddress);

      // Save to storage for next time
      wx.setStorageSync('lastInputIP', ipAddress);

      // Save connection to app
      app.saveDeviceConnection(ipAddress, deviceInfo);

      wx.hideLoading();
      wx.showToast({
        title: '连接成功',
        icon: 'success',
        duration: 1500
      });

      // Navigate back after toast
      setTimeout(() => {
        wx.navigateBack();
      }, 1500);

    } catch (err) {
      console.error('[ConnectPage] Connection failed:', err);

      this.setData({
        connecting: false,
        inputError: err.message
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
   * Handle scan button tap (alternative method)
   */
  onScanTap() {
    wx.scanCode({
      scanType: ['qrCode'],
      success: (res) => {
        const parsed = deviceService.parseQRCode(res.result);
        if (parsed) {
          this.setData({ ipAddress: parsed.ip });
          // Auto-connect after scan
          this.onConnectTap();
        } else {
          wx.showToast({
            title: '无效的设备二维码',
            icon: 'none'
          });
        }
      },
      fail: (err) => {
        if (!err.errMsg.includes('cancel')) {
          wx.showToast({
            title: '扫码失败',
            icon: 'none'
          });
        }
      }
    });
  }
});
