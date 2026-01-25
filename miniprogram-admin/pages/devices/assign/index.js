/**
 * Device Assign Page - Assign Device to User
 * 设备分配页 - 将设备分配给用户
 */

const deviceService = require('../../../services/device');
const userService = require('../../../services/user');

Page({
  data: {
    deviceId: '',
    device: null,
    users: [],
    selectedUser: null,
    searchKeyword: '',
    loading: true,
    searching: false,
    assigning: false
  },

  onLoad(options) {
    console.log('[DeviceAssignPage] Page loaded, options:', options);

    const app = getApp();
    if (!app.requireLogin()) {
      return;
    }

    if (options.id) {
      this.setData({ deviceId: options.id });
      this.loadDeviceInfo();
      this.loadUsers();
    } else {
      wx.showToast({
        title: '设备ID无效',
        icon: 'error'
      });
      setTimeout(() => wx.navigateBack(), 1500);
    }
  },

  /**
   * 加载设备信息
   */
  async loadDeviceInfo() {
    try {
      const device = await deviceService.getDeviceById(this.data.deviceId);
      this.setData({ device });

      // 设置页面标题
      wx.setNavigationBarTitle({
        title: `分配 ${device.device_id}`
      });
    } catch (err) {
      console.error('[DeviceAssignPage] Load device failed:', err);
    }
  },

  /**
   * 加载用户列表
   */
  async loadUsers() {
    this.setData({ loading: true });

    try {
      const { list } = await userService.getUsers({
        page: 1,
        pageSize: 50,
        keyword: this.data.searchKeyword
      });

      this.setData({ users: list });
      console.log('[DeviceAssignPage] Loaded users:', list.length);
    } catch (err) {
      console.error('[DeviceAssignPage] Load users failed:', err);
    } finally {
      this.setData({ loading: false });
    }
  },

  /**
   * 搜索用户
   */
  onSearchInput(e) {
    const keyword = e.detail.value;
    this.setData({ searchKeyword: keyword });

    // 防抖搜索
    if (this.searchTimer) {
      clearTimeout(this.searchTimer);
    }

    this.searchTimer = setTimeout(() => {
      this.loadUsers();
    }, 300);
  },

  /**
   * 选择用户
   */
  selectUser(e) {
    const userId = e.currentTarget.dataset.id;
    const user = this.data.users.find(u => u.id === userId);

    if (user) {
      this.setData({ selectedUser: user });
    }
  },

  /**
   * 确认分配
   */
  confirmAssign() {
    const { device, selectedUser } = this.data;

    if (!selectedUser) {
      wx.showToast({
        title: '请选择用户',
        icon: 'none'
      });
      return;
    }

    wx.showModal({
      title: '确认分配',
      content: `确定要将设备 "${device.device_id}" 分配给用户 "${selectedUser.nickname || '未知'}" 吗？`,
      confirmColor: '#1890FF',
      success: (res) => {
        if (res.confirm) {
          this.doAssign();
        }
      }
    });
  },

  /**
   * 执行分配
   */
  async doAssign() {
    if (this.data.assigning) return;

    this.setData({ assigning: true });
    wx.showLoading({ title: '分配中...' });

    try {
      await deviceService.assignDevice(
        this.data.deviceId,
        this.data.selectedUser.id,
        true // 设为主设备
      );

      wx.hideLoading();
      wx.showToast({
        title: '分配成功',
        icon: 'success'
      });

      // 返回上一页
      setTimeout(() => {
        wx.navigateBack();
      }, 1500);
    } catch (err) {
      wx.hideLoading();
      console.error('[DeviceAssignPage] Assign failed:', err);
      wx.showToast({
        title: err.message || '分配失败',
        icon: 'error'
      });
    } finally {
      this.setData({ assigning: false });
    }
  },

  /**
   * 取消
   */
  cancel() {
    wx.navigateBack();
  }
});
