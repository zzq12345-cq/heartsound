/**
 * Dify Service
 * Dify AI平台服务模块
 *
 * 封装Dify Chatflow和Workflow API调用
 * 支持流式响应和同步响应两种模式
 */

const config = require('../config/dify');

/**
 * Send chat message to Dify Chatflow
 * 发送消息到健康问答Bot
 *
 * @param {object} options - 请求参数
 * @param {string} options.message - 用户消息
 * @param {string} options.conversationId - 对话ID (可选，用于继续对话)
 * @param {object} options.inputs - 额外输入变量 (检测结果等)
 * @param {function} options.onMessage - 流式响应回调 (可选)
 * @returns {Promise<object>} 响应结果
 */
async function sendChatMessage(options) {
  const { message, conversationId, inputs = {}, onMessage } = options;
  const useStreaming = config.apiSettings.streamingEnabled && !!onMessage;

  console.log('[DifyService] Sending chat message:', message.slice(0, 50) + '...');

  const requestData = {
    query: message,
    inputs: inputs,
    response_mode: useStreaming ? 'streaming' : 'blocking',
    user: 'miniprogram-user'
  };

  if (conversationId) {
    requestData.conversation_id = conversationId;
  }

  try {
    if (useStreaming) {
      return await handleStreamRequest('/chat-messages', requestData, onMessage);
    } else {
      return await handleBlockingRequest('/chat-messages', requestData);
    }
  } catch (error) {
    console.error('[DifyService] Chat message failed:', error);
    throw error;
  }
}

/**
 * Generate health report via Dify Workflow
 * 通过Workflow生成智能健康报告
 *
 * @param {object} options - 请求参数
 * @param {string} options.userId - 用户ID
 * @param {string} options.reportType - 报告类型 (weekly|monthly|custom)
 * @param {string} options.periodStart - 报告起始日期
 * @param {string} options.periodEnd - 报告结束日期
 * @param {object} options.stats - 检测统计数据
 * @param {array} [options.detectionRecords] - 可选的检测记录列表
 * @returns {Promise<object>} 生成的报告
 */
async function generateHealthReport(options) {
  const {
    userId,
    reportType = 'weekly',
    periodStart,
    periodEnd,
    stats,
    detectionRecords
  } = options;

  console.log('[DifyService] Generating health report, type:', reportType);

  // Build inputs for Dify Workflow
  const inputs = {
    user_id: userId,
    report_type: reportType,
    period_start: periodStart,
    period_end: periodEnd,
    generation_date: new Date().toISOString()
  };

  // Add stats if provided
  if (stats) {
    inputs.detection_stats = JSON.stringify(stats);
  }

  // Add records if provided
  if (detectionRecords) {
    inputs.detection_records = JSON.stringify(detectionRecords);
  }

  const requestData = {
    inputs: inputs,
    response_mode: 'blocking',
    user: 'miniprogram-user'
  };

  try {
    const response = await handleWorkflowRequest(requestData);
    return {
      success: true,
      data: response.data?.outputs || response.data || response,
      generatedAt: new Date().toISOString()
    };
  } catch (error) {
    console.error('[DifyService] Report generation failed:', error);
    throw error;
  }
}

/**
 * Create new conversation
 * 创建新对话
 *
 * @returns {Promise<string>} 对话ID
 */
async function createConversation() {
  // Dify会在第一条消息时自动创建对话
  // 返回null表示新对话
  return null;
}

/**
 * Get conversation history
 * 获取对话历史
 *
 * @param {string} conversationId - 对话ID
 * @returns {Promise<array>} 消息列表
 */
async function getConversationHistory(conversationId) {
  if (!conversationId) {
    return [];
  }

  try {
    return new Promise((resolve, reject) => {
      wx.request({
        url: `${config.baseUrl}/messages`,
        method: 'GET',
        header: {
          'Authorization': `Bearer ${config.chatflowApiKey}`,
          'Content-Type': 'application/json'
        },
        data: {
          conversation_id: conversationId,
          user: 'miniprogram-user',
          limit: 100
        },
        timeout: config.apiSettings.timeout,
        success(res) {
          if (res.statusCode === 200) {
            resolve(res.data?.data || []);
          } else {
            reject(new Error(res.data?.message || 'Failed to get history'));
          }
        },
        fail(err) {
          reject(new Error(err.errMsg || 'Network error'));
        }
      });
    });
  } catch (error) {
    console.error('[DifyService] Get history failed:', error);
    return [];
  }
}

/**
 * Handle blocking request
 * 处理同步请求
 */
