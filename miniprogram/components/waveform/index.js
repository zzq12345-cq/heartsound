/**
 * Waveform Component
 * 实时波形显示组件 - Canvas 2D高性能渲染
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
    // Background color
    bgColor: {
      type: String,
      value: '#F5F7FA'
    },
    // Line width
    lineWidth: {
      type: Number,
      value: 2
    },
    // Show center line
    showCenterLine: {
      type: Boolean,
      value: true
    },
    // Animation enabled
    animated: {
      type: Boolean,
      value: true
    }
  },

  data: {
    canvasWidth: 375,
    canvasHeight: 200,
    dpr: 1
  },

  lifetimes: {
    attached() {
      this.initCanvas();
    },

    detached() {
      this.stopAnimation();
    }
  },

  observers: {
    'waveData': function(waveData) {
      if (waveData && waveData.length > 0) {
        this.drawWaveform(waveData);
      }
    }
  },

  methods: {
    /**
     * Initialize Canvas 2D context
     */
    initCanvas() {
      const query = this.createSelectorQuery();
      query.select('#waveCanvas')
        .fields({ node: true, size: true })
        .exec((res) => {
          if (!res[0]) {
            console.error('[Waveform] Canvas not found');
            return;
          }

          const canvas = res[0].node;
          const ctx = canvas.getContext('2d');
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
            dpr: dpr
          });

          // Draw initial empty state
          this.drawEmptyState();

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
      ctx.fillStyle = this.properties.bgColor;
      ctx.fillRect(0, 0, canvasWidth, canvasHeight);

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

      ctx.strokeStyle = '#DDD';
      ctx.lineWidth = 1;
      ctx.setLineDash([5, 5]);
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
      const amplitude = canvasHeight * 0.4; // 40% of height

      // Clear canvas
      ctx.fillStyle = this.properties.bgColor;
      ctx.fillRect(0, 0, canvasWidth, canvasHeight);

      // Draw center line
      if (this.properties.showCenterLine) {
        this.drawCenterLine();
      }

      // Draw waveform
      ctx.strokeStyle = this.properties.color;
      ctx.lineWidth = this.properties.lineWidth;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      ctx.beginPath();

      const step = canvasWidth / (waveData.length - 1);

      for (let i = 0; i < waveData.length; i++) {
        const x = i * step;
        // Normalize value to -1 to 1 range, then scale
        const normalizedValue = (waveData[i] - 0.5) * 2;
        const y = centerY - (normalizedValue * amplitude);

        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }

      ctx.stroke();

      // Draw glow effect
      ctx.strokeStyle = this.properties.color + '40';
      ctx.lineWidth = this.properties.lineWidth + 4;
      ctx.stroke();
    },

    /**
     * Generate demo waveform for testing
     */
    generateDemoWaveform() {
      const points = 100;
      const waveData = [];
      const time = Date.now() / 1000;

      for (let i = 0; i < points; i++) {
        const x = i / points;
        // Simulate heartbeat pattern
        const phase = (x + time) * 2 * Math.PI * 2;
        let value = 0.5;

        // S1 peak
        if (Math.sin(phase) > 0.9) {
          value += 0.3 * Math.random();
        }
        // S2 peak
        if (Math.sin(phase + 1.5) > 0.9) {
          value += 0.2 * Math.random();
        }
        // Noise
        value += (Math.random() - 0.5) * 0.1;

        waveData.push(Math.max(0, Math.min(1, value)));
      }

      return waveData;
    },

    /**
     * Start demo animation loop
     */
    startDemoAnimation() {
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
