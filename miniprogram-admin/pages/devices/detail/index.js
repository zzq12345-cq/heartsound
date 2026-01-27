/**
 * Device Detail Page - Device Info & Management
 * 设备详情页 - 设备信息和管理
 */

const deviceService = require('../../../services/device');

Page({
  data: {
    deviceId: '',
    device: null,
    loading: true
  },

  onLoad(options) {
    console.log('[DeviceDetailPage] Page loaded, options:', options);

    const app = getApp();
    if (!app.requireLogin()) {
      return;
    }

    if (options.id) {
      this.setData({ deviceId: options.id });
      this.loadDeviceDetail();
    } else {
      wx.showToast({
        title: '设备ID无效',
        icon: 'error'
      });
      setTimeout(() => wx.navigateBack(), 1500);
    }
  },

  onShow() {
    // 从分配页返回时刷新数据
    if (this.data.device) {
      this.loadDeviceDetail();
    }
  },

  /**
   * 加载设备详情
   */
  async loadDeviceDetail() {
    this.setData({ loading: true });

    try {
      const device = await deviceService.getDeviceById(this.data.deviceId);

      this.setData({
        device: {
          ...device,
          created_at_formatted: this.formatDateTime(device.created_at),
          last_seen_formatted: this.formatDateTime(device.last_seen_at)
        }
      });

      // 更新页面标题
      wx.setNavigationBarTitle({
        title: device.device_id || '设备详情'
      });

      console.log('[DeviceDetailPage] Device loaded:', device.id);
    } catch (err) {
      console.error('[DeviceDetailPage] Load device failed:', err);
      wx.showToast({
        title: '加载失败',
        icon: 'error'
      });
    } finally {
      this.setData({ loading: false });
    }
  },

  /**
   * 格式化日期时间
   */
  formatDateTime(dateStr) {
    if (!dateStr) return '--';
    const date = new Date(dateStr);
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    const h = String(date.getHours()).padStart(2, '0');
    const min = String(date.getMinutes()).padStart(2, '0');
    return `${y}-${m}-${d} ${h}:${min}`;
  },

  /**
   * 去分配设备
   */
  goAssign() {
    wx.navigateTo({
      url: `/pages/devices/assign/index?id=${this.data.deviceId}`
    });
  },

  /**
   * 解绑设备
   */
  async unassignDevice() {
    const { device } = this.data;
    if (!device || !device.assigned_user) return;

    wx.showModal({
      title: '确认解绑',
      content: `确定要解绑用户 "${device.assigned_user.nickname || '未知'}" 吗？`,
      confirmColor: '#F44336',
      success: async (res) => {
        if (res.confirm) {
          try {
            wx.showLoading({ title: '解绑中...' });

            // 获取当前管理员ID用于日志记录
            const app = getApp();
            const adminId = app.globalData.adminInfo?.id || null;

            await deviceService.unassignDevice(this.data.deviceId, adminId);
            wx.hideLoading();
            wx.showToast({
              title: '解绑成功',
              icon: 'success'
            });
            this.loadDeviceDetail();
          } catch (err) {
            wx.hideLoading();
            console.error('[DeviceDetailPage] Unassign failed:', err);
            wx.showToast({
              title: '解绑失败',
              icon: 'error'
            });
          }
        }
      }
    });
  }
});
