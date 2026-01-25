/**
 * Detection Recording Page
 * 录制页 - 30秒心音采集 (优化重构版)
 *
 * 修复记录:
 * - 修复回调函数未在onUnload时注销的问题
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
    // 已采集时间
    elapsedTime: 0,
    // 波形数据
    waveData: [],
    // 会话ID
    sessionId: null,
    // 阶段状态文字
    phaseText: '准备开始采集...',
    // 心率显示
    heartRate: '--',
    // 动态提示轮播
    tips: [
      { icon: 'quiet', text: '请保持安静，避免说话或移动' },
      { icon: 'breathe', text: '自然呼吸，放松身体' },
      { icon: 'pin', text: '保持听诊器位置不变' }
    ],
    currentTipIndex: 0,
    currentTip: { icon: 'quiet', text: '请保持安静，避免说话或移动' }
  },

  // 保存注销函数引用
  _unsubscribers: [],

  onLoad() {
    // 注册音频帧回调，保存注销函数
    const unsubAudio = detectionService.onAudioFrame((frame) => {
      this.handleAudioFrame(frame);
    });
    this._unsubscribers.push(unsubAudio);

    // 注册状态变化回调
    const unsubStatus = detectionService.onStatusChange((status) => {
      this.handleStatusChange(status);
    });
    this._unsubscribers.push(unsubStatus);

    // 注册错误回调
    const unsubError = detectionService.onError((error) => {
      this.handleError(error);
    });
    this._unsubscribers.push(unsubError);

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
      this.countdownTimer = null;
    }
    if (this.tipTimer) {
      clearInterval(this.tipTimer);
      this.tipTimer = null;
    }
    // 注销所有回调 - 修复关键！
    this._unsubscribers.forEach(unsub => {
      if (typeof unsub === 'function') {
        unsub();
      }
    });
    this._unsubscribers = [];
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
      phaseText: '开始检测心音...',
      countdown: this.data.totalDuration,
      elapsedTime: 0,
      progress: 0,
      progressRound: 0,
      currentTipIndex: 0,
      currentTip: this.data.tips[0]
    });

    try {
      // 开始检测会话
      const result = await detectionService.startDetection({ duration: this.data.totalDuration });
      const sessionId = typeof result === 'object' ? result.sessionId : result;
      this.setData({ sessionId });

      // 开始倒计时
      this.startCountdown();

      // 开始提示轮播
      this.startTipRotation();

    } catch (error) {
      console.error('开始录制失败:', error);
      this.handleError({ message: error.message || '录制启动失败' });
    }
  },

  /**
   * 倒计时 - 优化版
   */
  startCountdown() {
    this.countdownTimer = setInterval(() => {
      const newCountdown = this.data.countdown - 1;
      const elapsed = this.data.totalDuration - newCountdown;
      const progress = (elapsed / this.data.totalDuration) * 100;

      // 阶段性状态文字
      let phaseText = '正在采集心音...';
      if (elapsed <= 3) {
        phaseText = '开始检测心音...';
      } else if (newCountdown <= 5) {
        phaseText = '即将完成采集';
      } else if (elapsed >= 10 && elapsed <= 12) {
        phaseText = '信号采集中...';
      }

      if (newCountdown <= 0) {
        clearInterval(this.countdownTimer);
        this.finishRecording();
      } else {
        this.setData({
          countdown: newCountdown,
          elapsedTime: elapsed,
          progress,
          progressRound: Math.round(progress),
          phaseText
        });
      }
    }, 1000);
  },

  /**
   * 提示轮播
   */
  startTipRotation() {
    this.tipTimer = setInterval(() => {
      const nextIndex = (this.data.currentTipIndex + 1) % this.data.tips.length;
      this.setData({
        currentTipIndex: nextIndex,
        currentTip: this.data.tips[nextIndex]
      });
    }, 5000); // 每5秒切换一次提示
  },

  /**
   * 处理音频帧数据
   */
  handleAudioFrame(frame) {
    // 更新波形显示
    if (this.waveformComponent) {
      this.waveformComponent.drawWaveform(frame.waveform || frame.data);
    }

    // 更新心率
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
      recording: '正在采集心音...',
      processing: '采集完成，正在处理...'
    };

    if (statusMap[status]) {
      this.setData({ phaseText: statusMap[status] });
    }
  },

  /**
   * 处理错误
   */
  handleError(error) {
    clearInterval(this.countdownTimer);
    clearInterval(this.tipTimer);
    this.setData({
      isRecording: false,
      phaseText: '采集出错'
    });

    wx.showModal({
      title: '采集失败',
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
    clearInterval(this.tipTimer);
    this.setData({
      isRecording: false,
      progress: 100,
      progressRound: 100,
      elapsedTime: this.data.totalDuration,
      phaseText: '采集完成，正在分析...'
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
      content: '停止采集将无法获得分析结果，确定要停止吗？',
      success: (res) => {
        if (res.confirm) {
          clearInterval(this.countdownTimer);
          clearInterval(this.tipTimer);
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
