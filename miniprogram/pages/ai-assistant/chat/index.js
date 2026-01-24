/**
 * AI Health Assistant Chat Page
 * AI健康助手问答页面
 *
 * Features:
 * - 流式响应显示
 * - 对话历史记录
 * - 快捷问题入口
 * - 检测结果关联
 */

const app = getApp();
const difyService = require('../../../services/dify');
const userService = require('../../../services/user');

// 快捷问题列表
const QUICK_QUESTIONS = [
  '我的检测结果正常吗？',
  '心音检测需要注意什么？',
  '如何保持心脏健康？',
  '什么情况下需要就医？'
];

Page({
  data: {
    messages: [],
    inputValue: '',
    loading: false,
    conversationId: null,
    quickQuestions: QUICK_QUESTIONS,
    showQuickQuestions: true,
    scrollToMessage: '',
    // 用户最近检测结果（作为上下文）
    latestDetection: null,
    // 免责声明
    disclaimer: '本助手仅提供健康建议，不能替代专业医疗诊断。如有不适，请及时就医。'
  },

  onLoad(options) {
    console.log('[ChatPage] Page loaded');

    // 如果从检测结果页进入，获取检测上下文
    if (options.fromDetection) {
      this.loadLatestDetection();
    }

    // 添加欢迎消息
    this.addWelcomeMessage();
  },

  onShow() {
    // 滚动到底部
    this.scrollToBottom();
  },

  /**
   * 加载最近检测结果作为上下文
   */
  async loadLatestDetection() {
    try {
      const userId = app.globalData.userId;
      if (!userId) return;

      const result = await userService.getDetectionRecords(userId, { page: 1, pageSize: 1 });
      if (result.data && result.data.length > 0) {
        this.setData({ latestDetection: result.data[0] });
        console.log('[ChatPage] Loaded latest detection for context');
      }
    } catch (error) {
      console.error('[ChatPage] Failed to load detection:', error);
    }
  },

  /**
   * 添加欢迎消息
   */
  addWelcomeMessage() {
    const welcomeMessage = {
      id: 'welcome',
      type: 'ai',
      content: '你好！我是心音健康助手，可以帮你解答心脏健康相关问题。\n\n你可以问我：\n• 检测结果的含义\n• 心脏保健建议\n• 何时需要就医\n\n有什么我可以帮助你的吗？',
      timestamp: Date.now(),
      showDisclaimer: false
    };

    this.setData({
      messages: [welcomeMessage]
    });
  },

  /**
   * 输入框内容变化
   */
  onInputChange(e) {
    this.setData({
      inputValue: e.detail.value
    });
  },

  /**
   * 点击快捷问题
   */
  onQuickQuestionTap(e) {
    const question = e.currentTarget.dataset.question;
    this.setData({
      inputValue: question,
      showQuickQuestions: false
    });
    this.sendMessage();
  },

  /**
   * 发送消息
   */
  async sendMessage() {
    const { inputValue, loading, conversationId, latestDetection } = this.data;

    if (!inputValue.trim() || loading) return;

    const userMessage = {
      id: `user-${Date.now()}`,
      type: 'user',
      content: inputValue.trim(),
      timestamp: Date.now()
    };

    // 添加用户消息
    const messages = [...this.data.messages, userMessage];

    // 添加AI加载状态
    const aiLoadingMessage = {
      id: `ai-${Date.now()}`,
      type: 'ai',
      content: '',
      timestamp: Date.now(),
      loading: true
    };
    messages.push(aiLoadingMessage);

    this.setData({
      messages,
      inputValue: '',
      loading: true,
      showQuickQuestions: false,
      scrollToMessage: aiLoadingMessage.id
    });

    try {
      // 构建输入上下文
      const inputs = {};
      if (latestDetection) {
        inputs.latest_detection = JSON.stringify({
          risk_level: latestDetection.risk_level,
          result_label: latestDetection.result_label,
          confidence: latestDetection.confidence,
          created_at: latestDetection.created_at
        });
      }

      // 调用Dify API
      const response = await difyService.sendChatMessage({
        message: userMessage.content,
        conversationId: conversationId,
        inputs: inputs,
        onMessage: (data) => {
          // 流式更新AI回复
          if (data.type === 'message') {
            this.updateAIMessage(aiLoadingMessage.id, data.fullContent);
          }
        }
      });

      // 更新最终回复
      this.finalizeAIMessage(aiLoadingMessage.id, response.answer, response.conversationId);

    } catch (error) {
      console.error('[ChatPage] Send message failed:', error);
      this.handleError(aiLoadingMessage.id, error);
    }
  },

  /**
   * 流式更新AI消息
   */
  updateAIMessage(messageId, content) {
    const messages = this.data.messages.map(msg => {
      if (msg.id === messageId) {
        return { ...msg, content, loading: false };
      }
      return msg;
    });
    this.setData({ messages });
  },

  /**
   * 完成AI消息
   */
  finalizeAIMessage(messageId, content, newConversationId) {
    const messages = this.data.messages.map(msg => {
      if (msg.id === messageId) {
        return {
          ...msg,
          content: content || '抱歉，我暂时无法回答这个问题。',
          loading: false,
          showDisclaimer: true
        };
      }
      return msg;
    });

    this.setData({
      messages,
      loading: false,
      conversationId: newConversationId || this.data.conversationId
    });

    this.scrollToBottom();
  },

  /**
   * 处理错误
   */
  handleError(messageId, error) {
    const errorMessage = error.message || '网络错误，请稍后重试';

    const messages = this.data.messages.map(msg => {
      if (msg.id === messageId) {
        return {
          ...msg,
          content: `抱歉，发生了错误：${errorMessage}`,
          loading: false,
          showDisclaimer: false
        };
      }
      return msg;
    });

    this.setData({
      messages,
      loading: false
    });

    wx.showToast({
      title: '发送失败',
      icon: 'none'
    });
  },

  /**
   * 滚动到底部
   */
  scrollToBottom() {
    const lastMessage = this.data.messages[this.data.messages.length - 1];
    if (lastMessage) {
      this.setData({
        scrollToMessage: lastMessage.id
      });
    }
  },

  /**
   * 清空对话
   */
  clearConversation() {
    wx.showModal({
      title: '清空对话',
      content: '确定要清空当前对话吗？',
      success: (res) => {
        if (res.confirm) {
          this.setData({
            messages: [],
            conversationId: null,
            showQuickQuestions: true
          });
          this.addWelcomeMessage();
        }
      }
    });
  },

  /**
   * 分享
   */
  onShareAppMessage() {
    return {
      title: '心音健康助手 - 智能健康问答',
      path: '/pages/ai-assistant/chat/index'
    };
  }
});
