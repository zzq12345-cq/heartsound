/**
 * Stat Card Component
 * 统计卡片组件
 *
 * 显示核心指标数值和增长率
 */

Component({
  properties: {
    // 卡片标题
    title: {
      type: String,
      value: ''
    },
    // 主数值
    value: {
      type: Number,
      value: 0
    },
    // 增长率（百分比）
    trend: {
      type: Number,
      value: null
    },
    // 副标题（可选）
    subtitle: {
      type: String,
      value: ''
    },
    // 图标类型
    icon: {
      type: String,
      value: 'default'
    },
    // 卡片颜色主题
    theme: {
      type: String,
      value: 'primary' // primary, success, warning, danger
    },
    // 是否加载中
    loading: {
      type: Boolean,
      value: false
    }
  },

  data: {
    formattedValue: '0',
    trendIcon: '',
    trendClass: '',
    _ready: false
  },

  observers: {
    'value, trend': function(value, trend) {
      // 组件未就绪时不执行，避免 _getData 报错
      if (!this.data._ready) return;
      this.updateDisplay(value, trend);
    }
  },

  lifetimes: {
    attached() {
      // 延迟标记就绪，确保组件完全初始化
      wx.nextTick(() => {
        this.setData({ _ready: true });
        this.updateDisplay(this.properties.value, this.properties.trend);
      });
    },
    detached() {
      this.setData({ _ready: false });
    }
  },

  methods: {
    /**
     * 更新显示数据
     */
    updateDisplay(value, trend) {
      // 格式化大数字
      const formattedValue = this.formatNumber(value);

      // 判断趋势
      let trendIcon = '';
      let trendClass = '';

      if (trend !== null && trend !== undefined) {
        if (trend > 0) {
          trendIcon = '↑';
          trendClass = 'trend-up';
        } else if (trend < 0) {
          trendIcon = '↓';
          trendClass = 'trend-down';
        } else {
          trendIcon = '→';
          trendClass = 'trend-flat';
        }
      }

      this.setData({
        formattedValue,
        trendIcon,
        trendClass
      });
    },

    /**
     * 格式化数字（千分位分隔）
     */
    formatNumber(num) {
      if (num === null || num === undefined) return '0';

      if (num >= 10000) {
        return (num / 10000).toFixed(1) + 'w';
      } else if (num >= 1000) {
        return num.toLocaleString();
      }

      return num.toString();
    },

    /**
     * 卡片点击
     */
    onTap() {
      this.triggerEvent('cardtap');
    }
  }
});
