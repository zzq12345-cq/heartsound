/**
 * Waveform Component
 * 实时波形显示组件 - Canvas 2D高性能渲染 (优化版)
 *
 * 修复记录:
 * - 增强canvas初始化失败处理
 * - 添加重试机制
 */

Component({
  properties: {
    // Waveform data array (0-1 normalized values)
    waveData: {
      type: Array,
      value: []
    },
    // Wave color
    color: {
      type: String,
      value: '#1890FF'
    },
    // Second color for gradient effect
    colorSecondary: {
      type: String,
      value: '#36CFC9'
    },
    // Background color (transparent for overlay)
    bgColor: {
      type: String,
      value: 'transparent'
    },
    // Line width
    lineWidth: {
      type: Number,
      value: 2.5
    },
    // Show center line
    showCenterLine: {
      type: Boolean,
      value: true
    },
    // Show demo animation when no data
    showDemo: {
      type: Boolean,
      value: false
    },
    // Height in rpx
    height: {
      type: Number,
      value: 160
    }
  },

  data: {
    canvasWidth: 375,
    canvasHeight: 160,
    dpr: 1,
    initRetryCount: 0
  },

  lifetimes: {
    attached() {
      this.initCanvas();
    },

    detached() {
      this.stopAnimation();
      // 修复：清理所有资源
      this.canvas = null;
      this.ctx = null;
    }
  },

  observers: {
    'waveData': function(waveData) {
      if (waveData && waveData.length > 0 && this.ctx) {
        this.drawWaveform(waveData);
      }
    },
    'showDemo': function(showDemo) {
      if (showDemo && this.canvas) {
        this.startDemoAnimation();
      } else {
        this.stopAnimation();
      }
    }
  },

  methods: {
    /**
     * Initialize Canvas 2D context
     * 修复：添加重试机制
     */
    initCanvas() {
      const query = this.createSelectorQuery();
      query.select('#waveCanvas')
        .fields({ node: true, size: true })
        .exec((res) => {
          if (!res[0] || !res[0].node) {
            const retryCount = this.data.initRetryCount;
            if (retryCount < 3) {
              // 修复：canvas可能还没渲染，延迟重试
              console.warn('[Waveform] Canvas not found, retrying...', retryCount + 1);
              this.setData({ initRetryCount: retryCount + 1 });
              setTimeout(() => this.initCanvas(), 100);
            } else {
              console.error('[Waveform] Canvas not found after 3 retries');
              this.triggerEvent('error', { message: 'Canvas初始化失败' });
            }
            return;
          }

          const canvas = res[0].node;
          const ctx = canvas.getContext('2d');

          if (!ctx) {
            console.error('[Waveform] Failed to get 2d context');
            this.triggerEvent('error', { message: '获取Canvas上下文失败' });
            return;
          }

          const dpr = wx.getSystemInfoSync().pixelRatio;

          // Set canvas size
          const width = res[0].width;
          const height = res[0].height;

          canvas.width = width * dpr;
          canvas.height = height * dpr;
          ctx.scale(dpr, dpr);

          this.canvas = canvas;
          this.ctx = ctx;
          this.setData({
            canvasWidth: width,
            canvasHeight: height,
            dpr: dpr,
            initRetryCount: 0
          });

          // Draw initial empty state
          this.drawEmptyState();

          // Trigger ready event
          this.triggerEvent('ready', { component: this });

          // Auto-start demo if showDemo is true
          if (this.properties.showDemo) {
            setTimeout(() => this.startDemoAnimation(), 300);
          }

          console.log('[Waveform] Canvas initialized:', width, 'x', height);
        });
    },

    /**
     * Draw empty waveform state
     */
    drawEmptyState() {
      if (!this.ctx) return;

      const { canvasWidth, canvasHeight } = this.data;
      const ctx = this.ctx;

      // Clear canvas
      if (this.properties.bgColor === 'transparent') {
        ctx.clearRect(0, 0, canvasWidth, canvasHeight);
      } else {
        ctx.fillStyle = this.properties.bgColor;
        ctx.fillRect(0, 0, canvasWidth, canvasHeight);
      }

      // Draw center line
      if (this.properties.showCenterLine) {
        this.drawCenterLine();
      }
    },

    /**
     * Draw center reference line
     */
    drawCenterLine() {
      const { canvasWidth, canvasHeight } = this.data;
      const ctx = this.ctx;
      const centerY = canvasHeight / 2;

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(0, centerY);
      ctx.lineTo(canvasWidth, centerY);
      ctx.stroke();
      ctx.setLineDash([]);
    },

    /**
     * Draw waveform from data
     */
    drawWaveform(waveData) {
      if (!this.ctx || !waveData || waveData.length === 0) return;

      const { canvasWidth, canvasHeight } = this.data;
      const ctx = this.ctx;
      const centerY = canvasHeight / 2;
      const amplitude = canvasHeight * 0.4;

      // Clear canvas
      if (this.properties.bgColor === 'transparent') {
        ctx.clearRect(0, 0, canvasWidth, canvasHeight);
      } else {
        ctx.fillStyle = this.properties.bgColor;
        ctx.fillRect(0, 0, canvasWidth, canvasHeight);
      }

      // Draw center line
      if (this.properties.showCenterLine) {
        this.drawCenterLine();
      }

      const step = canvasWidth / (waveData.length - 1);

      // Draw glow layer first (behind main line)
      ctx.strokeStyle = this.properties.color + '30';
      ctx.lineWidth = this.properties.lineWidth + 6;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();

      for (let i = 0; i < waveData.length; i++) {
        const x = i * step;
        const normalizedValue = (waveData[i] - 0.5) * 2;
        const y = centerY - (normalizedValue * amplitude);

        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.stroke();

      // Draw main waveform line with gradient
      const gradient = ctx.createLinearGradient(0, 0, canvasWidth, 0);
      gradient.addColorStop(0, this.properties.color);
      gradient.addColorStop(0.5, this.properties.colorSecondary);
      gradient.addColorStop(1, this.properties.color);

      ctx.strokeStyle = gradient;
      ctx.lineWidth = this.properties.lineWidth;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      ctx.beginPath();

      for (let i = 0; i < waveData.length; i++) {
        const x = i * step;
        const normalizedValue = (waveData[i] - 0.5) * 2;
        const y = centerY - (normalizedValue * amplitude);

        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }

      ctx.stroke();
    },

    /**
     * Generate ECG-style heartbeat waveform (更真实的心电图风格)
     */
    generateDemoWaveform() {
      const points = 150;
      const waveData = [];
      const time = Date.now() / 1000;

      for (let i = 0; i < points; i++) {
        const x = i / points;
        const cyclePos = (x * 3 + time * 0.8) % 1; // 约72BPM节奏
        let value = 0.5;

        // P波 - 小驼峰 (心房除极)
        const pWave = Math.exp(-Math.pow((cyclePos - 0.1) * 25, 2)) * 0.06;

        // QRS波群 - 尖锐主峰 (心室除极)
        const qWave = -Math.exp(-Math.pow((cyclePos - 0.18) * 40, 2)) * 0.08; // Q波下沉
        const rWave = Math.exp(-Math.pow((cyclePos - 0.22) * 50, 2)) * 0.35;   // R波主峰
        const sWave = -Math.exp(-Math.pow((cyclePos - 0.26) * 40, 2)) * 0.1;  // S波下沉

        // T波 - 宽缓波 (心室复极)
        const tWave = Math.exp(-Math.pow((cyclePos - 0.4) * 12, 2)) * 0.12;

        value += pWave + qWave + rWave + sWave + tWave;

        // 添加微小噪声模拟真实信号
        value += (Math.random() - 0.5) * 0.015;

        waveData.push(Math.max(0.1, Math.min(0.9, value)));
      }

      return waveData;
    },

    /**
     * Start demo animation loop
     */
    startDemoAnimation() {
      if (this._animating) return; // 防止重复启动
      this._animating = true;

      const animate = () => {
        if (!this._animating) return;

        const demoData = this.generateDemoWaveform();
        this.drawWaveform(demoData);

        this._rafId = this.canvas.requestAnimationFrame(animate);
      };

      animate();
    },

    /**
     * Stop animation
     */
    stopAnimation() {
      this._animating = false;
      if (this._rafId && this.canvas) {
        this.canvas.cancelAnimationFrame(this._rafId);
        this._rafId = null;
      }
    },

    /**
     * Clear canvas
     */
    clear() {
      this.drawEmptyState();
    }
  }
});
