/**
 * AI Health Assistant Chat Page
 * AI健康助手问答页面
 *
 * Features:
 * - 流式响应显示
 * - 对话历史记录（侧滑抽屉）
 * - 会话切换 / 新建 / 删除
 * - 快捷问题入口
 * - 检测结果关联
 */

const app = getApp();
const difyService = require('../../../services/dify');
const userService = require('../../../services/user');
const { formatTimeLabel } = require('../../../utils/date');

// Quick questions
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
    latestDetection: null,
    disclaimer: '本助手仅提供健康建议，不能替代专业医疗诊断。如有不适，请及时就医。',
    // History drawer
    showHistory: false,
    conversations: [],
    historyLoading: false
  },

  onLoad(options) {
    console.log('[ChatPage] Page loaded');
    this.addWelcomeMessage();
  },

  onShow() {
    // Check for detection context from result page
    const pendingContext = app.globalData.pendingDetectionContext;
    if (pendingContext) {
      console.log('[ChatPage] Received detection context from result page');
      this.setData({ latestDetection: pendingContext });
      app.globalData.pendingDetectionContext = null;
      this.autoAskAboutDetection(pendingContext);
    }

    this.scrollToBottom();
  },

  // ==================== History Drawer ====================

  /**
   * Open history drawer and load conversations
   */
  openHistory() {
    this.setData({ showHistory: true });
    this.loadConversations();
  },

  /**
   * Close history drawer
   */
  closeHistory() {
    this.setData({ showHistory: false });
  },

  /**
   * Load conversation list from Dify
   */
  async loadConversations() {
    if (this.data.historyLoading) return;

    this.setData({ historyLoading: true });

    try {
      const result = await difyService.getConversations({ limit: 30 });
      const conversations = (result.data || []).map(conv => ({
        ...conv,
        timeLabel: formatTimeLabel(conv.updated_at || conv.created_at)
      }));

      this.setData({ conversations, historyLoading: false });
      console.log('[ChatPage] Loaded conversations:', conversations.length);
    } catch (error) {
      console.error('[ChatPage] Load conversations failed:', error);
      this.setData({ historyLoading: false });
    }
  },

  /**
   * Switch to an existing conversation
   */
  async switchConversation(e) {
    const conversationId = e.currentTarget.dataset.id;
    if (conversationId === this.data.conversationId) {
      this.closeHistory();
      return;
    }

    this.setData({
      conversationId,
      messages: [],
      showQuickQuestions: false,
      showHistory: false,
      loading: true
    });

    // Add welcome message placeholder
    this.addWelcomeMessage();

    try {
      // Load messages from Dify
      const history = await difyService.getConversationHistory(conversationId);

      if (history && history.length > 0) {
        const messages = [];

        history.forEach(msg => {
          // User message
          if (msg.query) {
            messages.push({
              id: `user-${msg.id || Date.now()}`,
              type: 'user',
              content: msg.query,
              timestamp: new Date(msg.created_at).getTime()
            });
          }
          // AI response
          if (msg.answer) {
            messages.push({
              id: `ai-${msg.id || Date.now()}`,
              type: 'ai',
              content: this.filterThinking(msg.answer),
              timestamp: new Date(msg.created_at).getTime(),
              showDisclaimer: true
            });
          }
        });

        this.setData({ messages, loading: false });
      } else {
        this.setData({ loading: false });
      }

      this.scrollToBottom();
      console.log('[ChatPage] Switched to conversation:', conversationId);
    } catch (error) {
      console.error('[ChatPage] Load history failed:', error);
      this.setData({ loading: false });
      wx.showToast({ title: '加载历史失败', icon: 'none' });
    }
  },

  /**
   * Filter thinking tags from content
   */
  filterThinking(text) {
    if (!text) return text;
    let filtered = text.replace(/<think>[\s\S]*?<\/think>/gi, '');
    filtered = filtered.replace(/<think>[\s\S]*/gi, '');
    return filtered.trimStart();
  },

  /**
   * Start a new chat session
   */
  startNewChat() {
    this.setData({
      messages: [],
      conversationId: null,
      showQuickQuestions: true,
      showHistory: false,
      inputValue: '',
      loading: false,
      latestDetection: null
    });

    this.addWelcomeMessage();
    console.log('[ChatPage] Started new chat');
  },

  /**
   * Delete a conversation
   */
  deleteConversation(e) {
    const conversationId = e.currentTarget.dataset.id;

    wx.showModal({
      title: '删除对话',
      content: '确定删除这条对话记录？',
      confirmColor: '#C75450',
      success: async (res) => {
        if (!res.confirm) return;

        try {
          await difyService.deleteConversation(conversationId);

          // Remove from list
          const conversations = this.data.conversations.filter(
            c => c.id !== conversationId
          );
          this.setData({ conversations });

          // If deleted conversation is current, start new chat
          if (conversationId === this.data.conversationId) {
            this.startNewChat();
          }

          wx.showToast({ title: '已删除', icon: 'none' });
        } catch (error) {
          console.error('[ChatPage] Delete failed:', error);
          wx.showToast({ title: '删除失败', icon: 'none' });
        }
      }
    });
  },

  /**
   * Long press conversation for more actions
   */
  onConversationLongPress(e) {
    const conversationId = e.currentTarget.dataset.id;
    const conv = this.data.conversations.find(c => c.id === conversationId);

    wx.showActionSheet({
      itemList: ['重命名', '删除'],
      success: (res) => {
        if (res.tapIndex === 0) {
          this.renameConversation(conversationId, conv?.name || '');
        } else if (res.tapIndex === 1) {
          this.deleteConversation({ currentTarget: { dataset: { id: conversationId } } });
        }
      }
    });
  },

  /**
   * Rename a conversation
   */
  renameConversation(conversationId, currentName) {
    // WeChat doesn't have a native prompt dialog, use modal workaround
    wx.showModal({
      title: '重命名对话',
      content: currentName || '新对话',
      editable: true,
      placeholderText: '输入新名称',
      success: async (res) => {
        if (!res.confirm || !res.content?.trim()) return;

        try {
          await difyService.renameConversation(conversationId, res.content.trim());

          const conversations = this.data.conversations.map(c => {
            if (c.id === conversationId) {
              return { ...c, name: res.content.trim() };
            }
            return c;
          });
          this.setData({ conversations });
        } catch (error) {
          console.error('[ChatPage] Rename failed:', error);
          wx.showToast({ title: '重命名失败', icon: 'none' });
        }
      }
    });
  },

  // ==================== Chat Logic ====================

  /**
   * Auto-ask about detection result
   */
  autoAskAboutDetection(detection) {
    const riskText = detection.risk_level === 'safe' ? '正常' :
                     detection.risk_level === 'warning' ? '需关注' : '高风险';
    const label = detection.label || '心音检测';
    const confidence = detection.confidence ? `${detection.confidence.toFixed(1)}%` : '未知';

    const message = `我刚完成了心音检测，检测结果如下：
- 结果：${label}
- 风险等级：${riskText}
- 置信度：${confidence}

请根据以上检测结果，给我一些健康建议。`;

    setTimeout(() => {
      this.setData({ inputValue: message });
      this.sendMessage();
    }, 500);
  },

  /**
   * Load latest detection for context
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
   * Add welcome message
   */
  addWelcomeMessage() {
    const welcomeMessage = {
      id: 'welcome',
      type: 'ai',
      content: '你好！我是心音健康助手，可以帮你解答心脏健康相关问题。\n\n你可以问我：\n• 检测结果的含义\n• 心脏保健建议\n• 何时需要就医\n\n有什么我可以帮助你的吗？',
      timestamp: Date.now(),
      showDisclaimer: false
    };

    this.setData({ messages: [welcomeMessage] });
  },

  /**
   * Input change handler
   */
  onInputChange(e) {
    this.setData({ inputValue: e.detail.value });
  },

  /**
   * Quick question tap
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
   * Send message
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

    const messages = [...this.data.messages, userMessage];

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
      const inputs = {};
      if (latestDetection) {
        const detectionContext = {
          risk_level: latestDetection.risk_level || 'unknown',
          label: latestDetection.label || latestDetection.result_label || '未知',
          category: latestDetection.category || 'unknown',
          confidence: latestDetection.confidence || 0,
          created_at: latestDetection.created_at || new Date().toISOString(),
          probabilities: latestDetection.probabilities || null
        };
        inputs.latest_detection = JSON.stringify(detectionContext);
        console.log('[ChatPage] Sending detection context:', detectionContext);
      }

      const response = await difyService.sendChatMessage({
        message: userMessage.content,
        conversationId: conversationId,
        inputs: inputs,
        onMessage: (data) => {
          if (data.type === 'message') {
            this.updateAIMessage(aiLoadingMessage.id, {
              content: data.fullContent,
              thinking: data.thinking || '',
              isThinking: data.isThinking || false
            });
          }
        }
      });

      this.finalizeAIMessage(aiLoadingMessage.id, response.answer, response.conversationId);

    } catch (error) {
      console.error('[ChatPage] Send message failed:', error);
      this.handleError(aiLoadingMessage.id, error);
    }
  },

  /**
   * Stream update AI message (optimized with path update + throttle)
   */
  updateAIMessage(messageId, data) {
    const idx = this.data.messages.findIndex(msg => msg.id === messageId);
    if (idx === -1) return;

    // Cache latest data for throttle
    this._pendingAIUpdate = { idx, data };

    // Throttle: skip if last update was < 100ms ago
    const now = Date.now();
    if (this._lastAIUpdateTime && now - this._lastAIUpdateTime < 100) {
      // Schedule a trailing update
      if (!this._aiUpdateTimer) {
        this._aiUpdateTimer = setTimeout(() => {
          this._aiUpdateTimer = null;
          this._flushAIUpdate();
        }, 100);
      }
      return;
    }

    this._flushAIUpdate();
  },

  /**
   * Flush pending AI message update using path-based setData
   */
  _flushAIUpdate() {
    const pending = this._pendingAIUpdate;
    if (!pending) return;

    const { idx, data } = pending;
    this._pendingAIUpdate = null;
    this._lastAIUpdateTime = Date.now();

    const prefix = `messages[${idx}]`;
    this.setData({
      [`${prefix}.content`]: data.content,
      [`${prefix}.thinking`]: data.thinking || '',
      [`${prefix}.isThinking`]: data.isThinking || false,
      [`${prefix}.loading`]: false
    });
  },

  /**
   * Finalize AI message (no throttle, ensure complete display)
   */
  finalizeAIMessage(messageId, content, newConversationId, thinking) {
    // Clear any pending throttled update
    if (this._aiUpdateTimer) {
      clearTimeout(this._aiUpdateTimer);
      this._aiUpdateTimer = null;
    }
    this._pendingAIUpdate = null;

    const idx = this.data.messages.findIndex(msg => msg.id === messageId);
    if (idx === -1) return;

    const prefix = `messages[${idx}]`;
    this.setData({
      [`${prefix}.content`]: content || '抱歉，我暂时无法回答这个问题。',
      [`${prefix}.thinking`]: thinking || this.data.messages[idx].thinking || '',
      [`${prefix}.isThinking`]: false,
      [`${prefix}.loading`]: false,
      [`${prefix}.showDisclaimer`]: true,
      loading: false,
      conversationId: newConversationId || this.data.conversationId
    });

    this.scrollToBottom();
  },

  /**
   * Handle error
   */
  handleError(messageId, error) {
    // Clear any pending throttled update
    if (this._aiUpdateTimer) {
      clearTimeout(this._aiUpdateTimer);
      this._aiUpdateTimer = null;
    }
    this._pendingAIUpdate = null;

    const errorMessage = error.message || '网络错误，请稍后重试';
    const idx = this.data.messages.findIndex(msg => msg.id === messageId);

    if (idx !== -1) {
      const prefix = `messages[${idx}]`;
      this.setData({
        [`${prefix}.content`]: `抱歉，发生了错误：${errorMessage}`,
        [`${prefix}.loading`]: false,
        [`${prefix}.showDisclaimer`]: false,
        loading: false
      });
    } else {
      this.setData({ loading: false });
    }

    wx.showToast({ title: '发送失败', icon: 'none' });
  },

  /**
   * Scroll to bottom
   */
  scrollToBottom() {
    const lastMessage = this.data.messages[this.data.messages.length - 1];
    if (lastMessage) {
      this.setData({ scrollToMessage: lastMessage.id });
    }
  },

  /**
   * Clear conversation (legacy, now redirects to new chat)
   */
  clearConversation() {
    this.startNewChat();
  },

  /**
   * Share
   */
  onShareAppMessage() {
    return {
      title: '心音健康助手 - 智能健康问答',
      path: '/pages/ai-assistant/chat/index'
    };
  }
});
