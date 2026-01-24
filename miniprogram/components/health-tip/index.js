/**
 * Health Tip Component
 * 健康小贴士组件
 *
 * Displays health tips in a swiper carousel.
 */

Component({
  properties: {
    // Array of health tips
    tips: {
      type: Array,
      value: []
    },
    // Auto play interval (ms)
    interval: {
      type: Number,
      value: 5000
    },
    // Show indicator dots
    showDots: {
      type: Boolean,
      value: true
    }
  },

  data: {
    currentIndex: 0
  },

  methods: {
    /**
     * Handle swiper change
     */
    onSwiperChange(e) {
      this.setData({
        currentIndex: e.detail.current
      });
    },

    /**
     * Handle tip tap
     */
    onTipTap(e) {
      const { index } = e.currentTarget.dataset;
      const tip = this.properties.tips[index];
      if (tip) {
        this.triggerEvent('tipTap', { tip, index });
      }
    }
  }
});
