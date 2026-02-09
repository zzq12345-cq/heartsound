/**
 * AI Health Report Page
 * AI智能健康报告页面
 *
 * Features:
 * - 周报/月报选择
 * - AI报告生成
 * - 报告历史查看
 * - 报告分享功能
 */

const app = getApp();
const difyService = require('../../../services/dify');
const userService = require('../../../services/user');

// 报告类型配置
const REPORT_TYPES = [
  { type: 'weekly', label: '周报', period: 7 },
  { type: 'monthly', label: '月报', period: 30 }
];

/**
 * Format timestamp or ISO string to YYYY-MM-DD HH:mm
 */
function formatTime(value) {
  if (!value) return '';
  const date = typeof value === 'number' ? new Date(value) : new Date(value);
  if (isNaN(date.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

Page({
  data: {
    reportTypes: REPORT_TYPES,
    selectedType: 'weekly',
    loading: false,
    generating: false,
    currentReport: null,
    reportHistory: [],
    detectionStats: null,
    // 生成进度提示
    progressText: ''
  },

  onLoad() {
    console.log('[ReportPage] Page loaded');
    this.loadDetectionStats();
    this.loadReportHistory();
  },

  onShow() {
    // 刷新数据
    this.loadDetectionStats();
  },

  /**
   * 加载检测统计数据
   */
  async loadDetectionStats() {
    try {
      const userId = app.globalData.userId;
      if (!userId) return;

      const { selectedType } = this.data;
      const period = REPORT_TYPES.find(t => t.type === selectedType)?.period || 7;

      // 计算日期范围
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - period);

      const result = await userService.getDetectionRecords(userId, {
        page: 1,
        pageSize: 100  // 获取足够多的记录用于统计
      });

      if (result.data) {
        // 过滤日期范围内的记录
        const records = result.data.filter(r => {
          const recordDate = new Date(r.created_at);
          return recordDate >= startDate && recordDate <= endDate;
        });

        // 计算统计数据
        const stats = this.calculateStats(records);
        this.setData({ detectionStats: stats });
      }
    } catch (error) {
      console.error('[ReportPage] Load stats failed:', error);
    }
  },

  /**
   * 计算统计数据
   */
  calculateStats(records) {
    if (!records || records.length === 0) {
      return {
        totalCount: 0,
        safeCount: 0,
        warningCount: 0,
        dangerCount: 0,
        avgConfidence: 0
      };
    }

    const stats = {
      totalCount: records.length,
      safeCount: records.filter(r => r.risk_level === 'safe').length,
      warningCount: records.filter(r => r.risk_level === 'warning').length,
      dangerCount: records.filter(r => r.risk_level === 'danger').length,
      avgConfidence: 0
    };

    // 计算平均置信度
    const totalConfidence = records.reduce((sum, r) => sum + (r.confidence || 0), 0);
    stats.avgConfidence = Math.round(totalConfidence / records.length);

    return stats;
  },

  /**
   * 加载报告历史
   */
  async loadReportHistory() {
    try {
      this.setData({ loading: true });

      const userId = app.globalData.userId;
      if (!userId) {
        this.setData({ loading: false });
        return;
      }

      const result = await userService.getAIReports(userId, {
        page: 1,
        pageSize: 20
      });

      // 格式化历史记录的时间
      const history = (result.data || []).map(item => ({
        ...item,
        created_at: formatTime(item.created_at)
      }));

      this.setData({
        reportHistory: history,
        loading: false
      });
    } catch (error) {
      console.error('[ReportPage] Load history failed:', error);
      this.setData({ loading: false });
    }
  },

  /**
   * 切换报告类型
   */
  onTypeChange(e) {
    const type = e.currentTarget.dataset.type;
    this.setData({
      selectedType: type,
      currentReport: null
    });
    this.loadDetectionStats();
  },

  /**
   * 生成报告
   */
  async generateReport() {
    const { selectedType, detectionStats, generating } = this.data;

    if (generating) return;

    // 检查是否有检测数据
    if (!detectionStats || detectionStats.totalCount === 0) {
      wx.showToast({
        title: '暂无检测数据',
        icon: 'none'
      });
      return;
    }

    this.setData({
      generating: true,
      progressText: '正在分析检测数据...'
    });

    try {
      const userId = app.globalData.userId;
      const period = REPORT_TYPES.find(t => t.type === selectedType)?.period || 7;

      // 计算日期范围
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - period);

      this.setData({ progressText: '正在生成健康报告...' });

      // 调用Dify生成报告
      const response = await difyService.generateHealthReport({
        userId: userId,
        reportType: selectedType,
        periodStart: startDate.toISOString().split('T')[0],
        periodEnd: endDate.toISOString().split('T')[0],
        stats: detectionStats
      });

      if (response && response.data) {
        // 解析报告内容
        const reportContent = this.parseReportContent(response.data);
        const periodLabel = selectedType === 'weekly' ? '近7天' : '近30天';
        const now = new Date().toISOString();

        this.setData({
          currentReport: {
            type: selectedType,
            content: reportContent,
            generatedAt: formatTime(now),
            reportPeriod: periodLabel,
            stats: detectionStats
          },
          generating: false,
          progressText: ''
        });

        // 保存报告到Supabase
        try {
          await userService.saveAIReport(userId, {
            reportType: selectedType,
            reportPeriod: periodLabel,
            reportContent: {
              content: reportContent,
              stats: detectionStats
            }
          });
          // 刷新历史列表
          this.loadReportHistory();
        } catch (saveErr) {
          console.error('[ReportPage] Save report failed:', saveErr);
          // 保存失败不影响展示，只打个日志
        }

        wx.showToast({
          title: '报告生成成功',
          icon: 'success'
        });
      }
    } catch (error) {
      console.error('[ReportPage] Generate report failed:', error);
      this.setData({
        generating: false,
        progressText: ''
      });
      wx.showToast({
        title: error.message || '生成失败',
        icon: 'none'
      });
    }
  },

  /**
   * 解析报告内容
   */
  parseReportContent(data) {
    // Dify Workflow返回的数据结构
    if (typeof data === 'string') {
      return data;
    }

    // 尝试从outputs中获取
    if (data.outputs && data.outputs.report) {
      return data.outputs.report;
    }

    // 尝试从text字段获取
    if (data.text) {
      return data.text;
    }

    return JSON.stringify(data, null, 2);
  },

  /**
   * 分享报告
   */
  shareReport() {
    const { currentReport } = this.data;
    if (!currentReport) return;

    wx.showActionSheet({
      itemList: ['保存图片', '复制内容'],
      success: (res) => {
        if (res.tapIndex === 0) {
          // TODO: 生成报告图片并保存
          wx.showToast({
            title: '功能开发中',
            icon: 'none'
          });
        } else if (res.tapIndex === 1) {
          wx.setClipboardData({
            data: currentReport.content,
            success: () => {
              wx.showToast({
                title: '已复制到剪贴板',
                icon: 'success'
              });
            }
          });
        }
      }
    });
  },

  /**
   * 查看历史报告（复用现有报告卡片UI展示）
   */
  viewHistoryReport(e) {
    const reportId = e.currentTarget.dataset.id;
    const { reportHistory } = this.data;
    const report = reportHistory.find(r => r.id === reportId);

    if (!report) {
      wx.showToast({ title: '报告不存在', icon: 'none' });
      return;
    }

    const content = report.report_content;
    this.setData({
      selectedType: report.report_type === 'monthly' ? 'monthly' : 'weekly',
      currentReport: {
        type: report.report_type,
        content: typeof content === 'object' ? (content.content || JSON.stringify(content, null, 2)) : content,
        generatedAt: report.created_at,
        reportPeriod: report.report_period || '',
        stats: (typeof content === 'object' && content.stats) ? content.stats : null
      }
    });

    // 滚动到报告区域
    wx.pageScrollTo({ scrollTop: 0, duration: 300 });
  },

  /**
   * 跳转到健康助手
   */
  goToChat() {
    wx.navigateTo({
      url: '/pages/ai-assistant/chat/index'
    });
  },

  /**
   * 分享
   */
  onShareAppMessage() {
    return {
      title: '我的心音健康报告',
      path: '/pages/ai-assistant/report/index'
    };
  }
});
