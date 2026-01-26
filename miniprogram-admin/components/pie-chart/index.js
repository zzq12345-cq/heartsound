/**
 * Pie Chart Component
 * 饼图组件 - 基于Canvas 2D
 *
 * 显示风险分布占比
 */

Component({
  properties: {
    // 饼图数据 {safe: 85.2, warning: 11.8, danger: 3.0}
    chartData: {
      type: Object,
      value: {}
    },
    // 图表标题
    title: {
      type: String,
      value: ''
    },
    // 高度(rpx)
    height: {
      type: Number,
      value: 300
    },
    // 是否加载中
    loading: {
      type: Boolean,
      value: false
    }
  },

  data: {
    canvasWidth: 0,
    canvasHeight: 0,
    legendItems: []
  },

  observers: {
    'chartData': function(chartData) {
      if (chartData && this.ctx) {
        this.drawChart();
      }
    }
  },

  lifetimes: {
    attached() {
      // 延迟初始化Canvas，确保DOM已经渲染完成
      wx.nextTick(() => {
        setTimeout(() => this.initCanvas(), 50);
      });
    },
    detached() {
      this.canvas = null;
      this.ctx = null;
    }
  },

  pageLifetimes: {
    show() {
      // 页面显示时重新绘制（从其他页面返回时）
      if (this.ctx && this.properties.chartData) {
        setTimeout(() => this.drawChart(), 100);
      }
    }
  },

  methods: {
    /**
     * 初始化Canvas
     */
    initCanvas(retryCount = 0) {
      const maxRetries = 3;
      const query = this.createSelectorQuery();
      query.select('#pieChart')
        .fields({ node: true, size: true })
        .exec((res) => {
          if (!res[0] || !res[0].node) {
            if (retryCount < maxRetries) {
              setTimeout(() => this.initCanvas(retryCount + 1), 200);
            } else {
              console.warn('[PieChart] Canvas init failed after retries');
            }
            return;
          }

          const canvas = res[0].node;
          const ctx = canvas.getContext('2d');
          const dpr = wx.getSystemInfoSync().pixelRatio;

          const width = res[0].width;
          const height = res[0].height;

          canvas.width = width * dpr;
          canvas.height = height * dpr;
          ctx.scale(dpr, dpr);

          this.canvas = canvas;
          this.ctx = ctx;
          this._bindReadydpr = dpr;
          this.setData({
            canvasWidth: width,
            canvasHeight: height
          });

          if (this.properties.chartData) {
            this.drawChart();
          }

          console.log('[PieChart] Canvas initialized:', width, 'x', height);
        });
    },

    /**
     * 绘制饼图
     */
    drawChart() {
      if (!this.ctx) return;

      const { chartData } = this.properties;
      const { canvasWidth, canvasHeight } = this.data;
      const ctx = this.ctx;
      const dpr = this._bindReadydpr || 1;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, canvasWidth, canvasHeight);

      // 颜色配置
      const colors = {
        safe: '#52C41A',
        warning: '#FAAD14',
        danger: '#FF4D4F'
      };

      const labels = {
        safe: '正常',
        warning: '需关注',
        danger: '请就医'
      };

      // 准备数据
      const items = [];
      let total = 0;

      Object.keys(chartData).forEach(key => {
        if (chartData[key] > 0) {
          items.push({
            key,
            value: chartData[key],
            color: colors[key] || '#999999',
            label: labels[key] || key
          });
          total += chartData[key];
        }
      });

      // 更新图例
      this.setData({
        legendItems: items.map(item => ({
          ...item,
          percent: item.value.toFixed(1) + '%'
        }))
      });

      if (items.length === 0 || total === 0) return;

      // 饼图参数
      const centerX = canvasWidth * 0.35;
      const centerY = canvasHeight / 2;
      const radius = Math.min(canvasWidth * 0.3, canvasHeight * 0.4);
      const innerRadius = radius * 0.5; // 环形图

      // 绘制扇形
      let startAngle = -Math.PI / 2; // 从12点钟方向开始

      items.forEach(item => {
        const sliceAngle = (item.value / total) * Math.PI * 2;
        const endAngle = startAngle + sliceAngle;

        // 绘制扇形
        ctx.beginPath();
        ctx.moveTo(centerX, centerY);
        ctx.arc(centerX, centerY, radius, startAngle, endAngle);
        ctx.closePath();
        ctx.fillStyle = item.color;
        ctx.fill();

        startAngle = endAngle;
      });

      // 绘制内圆（环形效果）
      ctx.beginPath();
      ctx.arc(centerX, centerY, innerRadius, 0, Math.PI * 2);
      ctx.fillStyle = '#FFFFFF';
      ctx.fill();

      // 中心文字 - 显示主要占比
      const mainItem = items.reduce((max, item) => item.value > max.value ? item : max, items[0]);
      ctx.fillStyle = '#333333';
      ctx.font = 'bold 14px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(mainItem.percent || '', centerX, centerY - 8);
      ctx.font = '11px sans-serif';
      ctx.fillStyle = '#666666';
      ctx.fillText(mainItem.label || '', centerX, centerY + 10);
    }
  }
});
