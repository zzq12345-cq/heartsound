/**
 * Detection Analyzing Page
 * 分析中页 - AI推理加载动画
 */

const detectionService = require('../../../services/detection');

Page({
  data: {
    sessionId: null,
    // 分析阶段
    stages: [
      { key: 'processing', label: '音频预处理', icon: '🔊', status: 'pending' },
      { key: 'feature', label: '特征提取', icon: '📊', status: 'pending' },
      { key: 'inference', label: 'AI模型分析', icon: '🤖', status: 'pending' },
      { key: 'result', label: '生成报告', icon: '📋', status: 'pending' }
    ],
    currentStage: 0,
    // 加载文案
    loadingText: '正在分析心音数据',
    // 预计时间
    estimatedTime: '约5秒',
    // 轮询计数
    pollCount: 0,
    maxPollCount: 30 // 最多轮询30次，每次500ms
  },

  onLoad(options) {
    const sessionId = options.sessionId;
    if (!sessionId) {
      wx.showToast({
        title: '会话ID缺失',
        icon: 'none'
      });
      setTimeout(() => wx.navigateBack(), 1500);
      return;
    }

    this.setData({ sessionId });
    // 开始模拟分析进度
    this.startAnalysis();
  },

  onUnload() {
    if (this.stageTimer) {
      clearTimeout(this.stageTimer);
    }
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
    }
  },

  /**
   * 开始分析
   */
  startAnalysis() {
    // 更新第一阶段
    this.updateStage(0, 'active');

    // 模拟阶段进度
    this.simulateProgress();

    // 开始轮询结果
    this.pollResult();
  },

  /**
   * 模拟分析进度（纯UI效果）
   */
  simulateProgress() {
    const stageDurations = [1200, 1500, 2000, 1000]; // 每阶段持续时间
    let stageIndex = 0;

    const advanceStage = () => {
      if (stageIndex < this.data.stages.length - 1) {
        this.updateStage(stageIndex, 'completed');
        stageIndex++;
        this.updateStage(stageIndex, 'active');
        this.setData({ currentStage: stageIndex });

        // 更新加载文案
        const loadingTexts = [
          '正在预处理音频...',
          '正在提取心音特征...',
          'AI模型正在分析...',
          '正在生成分析报告...'
        ];
        this.setData({ loadingText: loadingTexts[stageIndex] });

        this.stageTimer = setTimeout(advanceStage, stageDurations[stageIndex]);
      }
    };

    this.stageTimer = setTimeout(advanceStage, stageDurations[0]);
  },

  /**
   * 更新阶段状态
   */
  updateStage(index, status) {
    const stages = this.data.stages;
    stages[index].status = status;
    this.setData({ stages });
  },

  /**
   * 轮询获取结果
   */
  async pollResult() {
    const { sessionId, pollCount, maxPollCount } = this.data;

    if (pollCount >= maxPollCount) {
      this.handleTimeout();
      return;
    }

    try {
      const result = await detectionService.pollResult(sessionId);

      if (result && result.status === 'completed') {
        // 分析完成，跳转结果页
        this.handleComplete(result);
      } else if (result && result.status === 'error') {
        // 分析出错
        this.handleError(result.error);
      } else {
        // 继续轮询
        this.setData({ pollCount: pollCount + 1 });
        this.pollTimer = setTimeout(() => this.pollResult(), 500);
      }
    } catch (error) {
      console.error('轮询结果失败:', error);
      // 网络错误，继续重试
      this.setData({ pollCount: pollCount + 1 });
      this.pollTimer = setTimeout(() => this.pollResult(), 1000);
    }
  },

  /**
   * 处理分析完成
   */
  handleComplete(result) {
    // 完成所有阶段
    this.data.stages.forEach((_, index) => {
      this.updateStage(index, 'completed');
    });

    this.setData({
      loadingText: '分析完成！',
      estimatedTime: ''
    });

    // 振动反馈
    wx.vibrateShort({ type: 'medium' });

    // 跳转到结果页
    setTimeout(() => {
      // 将结果存入缓存
      wx.setStorageSync('detectionResult', result);
      wx.redirectTo({
        url: `/pages/detection/result/index?sessionId=${this.data.sessionId}`
      });
    }, 800);
  },

  /**
   * 处理超时
   */
  handleTimeout() {
    wx.showModal({
      title: '分析超时',
      content: '服务器响应超时，请稍后重试',
      showCancel: false,
      success: () => {
        wx.navigateBack({ delta: 2 });
      }
    });
  },

  /**
   * 处理错误
   */
  handleError(error) {
    wx.showModal({
      title: '分析失败',
      content: error?.message || '心音分析过程中出现错误',
      showCancel: true,
      confirmText: '重试',
      cancelText: '返回',
      success: (res) => {
        if (res.confirm) {
          this.setData({ pollCount: 0 });
          this.startAnalysis();
        } else {
          wx.navigateBack({ delta: 2 });
        }
      }
    });
  },

  /**
   * 取消分析
   */
  cancelAnalysis() {
    wx.showModal({
      title: '确认取消',
      content: '确定要取消分析吗？',
      success: (res) => {
        if (res.confirm) {
          wx.navigateBack({ delta: 2 });
        }
      }
    });
  }
});
