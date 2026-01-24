/**
 * Result Card Component
 * 检测结果卡片组件 - 三种风险等级
 */

Component({
  properties: {
    // Detection result object
    result: {
      type: Object,
      value: null
    },
    // Show detailed probabilities
    showDetails: {
      type: Boolean,
      value: true
    },
    // Compact mode
    compact: {
      type: Boolean,
      value: false
    }
  },

  data: {
    riskLevel: 'safe',
    riskColor: '#4CAF50',
    riskBgColor: '#E8F5E9',
    riskIconName: 'check-circle',
    riskText: '正常',
    categoryLabel: '',
    confidence: 0,
    probabilities: []
  },

  observers: {
    'result': function(result) {
      if (result) {
        this.updateDisplay(result);
      }
    }
  },

  methods: {
    /**
     * Update display based on result
     */
    updateDisplay(result) {
      const riskLevel = result.risk_level || 'safe';

      // Risk level styling
      const riskConfig = {
        safe: {
          color: '#4CAF50',
          bgColor: '#E8F5E9',
          iconName: 'check-circle',
          text: '正常'
        },
        warning: {
          color: '#FF9800',
          bgColor: '#FFF3E0',
          iconName: 'warning',
          text: '需关注'
        },
        danger: {
          color: '#F44336',
          bgColor: '#FFEBEE',
          iconName: 'alert',
          text: '请就医'
        }
      };

      const config = riskConfig[riskLevel] || riskConfig.safe;

      // Format probabilities for display
      const probabilities = [];
      if (result.probabilities) {
        const labels = {
          normal: '正常心音',
          systolic_murmur: '收缩期杂音',
          diastolic_murmur: '舒张期杂音',
          extra_heart_sound: '额外心音',
          aortic_stenosis: '主动脉狭窄'
        };

        for (const [key, value] of Object.entries(result.probabilities)) {
          probabilities.push({
            key,
            label: labels[key] || key,
            value: typeof value === 'number' ? value.toFixed(1) : value,
            isTop: key === result.category
          });
        }

        // Sort by value descending
        probabilities.sort((a, b) => parseFloat(b.value) - parseFloat(a.value));
      }

      this.setData({
        riskLevel,
        riskColor: config.color,
        riskBgColor: config.bgColor,
        riskIconName: config.iconName,
        riskText: config.text,
        categoryLabel: result.label || '',
        confidence: result.confidence || 0,
        probabilities
      });
    },

    /**
     * Handle card tap
     */
    onTap() {
      this.triggerEvent('tap', { result: this.properties.result });
    }
  }
});
