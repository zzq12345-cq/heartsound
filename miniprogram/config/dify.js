/**
 * Dify Configuration
 * Dify AI平台配置文件
 *
 * ============================================
 * 配置说明：
 * 1. 部署Dify: docker-compose up -d (参考 https://docs.dify.ai/getting-started/install-self-hosted)
 * 2. 创建应用:
 *    - 健康问答Bot: 创建Chatflow应用，获取API密钥
 *    - 智能报告生成: 创建Workflow应用，获取API密钥
 * 3. 在下方填入你的配置
 * ============================================
 */

module.exports = {
  // ============================================
  // Dify API基础URL
  // Docker本地部署: http://localhost/v1
  // 云服务: https://api.dify.ai/v1
  // ============================================
  baseUrl: 'http://111.230.29.149:3030/v1',

  // ============================================
  // Chatflow API密钥 (健康问答Bot)
  // 在Dify控制台 -> 应用 -> API访问 中获取
  // ============================================
  chatflowApiKey: 'app-qO7Bfbcl6RNJMhYqa9qqHw3Z',

  // ============================================
  // Workflow API密钥 (智能报告生成)
  // 在Dify控制台 -> 应用 -> API访问 中获取
  // ============================================
  workflowApiKey: 'app-vIF2k4Tkgxxb9WEo1oR81aC7',

  // API设置
  apiSettings: {
    timeout: 60000,  // 60秒超时（AI生成较慢）
    retries: 2,
    streamingEnabled: true  // 启用流式响应
  },

  // 应用配置（可选，用于界面显示）
  apps: {
    healthChat: {
      name: '心音健康助手',
      description: '基于检测结果的智能健康问答',
      responseMode: 'streaming'  // streaming | blocking
    },
    healthReport: {
      name: '智能健康报告',
      description: '生成个性化健康分析报告',
      responseMode: 'blocking'
    }
  }
};

/**
 * ============================================
 * Dify应用配置建议
 * ============================================
 *
 * 1. 健康问答Bot (Chatflow)
 *    - 系统提示词建议:
 *      你是心音智鉴的AI健康助手，专门解答用户关于心脏健康的问题。
 *      用户可能会询问他们的心音检测结果、心脏健康建议等。
 *      注意：你只能提供健康建议，不能做医学诊断。
 *      每次回复结尾需要提醒用户"如有不适请及时就医"。
 *
 * 2. 智能报告生成 (Workflow)
 *    - 输入变量:
 *      - detection_records: 检测记录JSON数组
 *      - report_type: 报告类型 (weekly/monthly/custom)
 *      - user_id: 用户ID
 *    - 输出: 健康分析报告Markdown文本
 *
 * ============================================
 */
