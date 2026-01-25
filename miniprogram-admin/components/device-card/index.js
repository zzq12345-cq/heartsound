/**
 * Device Card Component
 * 设备卡片组件 - 列表项展示
 */

Component({
  properties: {
    // 设备数据
    device: {
      type: Object,
      value: {}
    },
    // 是否显示箭头
    showArrow: {
      type: Boolean,
      value: true
    }
  },

  data: {},

  methods: {
    /**
     * 点击卡片
     */
    onTap() {
      const { device } = this.properties;
      if (device && device.id) {
        this.triggerEvent('tap', { device });
      }
    },

    /**
     * 获取状态文字和样式
     */
    getStatusInfo() {
      const { device } = this.properties;
      if (device.is_online) {
        return { text: '在线', class: 'online' };
      } else if (device.assigned_user) {
        return { text: '离线', class: 'offline' };
      } else {
        return { text: '未分配', class: 'unassigned' };
      }
    }
  }
});
