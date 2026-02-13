/**
 * Chat Bubble Component
 * 聊天气泡组件
 *
 * 支持用户消息和AI回复两种类型
 * 支持显示AI思考过程（可折叠）
 */

const { formatTime } = require('../../utils/date');

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
    },
    // 思考内容
    thinking: {
      type: String,
      value: ''
    },
    // 是否正在思考
    isThinking: {
      type: Boolean,
      value: false
    }
  },

  data: {
    formattedTime: '',
    thinkingExpanded: false
  },

  observers: {
    'timestamp': function(ts) {
      if (ts) {
        this.setData({
          formattedTime: formatTime(ts)
        });
      }
    }
  },

  methods: {
    /**
     * Toggle thinking content visibility
     */
    toggleThinking() {
      this.setData({
        thinkingExpanded: !this.data.thinkingExpanded
      });
    }
  }
});
