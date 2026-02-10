/**
 * Emergency Contact Page
 * 紧急联系人设置页 - 输入/保存/删除/测试拨打
 */

const PHONE_REG = /^1\d{10}$/;

Page({
  data: {
    name: '',
    phone: '',
    hasContact: false
  },

  onLoad() {
    this.loadContact();
  },

  /**
   * Load saved contact from storage
   */
  loadContact() {
    const contact = wx.getStorageSync('emergencyContact');
    if (contact && contact.name && contact.phone) {
      this.setData({
        name: contact.name,
        phone: contact.phone,
        hasContact: true
      });
    }
  },

  /**
   * Handle name input
   */
  onNameInput(e) {
    this.setData({ name: e.detail.value.trim() });
  },

  /**
   * Handle phone input
   */
  onPhoneInput(e) {
    this.setData({ phone: e.detail.value.trim() });
  },

  /**
   * Save contact to storage
   */
  saveContact() {
    const { name, phone } = this.data;

    if (!name) {
      wx.showToast({ title: '请输入联系人姓名', icon: 'none' });
      return;
    }

    if (!PHONE_REG.test(phone)) {
      wx.showToast({ title: '请输入正确的11位手机号', icon: 'none' });
      return;
    }

    wx.setStorageSync('emergencyContact', { name, phone });
    this.setData({ hasContact: true });

    wx.showToast({ title: '保存成功', icon: 'success' });
    console.log('[EmergencyContact] Saved:', name, phone);
  },

  /**
   * Delete saved contact
   */
  deleteContact() {
    wx.showModal({
      title: '确认删除',
      content: `确定要删除紧急联系人「${this.data.name}」吗？`,
      confirmColor: '#C75450',
      success: (res) => {
        if (res.confirm) {
          wx.removeStorageSync('emergencyContact');
          this.setData({
            name: '',
            phone: '',
            hasContact: false
          });
          wx.showToast({ title: '已删除', icon: 'success' });
          console.log('[EmergencyContact] Deleted');
        }
      }
    });
  },

  /**
   * Test call the saved contact
   */
  testCall() {
    const { name, phone } = this.data;

    if (!phone) {
      wx.showToast({ title: '请先保存联系人', icon: 'none' });
      return;
    }

    wx.showModal({
      title: '测试拨打',
      content: `确定要拨打「${name}」(${phone}) 吗？`,
      confirmText: '拨打',
      confirmColor: '#C75450',
      success: (res) => {
        if (res.confirm) {
          wx.makePhoneCall({
            phoneNumber: phone,
            fail: (err) => {
              // User cancelled, not a real error
              if (err.errMsg && err.errMsg.indexOf('cancel') === -1) {
                console.error('[EmergencyContact] Call failed:', err);
              }
            }
          });
        }
      }
    });
  }
});
