/**
 * Detection Result Page
 * 结果展示页 - 风险分级展示
 */

const userService = require('../../../services/user');
const app = getApp();

Page({
  data: {
    sessionId: null,
    result: null,
    // 显示状态
    showAnimation: false,
    // 分享按钮
    showShare: false,
    // 健康建议
    suggestions: [],
    // 免责声明
    disclaimer: '本检测结果仅供参考，不能作为医学诊断依据。如有不适，请及时就医。',
    // 紧急联系人
    emergencyContact: null,
    showEmergencyBtn: false
  },

  onLoad(options) {
    const sessionId = options.sessionId;
    this.setData({ sessionId });

    // 获取缓存的结果
    const cachedResult = wx.getStorageSync('detectionResult');
    if (cachedResult) {
      // cachedResult 结构是 { status: 'completed', result: {...} }
      const resultData = cachedResult.result || cachedResult;
      this.displayResult(resultData);
      // 清除缓存
      wx.removeStorageSync('detectionResult');
    } else {
      // 从服务获取结果
      this.fetchResult(sessionId);
    }
  },

  onShow() {
    // 延迟显示动画
    setTimeout(() => {
      this.setData({ showAnimation: true });
    }, 300);
  },

  /**
   * 获取检测结果
   */
  async fetchResult(sessionId) {
    wx.showLoading({ title: '加载中...' });

    try {
      // 这里应该调用API获取结果
      // 暂时使用模拟数据
      const mockResult = this.getMockResult();
      this.displayResult(mockResult);
    } catch (error) {
      wx.showToast({
        title: '加载失败',
        icon: 'none'
      });
    } finally {
      wx.hideLoading();
    }
  },

  /**
   * 显示结果
   */
  displayResult(result) {
    // 生成健康建议
    const suggestions = this.generateSuggestions(result);

    // 读取紧急联系人
    const emergencyContact = wx.getStorageSync('emergencyContact') || null;
    const isDanger = result.risk_level === 'danger';

    this.setData({
      result,
      suggestions,
      showShare: true,
      emergencyContact,
      showEmergencyBtn: isDanger
    });

    // 保存到历史记录
    this.saveToHistory(result);

    // danger级别且已设置联系人，延迟1秒弹窗提示拨打
    if (isDanger && emergencyContact) {
      setTimeout(() => {
        this.showEmergencyCallModal(emergencyContact);
      }, 1000);
    }
  },

  /**
   * 弹窗提示拨打紧急联系人
   */
  showEmergencyCallModal(contact) {
    wx.showModal({
      title: '检测到异常',
      content: `是否拨打紧急联系人「${contact.name}」(${contact.phone})？`,
      confirmText: '立即拨打',
      confirmColor: '#C75450',
      success: (res) => {
        if (res.confirm) {
          this.callEmergencyContact();
        }
      }
    });
  },

  /**
   * 拨打紧急联系人
   */
  callEmergencyContact() {
    const contact = this.data.emergencyContact;
    if (!contact || !contact.phone) return;

    wx.makePhoneCall({
      phoneNumber: contact.phone,
      fail: (err) => {
        if (err.errMsg && err.errMsg.indexOf('cancel') === -1) {
          console.error('[Result] Emergency call failed:', err);
        }
      }
    });
  },

  /**
   * 跳转设置紧急联系人
   */
  goSetEmergencyContact() {
    wx.navigateTo({
      url: '/pages/emergency-contact/index'
    });
  },

  /**
   * 生成健康建议
   */
  generateSuggestions(result) {
    const riskLevel = result.risk_level || 'safe';

    const suggestionMap = {
      safe: [
        { iconName: 'check-circle', iconColor: '#3CB371', text: '心音检测结果正常，请继续保持健康的生活方式' },
        { iconName: 'heart-pulse', iconColor: '#4A90D9', text: '建议每周进行3-5次中等强度有氧运动' },
        { iconName: 'breathe', iconColor: '#5B7FA5', text: '保持规律作息，每天睡眠7-8小时' },
        { iconName: 'clipboard', iconColor: '#D4A24C', text: '建议每3个月进行一次心音检测' }
      ],
      warning: [
        { iconName: 'warning', iconColor: '#D4A24C', text: '检测到轻微异常，建议密切关注' },
        { iconName: 'medical', iconColor: '#C75450', text: '建议近期前往医院进行详细检查' },
        { iconName: 'clipboard', iconColor: '#4A90D9', text: '记录日常身体状况，如有不适及时就医' },
        { iconName: 'breathe', iconColor: '#3CB371', text: '避免剧烈运动，保持心情平和' }
      ],
      danger: [
        { iconName: 'alert', iconColor: '#C75450', text: '检测到明显异常，请尽快就医' },
        { iconName: 'medical', iconColor: '#C75450', text: '建议立即前往心内科进行专业检查' },
        { iconName: 'target', iconColor: '#C75450', text: '如有胸闷、心悸等症状，请拨打120' },
        { iconName: 'warning', iconColor: '#D4A24C', text: '在就医前避免剧烈活动' }
      ]
    };

    return suggestionMap[riskLevel] || suggestionMap.safe;
  },

  /**
   * 保存到历史记录
   * 同时保存到本地和Supabase云端
   * 修复：使用正确的字段名 device_id
   */
  async saveToHistory(result) {
    try {
      // 1. 保存到本地Storage作为缓存
      let history = wx.getStorageSync('detectionHistory') || [];
      history.unshift({
        ...result,
        timestamp: Date.now(),
        sessionId: this.data.sessionId
      });
      if (history.length > 50) {
        history = history.slice(0, 50);
      }
      wx.setStorageSync('detectionHistory', history);

      // 2. 同步到Supabase云端（如果用户已登录）
      const userId = app.globalData.userId;
      const deviceInfo = app.globalData.deviceInfo;

      if (userId) {
        const recordData = {
          ...result,
          session_id: this.data.sessionId,
          duration_seconds: 30
        };

        // 注意：device_id 需要是 devices 表的 UUID 主键
        // 模拟设备没有真实的数据库记录，传 null
        // 真实设备应该有 db_id 字段（设备注册时获取）
        const isMockDevice = deviceInfo?.device_id?.startsWith('00000000-') ||
                             deviceInfo?.device_name?.includes('模拟');
        const dbDeviceId = isMockDevice ? null : (deviceInfo?.db_id || null);

        await userService.saveDetectionRecord(
          userId,
          dbDeviceId,
          recordData
        );
        console.log('[Result] 检测记录已同步到云端');
      } else {
        console.warn('[Result] 用户未登录，仅保存到本地');
      }
    } catch (error) {
      console.error('[Result] 保存历史记录失败:', error);
      // 本地已保存，云端失败不影响用户体验
    }
  },

  /**
   * 模拟结果数据
   */
  getMockResult() {
    return {
      risk_level: 'safe',
      category: 'normal',
      label: '正常心音',
      confidence: 92.5,
      probabilities: {
        normal: 92.5,
        systolic_murmur: 3.2,
        diastolic_murmur: 2.1,
        extra_heart_sound: 1.5,
        aortic_stenosis: 0.7
      },
      timestamp: Date.now()
    };
  },

  /**
   * 再次检测
   */
  detectAgain() {
    wx.redirectTo({
      url: '/pages/detection/prepare/index'
    });
  },

  /**
   * 返回首页
   */
  goHome() {
    wx.switchTab({
      url: '/pages/index/index'
    });
  },

  /**
   * 查看历史记录
   */
  viewHistory() {
    wx.switchTab({
      url: '/pages/records/index'
    });
  },

  /**
   * 分享结果
   */
  shareResult() {
    // 小程序分享功能
    wx.showShareMenu({
      withShareTicket: true,
      menus: ['shareAppMessage', 'shareTimeline']
    });
  },

  /**
   * 咨询AI助手
   */
  consultAI() {
    // TabBar页面不支持navigateTo带参数，通过globalData传递
    const app = getApp();
    app.globalData.pendingDetectionContext = this.data.result;

    wx.switchTab({
      url: '/pages/ai-assistant/chat/index'
    });
  },

  /**
   * 分享给朋友
   */
  onShareAppMessage() {
    const result = this.data.result;
    const riskText = {
      safe: '正常',
      warning: '需关注',
      danger: '请就医'
    };

    return {
      title: `心音检测结果：${riskText[result?.risk_level] || '正常'}`,
      path: '/pages/index/index',
      imageUrl: '/static/images/share-cover.png'
    };
  }
});
