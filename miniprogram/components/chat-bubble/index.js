/**
 * Chat Bubble Component
 * 聊天气泡组件
 *
 * 支持用户消息和AI回复两种类型
 */

Component({
  properties: {
    // 消息内容
    content: {
      type: String,
      value: ''
    },
    // 气泡类型: user | ai
    type: {
      type: String,
      value: 'user'
    },
    // 时间戳
    timestamp: {
      type: Number,
      value: 0
    },
    // 加载状态 (AI正在输入)
    loading: {
      type: Boolean,
      value: false
    },
    // 是否显示免责声明
    showDisclaimer: {
      type: Boolean,
      value: false
    }
  },

  data: {
    formattedTime: ''
  },

  observers: {
    'timestamp': function(ts) {
      if (ts) {
        this.setData({
          formattedTime: this.formatTime(ts)
        });
      }
    }
  },

  methods: {
    /**
     * Format timestamp to HH:MM
     */
    formatTime(timestamp) {
      const date = new Date(timestamp);
      const hours = date.getHours().toString().padStart(2, '0');
      const minutes = date.getMinutes().toString().padStart(2, '0');
      return `${hours}:${minutes}`;
    }
  }
});