async function handleBlockingRequest(endpoint, data) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${config.baseUrl}${endpoint}`,
      method: 'POST',
      header: {
        'Authorization': `Bearer ${config.chatflowApiKey}`,
        'Content-Type': 'application/json'
      },
      data: data,
      timeout: config.apiSettings.timeout,
      success(res) {
        if (res.statusCode === 200) {
          console.log('[DifyService] Blocking response received');
          const rawAnswer = res.data?.answer || res.data?.data?.outputs?.text;
          resolve({
            answer: filterThinkingContent(rawAnswer),
            conversationId: res.data?.conversation_id,
            messageId: res.data?.message_id,
            metadata: res.data?.metadata
          });
        } else {
          console.error('[DifyService] Request failed:', res.statusCode, res.data);
          reject(new Error(res.data?.message || `HTTP ${res.statusCode}`));
        }
      },
      fail(err) {
        console.error('[DifyService] Network error:', err);
        reject(new Error(err.errMsg || 'Network request failed'));
      }
    });
  });
}

/**
 * Handle streaming request with SSE
 * 处理流式请求（使用enableChunked）
 */
async function handleStreamRequest(endpoint, data, onMessage) {
  return new Promise((resolve, reject) => {
    let fullAnswer = '';
    let conversationId = '';
    let messageId = '';
    let buffer = '';

    const requestTask = wx.request({
      url: `${config.baseUrl}${endpoint}`,
      method: 'POST',
      header: {
        'Authorization': `Bearer ${config.chatflowApiKey}`,
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream'
      },
      data: data,
      timeout: config.apiSettings.timeout,
      enableChunked: true,  // 启用分块传输
      success(res) {
        console.log('[DifyService] Stream completed');
        resolve({
          answer: filterThinkingContent(fullAnswer),
          conversationId: conversationId,
          messageId: messageId,
          streaming: true
        });
      },
      fail(err) {
        console.error('[DifyService] Stream error:', err);
        reject(new Error(err.errMsg || 'Stream request failed'));
      }
    });

    // 监听分块数据
    requestTask.onChunkReceived((response) => {
      try {
        // 将ArrayBuffer转换为字符串
        const chunk = arrayBufferToString(response.data);
        buffer += chunk;

        // 解析SSE数据
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';  // 保留未完成的行

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const jsonStr = line.slice(6);
            if (jsonStr === '[DONE]') {
              continue;
            }

            try {
              const parsed = JSON.parse(jsonStr);

              if (parsed.event === 'message' || parsed.event === 'agent_message') {
                const text = parsed.answer || '';
                fullAnswer += text;

                // 提取思考内容和回答内容
                const { thinking, answer, isThinking } = extractThinkingContent(fullAnswer);

                if (onMessage) {
                  onMessage({
                    type: 'message',
                    content: answer,
                    fullContent: answer,
                    thinking: thinking,
                    isThinking: isThinking
                  });
                }
              }

              if (parsed.conversation_id) {
                conversationId = parsed.conversation_id;
              }
              if (parsed.message_id) {
                messageId = parsed.message_id;
              }

              if (parsed.event === 'message_end') {
                if (onMessage) {
                  onMessage({
                    type: 'end',
                    content: fullAnswer,
                    metadata: parsed.metadata
                  });
                }
              }
            } catch (e) {
              // JSON解析失败，可能是不完整的数据
              console.warn('[DifyService] Parse chunk failed:', e);
            }
          }
        }
      } catch (err) {
        console.error('[DifyService] Chunk processing error:', err);
      }
    });
  });
}

/**
 * Handle workflow request
 * 处理Workflow请求
 */
async function handleWorkflowRequest(data) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${config.baseUrl}/workflows/run`,
      method: 'POST',
      header: {
        'Authorization': `Bearer ${config.workflowApiKey}`,
        'Content-Type': 'application/json'
      },
      data: data,
      timeout: config.apiSettings.timeout,
      success(res) {
        if (res.statusCode === 200) {
          console.log('[DifyService] Workflow completed');
          resolve(res);
        } else {
          console.error('[DifyService] Workflow failed:', res.statusCode, res.data);
          reject(new Error(res.data?.message || `HTTP ${res.statusCode}`));
        }
      },
      fail(err) {
        console.error('[DifyService] Workflow network error:', err);
        reject(new Error(err.errMsg || 'Network request failed'));
      }
    });
  });
}

/**
 * Convert ArrayBuffer to string
 * ArrayBuffer转字符串
 */
function arrayBufferToString(buffer) {
  const bytes = new Uint8Array(buffer);
  let str = '';
  for (let i = 0; i < bytes.length; i++) {
    str += String.fromCharCode(bytes[i]);
  }
  // 处理UTF-8编码
  try {
    return decodeURIComponent(escape(str));
  } catch (e) {
    return str;
  }
}

