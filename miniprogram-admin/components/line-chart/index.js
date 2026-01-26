/**
 * Line Chart Component
 * 折线图组件 - 基于Canvas 2D
 *
 * 轻量级实现，不依赖ECharts，适合小程序环境
 */

Component({
  properties: {
    // 图表数据 [{date: '01-15', count: 120}, ...]
    chartData: {
      type: Array,
      value: []
    },
    // 图表标题
    title: {
      type: String,
      value: ''
    },
    // 线条颜色
    lineColor: {
      type: String,
      value: '#1890FF'
    },
    // 填充颜色
    fillColor: {
      type: String,
      value: 'rgba(24, 144, 255, 0.1)'
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
    canvasHeight: 0
  },

  observers: {
    'chartData': function(chartData) {
      if (chartData && chartData.length > 0 && this.ctx) {
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
      if (this.ctx && this.properties.chartData && this.properties.chartData.length > 0) {
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
      query.select('#lineChart')
        .fields({ node: true, size: true })
        .exec((res) => {
          if (!res[0] || !res[0].node) {
            if (retryCount < maxRetries) {
              setTimeout(() => this.initCanvas(retryCount + 1), 200);
            } else {
              console.warn('[LineChart] Canvas init failed after retries');
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

          // 有数据就绘制
          if (this.properties.chartData && this.properties.chartData.length > 0) {
            this.drawChart();
          }

          console.log('[LineChart] Canvas initialized:', width, 'x', height);
        });
    },

    /**
     * 绘制图表
     */
    drawChart() {
      if (!this.ctx) return;

      const { chartData } = this.properties;
      const { canvasWidth, canvasHeight } = this.data;
      const ctx = this.ctx;
      const dpr = this._bindReadydpr || 1;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, canvasWidth, canvasHeight);

      if (!chartData || chartData.length === 0) return;

      // 图表边距
      const padding = {
        top: 20,
        right: 20,
        bottom: 40,
        left: 50
      };

      const chartWidth = canvasWidth - padding.left - padding.right;
      const chartHeight = canvasHeight - padding.top - padding.bottom;

      // 计算数据范围
      const values = chartData.map(d => d.count);
      const maxValue = Math.max(...values, 1);
      const minValue = 0;

      // 计算坐标点
      const points = chartData.map((item, index) => ({
        x: padding.left + (index / (chartData.length - 1)) * chartWidth,
        y: padding.top + chartHeight - ((item.count - minValue) / (maxValue - minValue)) * chartHeight
      }));

      // 绘制网格线
      this.drawGrid(ctx, padding, chartWidth, chartHeight, maxValue);

      // 绘制填充区域
      this.drawFill(ctx, points, padding, chartHeight);

      // 绘制折线
      this.drawLine(ctx, points);

      // 绘制数据点
      this.drawPoints(ctx, points);

      // 绘制X轴标签
      this.drawXLabels(ctx, chartData, padding, chartWidth, chartHeight);
    },

    /**
     * 绘制网格
     */
    drawGrid(ctx, padding, chartWidth, chartHeight, maxValue) {
      const gridLines = 4;

      ctx.strokeStyle = '#E8E8E8';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);

      for (let i = 0; i <= gridLines; i++) {
        const y = padding.top + (i / gridLines) * chartHeight;

        ctx.beginPath();
        ctx.moveTo(padding.left, y);
        ctx.lineTo(padding.left + chartWidth, y);
        ctx.stroke();

        // Y轴标签
        const value = Math.round(maxValue * (1 - i / gridLines));
        ctx.fillStyle = '#999999';
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(value.toString(), padding.left - 8, y + 4);
      }

      ctx.setLineDash([]);
    },

    /**
     * 绘制填充区域
     */
    drawFill(ctx, points, padding, chartHeight) {
      if (points.length < 2) return;

      ctx.beginPath();
      ctx.moveTo(points[0].x, padding.top + chartHeight);

      points.forEach(p => {
        ctx.lineTo(p.x, p.y);
      });

      ctx.lineTo(points[points.length - 1].x, padding.top + chartHeight);
      ctx.closePath();

      // 渐变填充
      const gradient = ctx.createLinearGradient(0, padding.top, 0, padding.top + chartHeight);
      gradient.addColorStop(0, 'rgba(24, 144, 255, 0.3)');
      gradient.addColorStop(1, 'rgba(24, 144, 255, 0.02)');
      ctx.fillStyle = gradient;
      ctx.fill();
    },

    /**
     * 绘制折线
     */
    drawLine(ctx, points) {
      if (points.length < 2) return;

      ctx.beginPath();
      ctx.strokeStyle = this.properties.lineColor;
      ctx.lineWidth = 2.5;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      points.forEach((p, i) => {
        if (i === 0) {
          ctx.moveTo(p.x, p.y);
        } else {
          ctx.lineTo(p.x, p.y);
        }
      });

      ctx.stroke();
    },

    /**
     * 绘制数据点
     */
    drawPoints(ctx, points) {
      points.forEach(p => {
        // 外圈
        ctx.beginPath();
        ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
        ctx.fillStyle = '#FFFFFF';
        ctx.fill();
        ctx.strokeStyle = this.properties.lineColor;
        ctx.lineWidth = 2;
        ctx.stroke();
      });
    },

    /**
     * 绘制X轴标签
     */
    drawXLabels(ctx, data, padding, chartWidth, chartHeight) {
      ctx.fillStyle = '#999999';
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'center';

      data.forEach((item, index) => {
        const x = padding.left + (index / (data.length - 1)) * chartWidth;
        const y = padding.top + chartHeight + 20;

        // 格式化日期显示
        let label = item.date;
        if (label.length > 5) {
          label = label.slice(-5); // 只显示 MM-DD
        }

        ctx.fillText(label, x, y);
      });
    }
  }
});
