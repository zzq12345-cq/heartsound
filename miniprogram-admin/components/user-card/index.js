/**
 * User Card Component
 * 用户卡片组件 - 列表项展示
 */

Component({
  properties: {
    // 用户数据
    user: {
      type: Object,
      value: {}
    },
    // 是否显示箭头
    showArrow: {
      type: Boolean,
      value: true
    }
  },

  data: {
    defaultAvatar: '/static/images/default-avatar.svg'
  },

  methods: {
    /**
     * 点击卡片
     */
    onTap() {
      const { user } = this.properties;
      if (user && user.id) {
        this.triggerEvent('tap', { user });
      }
    }
  }
});
