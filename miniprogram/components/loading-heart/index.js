/**
 * Loading Heart Component
 * 心跳加载动画组件
 */

Component({
  properties: {
    // Animation size (rpx)
    size: {
      type: Number,
      value: 240
    },
    // Primary color
    color: {
      type: String,
      value: '#2E8B8B'
    },
    // Loading text
    text: {
      type: String,
      value: '正在分析心音数据...'
    },
    // Show estimated time
    showTime: {
      type: Boolean,
      value: true
    },
    // Estimated seconds
    estimatedSeconds: {
      type: Number,
      value: 3
    }
  },

  data: {
    pulseScale: 1
  },

  lifetimes: {
    attached() {
      // Animation is handled by CSS
    }
  }
});
