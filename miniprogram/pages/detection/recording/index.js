/**
 * Detection Recording Page
 * 录制页 - 30秒心音采集
 */

const detectionService = require('../../../services/detection');

Page({
  data: {
    // 录制状态
    isRecording: false,
    isPaused: false,
    // 倒计时 (30秒)
    countdown: 30,
    totalDuration: 30,
    // 进度百分比
    progress: 0,
    progressRound: 0,
    // 波形数据
    waveData: [],
    // 会话ID
    sessionId: null,
    // 提示文字
    statusText: '准备开始录制...',
    // 心率显示 (如果可用)
    heartRate: '--'
  },

  onLoad() {
    // 注册音频帧回调
    detectionService.onAudioFrame((frame) => {
      this.handleAudioFrame(frame);
    });

    // 注册状态变化回调
    detectionService.onStatusChange((status) => {
      this.handleStatusChange(status);
    });

    // 注册错误回调
    detectionService.onError((error) => {
      this.handleError(error);
    });

    // 自动开始录制
    setTimeout(() => {
      this.startRecording();
    }, 1000);
  },

  onUnload() {
    // 停止录制
    if (this.data.isRecording) {
      detectionService.stopDetection();
    }
    // 清除定时器
    if (this.countdownTimer) {
      clearInterval(this.countdownTimer);
    }
  },

  /**
   * 开始录制
   */
  async startRecording() {
    const app = getApp();
    const deviceIP = app.globalData.deviceIP;

    if (!deviceIP) {
      wx.showModal({
        title: '错误',
        content: '设备未连接，请返回重新连接',
        showCancel: false,
        success: () => {
          wx.navigateBack();
        }
      });
      return;
    }

    this.setData({
      isRecording: true,
      statusText: '正在录制心音...',
      countdown: this.data.totalDuration,
      progress: 0,
      progressRound: 0
    });

    try {
      // 开始检测会话（不传deviceIP，服务内部会获取）
      const result = await detectionService.startDetection({ duration: this.data.totalDuration });

      // result可能是对象 {sessionId, websocketUrl}
      const sessionId = typeof result === 'object' ? result.sessionId : result;
      this.setData({ sessionId });

      // 开始倒计时
      this.startCountdown();

    } catch (error) {
      console.error('开始录制失败:', error);
      this.handleError({ message: error.message || '录制启动失败' });
    }
  },

  /**
   * 倒计时
   */
  startCountdown() {
    this.countdownTimer = setInterval(() => {
      const newCountdown = this.data.countdown - 1;
      const progress = ((this.data.totalDuration - newCountdown) / this.data.totalDuration) * 100;

      if (newCountdown <= 0) {
        // 录制完成
        clearInterval(this.countdownTimer);
        this.finishRecording();
      } else {
        this.setData({
          countdown: newCountdown,
          progress,
          progressRound: Math.round(progress)
        });

        // 最后5秒提示
        if (newCountdown <= 5) {
          this.setData({ statusText: `即将完成... ${newCountdown}秒` });
        }
      }
    }, 1000);
  },

  /**
   * 处理音频帧数据
   */
  handleAudioFrame(frame) {
    // 更新波形显示
    if (this.waveformComponent) {
      this.waveformComponent.drawWaveform(frame.waveform || frame.data);
    }

    // 更新心率 (如果数据中包含)
    if (frame.heartRate) {
      this.setData({ heartRate: frame.heartRate });
    }
  },

  /**
   * 处理状态变化
   */
  handleStatusChange(status) {
    const statusMap = {
      connecting: '正在连接设备...',
      recording: '正在录制心音...',
      processing: '录制完成，正在处理...'
    };

    if (statusMap[status]) {
      this.setData({ statusText: statusMap[status] });
    }
  },

  /**
   * 处理错误
   */
  handleError(error) {
    clearInterval(this.countdownTimer);
    this.setData({
      isRecording: false,
      statusText: '录制出错'
    });

    wx.showModal({
      title: '录制失败',
      content: error.message || '请检查设备连接后重试',
      showCancel: true,
      confirmText: '重试',
      cancelText: '返回',
      success: (res) => {
        if (res.confirm) {
          this.startRecording();
        } else {
          wx.navigateBack();
        }
      }
    });
  },

  /**
   * 完成录制
   */
  finishRecording() {
    this.setData({
      isRecording: false,
      progress: 100,
      progressRound: 100,
      statusText: '录制完成，正在分析...'
    });

    // 振动反馈
    wx.vibrateShort({ type: 'medium' });

    // 跳转到分析页
    setTimeout(() => {
      wx.redirectTo({
        url: `/pages/detection/analyzing/index?sessionId=${this.data.sessionId}`
      });
    }, 800);
  },

  /**
   * 手动停止录制
   */
  stopRecording() {
    wx.showModal({
      title: '确认停止',
      content: '停止录制将无法获得分析结果，确定要停止吗？',
      success: (res) => {
        if (res.confirm) {
          clearInterval(this.countdownTimer);
          detectionService.stopDetection();
          wx.navigateBack();
        }
      }
    });
  },

  /**
   * 获取波形组件实例
   */
  onWaveformReady(e) {
    this.waveformComponent = e.detail.component;
  }
});