/**
 * Filter out <think>...</think> tags from DeepSeek model output
 * 过滤DeepSeek模型输出的思考过程
 */
function filterThinkingContent(text) {
  if (!text) return text;

  // 移除 <think>...</think> 标签及其内容（支持多行）
  let filtered = text.replace(/<think>[\s\S]*?<\/think>/gi, '');

  // 移除未闭合的 <think> 标签（流式输出可能不完整）
  filtered = filtered.replace(/<think>[\s\S]*/gi, '');

  // 清理开头的空白
  return filtered.trimStart();
}

/**
 * Extract thinking content from text
 * 提取思考内容
 */
function extractThinkingContent(text) {
  if (!text) return { thinking: '', answer: text, isThinking: false };

  // 检查是否正在思考（有<think>但没有</think>）
  const hasOpenTag = /<think>/i.test(text);
  const hasCloseTag = /<\/think>/i.test(text);
  const isThinking = hasOpenTag && !hasCloseTag;

  // 提取思考内容
  const thinkMatch = text.match(/<think>([\s\S]*?)(<\/think>|$)/i);
  const thinking = thinkMatch ? thinkMatch[1].trim() : '';

  // 提取回答内容
  const answer = filterThinkingContent(text);

  return { thinking, answer, isThinking };
}

/**
 * Get conversation list
 * 获取会话列表
 *
 * @param {object} options - 请求参数
 * @param {number} options.limit - 每页数量 (默认20)
 * @param {string} options.lastId - 上一页最后一条ID (分页用)
 * @returns {Promise<object>} 会话列表 { data: [...], has_more: bool }
 */
async function getConversations(options = {}) {
  const { limit = 20, lastId } = options;

  return new Promise((resolve, reject) => {
    const data = {
      user: 'miniprogram-user',
      limit: limit,
      sort_by: '-updated_at'
    };
    if (lastId) {
      data.last_id = lastId;
    }

    wx.request({
      url: `${config.baseUrl}/conversations`,
      method: 'GET',
      header: {
        'Authorization': `Bearer ${config.chatflowApiKey}`,
        'Content-Type': 'application/json'
      },
      data: data,
      timeout: config.apiSettings.timeout,
      success(res) {
        if (res.statusCode === 200) {
          resolve(res.data || { data: [], has_more: false });
        } else {
          reject(new Error(res.data?.message || `HTTP ${res.statusCode}`));
        }
      },
      fail(err) {
        reject(new Error(err.errMsg || 'Network error'));
      }
    });
  });
}

/**
 * Delete a conversation
 * 删除会话
 *
 * @param {string} conversationId - 会话ID
 * @returns {Promise<void>}
 */
async function deleteConversation(conversationId) {
  if (!conversationId) return;

  return new Promise((resolve, reject) => {
    wx.request({
      url: `${config.baseUrl}/conversations/${conversationId}`,
      method: 'DELETE',
      header: {
        'Authorization': `Bearer ${config.chatflowApiKey}`,
        'Content-Type': 'application/json'
      },
      data: { user: 'miniprogram-user' },
      timeout: config.apiSettings.timeout,
      success(res) {
        if (res.statusCode === 200 || res.statusCode === 204) {
          resolve();
        } else {
          reject(new Error(res.data?.message || `HTTP ${res.statusCode}`));
        }
      },
      fail(err) {
        reject(new Error(err.errMsg || 'Network error'));
      }
    });
  });
}

/**
 * Rename a conversation
 * 重命名会话
 *
 * @param {string} conversationId - 会话ID
 * @param {string} name - 新名称
 * @returns {Promise<void>}
 */
async function renameConversation(conversationId, name) {
  if (!conversationId) return;

  return new Promise((resolve, reject) => {
    wx.request({
      url: `${config.baseUrl}/conversations/${conversationId}/name`,
      method: 'POST',
      header: {
        'Authorization': `Bearer ${config.chatflowApiKey}`,
        'Content-Type': 'application/json'
      },
      data: { name, user: 'miniprogram-user' },
      timeout: config.apiSettings.timeout,
      success(res) {
        if (res.statusCode === 200) {
          resolve();
        } else {
          reject(new Error(res.data?.message || `HTTP ${res.statusCode}`));
        }
      },
      fail(err) {
        reject(new Error(err.errMsg || 'Network error'));
      }
    });
  });
}

module.exports = {
  sendChatMessage,
  generateHealthReport,
  createConversation,
  getConversationHistory,
  getConversations,
  deleteConversation,
  renameConversation
};
