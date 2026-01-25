/**
 * Pie Chart Component
 * 饼图组件 - 基于Canvas 2D
 *
 * 显示风险分布占比
 */

Component({
  properties: {
    // 饼图数据 {safe: 85.2, warning: 11.8, danger: 3.0}
    data: {
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
    'data': function(data) {
      if (data && this.ctx) {
        this.drawChart();
      }
    }
  },

  lifetimes: {
    attached() {
      this.initCanvas();
    },
    detached() {
      this.canvas = null;
      this.ctx = null;
    }
  },

  methods: {
    /**
     * 初始化Canvas
     */
    initCanvas() {
      const query = this.createSelectorQuery();
      query.select('#pieChart')
        .fields({ node: true, size: true })
        .exec((res) => {
          if (!res[0] || !res[0].node) {
            console.error('[PieChart] Canvas not found');
            setTimeout(() => this.initCanvas(), 100);
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
          this.setData({
            canvasWidth: width,
            canvasHeight: height
          });

          if (this.properties.data) {
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

      const { data } = this.properties;
      const { canvasWidth, canvasHeight } = this.data;
      const ctx = this.ctx;

      // 清空画布
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

      Object.keys(data).forEach(key => {
        if (data[key] > 0) {
          items.push({
            key,
            value: data[key],
            color: colors[key] || '#999999',
            label: labels[key] || key
          });
          total += data[key];
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

      // 中心文字
      ctx.fillStyle = '#333333';
      ctx.font = 'bold 14px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('风险分布', centerX, centerY);
    }
  }
});
