/**
 * Device Card Component
 * 设备状态卡片组件
 *
 * Displays device connection status with three states:
 * - disconnected: Gray, shows "未连接设备"
 * - connected: Green, shows device info
 * - error: Red, shows connection error
 */

Component({
  /**
   * Component properties
   */
  properties: {
    // Connection status: 'disconnected' | 'connected' | 'error'
    status: {
      type: String,
      value: 'disconnected'
    },
    // Device information object
    deviceInfo: {
      type: Object,
      value: null
    },
    // Loading state
    loading: {
      type: Boolean,
      value: false
    },
    // Error message
    errorMessage: {
      type: String,
      value: ''
    }
  },

  /**
   * Component data
   */
  data: {
    statusText: '未连接设备',
    statusHint: '点击上方按钮连接树莓派',
    statusIconName: 'stethoscope',
    statusIconColor: '#999',
    showRetry: false
  },

  /**
   * Property observers
   */
  observers: {
    'status, deviceInfo, errorMessage': function(status, deviceInfo, errorMessage) {
      this.updateStatusDisplay(status, deviceInfo, errorMessage);
    }
  },

  /**
   * Component lifecycle
   */
  lifetimes: {
    attached() {
      this.updateStatusDisplay(
        this.properties.status,
        this.properties.deviceInfo,
        this.properties.errorMessage
      );
    }
  },

  /**
   * Component methods
   */
  methods: {
    /**
     * Update status display based on current state
     */
    updateStatusDisplay(status, deviceInfo, errorMessage) {
      let statusText = '';
      let statusHint = '';
      let statusIconName = '';
      let statusIconColor = '';
      let showRetry = false;

      switch (status) {
        case 'connected':
          statusText = deviceInfo ? deviceInfo.device_name : '心音智鉴设备';
          statusHint = deviceInfo
            ? `IP: ${deviceInfo.ip_address} | 固件: ${deviceInfo.firmware_version}`
            : '设备已连接';
          statusIconName = 'check-circle';
          statusIconColor = '#4CAF50';
          break;

        case 'error':
          statusText = '连接失败';
          statusHint = errorMessage || '请检查设备是否开机';
          statusIconName = 'alert';
          statusIconColor = '#F44336';
          showRetry = true;
          break;

        case 'disconnected':
        default:
          statusText = '未连接设备';
          statusHint = '点击上方按钮连接树莓派';
          statusIconName = 'stethoscope';
          statusIconColor = '#999';
          break;
      }

      this.setData({
        statusText,
        statusHint,
        statusIconName,
        statusIconColor,
        showRetry
      });
    },

    /**
     * Handle card tap
     */
    onTap() {
      const { status, loading } = this.properties;

      if (loading) return;

      if (status === 'connected') {
        // Show device options
        this.showDeviceOptions();
      } else if (status === 'error') {
        // Trigger retry
        this.triggerEvent('retry');
      } else {
        // Trigger connect
        this.triggerEvent('connect');
      }
    },

    /**
     * Handle retry button tap
     */
    onRetryTap() {
      this.triggerEvent('retry');
    },

    /**
     * Show device options action sheet
     */
    showDeviceOptions() {
      wx.showActionSheet({
        itemList: ['查看设备信息', '断开连接'],
        success: (res) => {
          if (res.tapIndex === 0) {
            this.triggerEvent('viewInfo');
          } else if (res.tapIndex === 1) {
            this.confirmDisconnect();
          }
        }
      });
    },

    /**
     * Confirm disconnect
     */
    confirmDisconnect() {
      wx.showModal({
        title: '断开连接',
        content: '确定要断开与设备的连接吗？',
        confirmText: '断开',
        confirmColor: '#F44336',
        success: (res) => {
          if (res.confirm) {
            this.triggerEvent('disconnect');
          }
        }
      });
    }
  }
});
