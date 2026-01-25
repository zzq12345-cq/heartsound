/**
 * Devices Page - Device Management (Placeholder)
 * 设备管理页面 - 占位
 *
 * 详细功能将在 IMPL-008 中实现
 */

Page({
  data: {
    placeholder: true
  },

  onLoad() {
    console.log('[DevicesPage] Page loaded - placeholder');

    const app = getApp();
    if (!app.requireLogin()) {
      return;
    }
  }
});
