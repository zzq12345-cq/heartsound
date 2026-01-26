/**
 * Reports Page - Report Export
 * 报表导出页面 - 选择类型、日期范围和格式，生成报表
 */

const reportService = require('../../services/report');

Page({
  data: {
    // Report types
    reportTypes: [],
    selectedType: 'detection_data',

    // Export formats
    formats: [],
    selectedFormat: 'xlsx',

    // Date range
    startDate: '',
    endDate: '',
    today: '',

    // Quick date options
    quickOptions: [
      { label: '今天', value: 'today' },
      { label: '本周', value: 'week' },
      { label: '本月', value: 'month' },
      { label: '最近30天', value: 'last30' }
    ],
    activeQuick: '',

    // Generation state
    isGenerating: false,
    currentTask: null,
    pollTimer: null,

    // Recent reports (quick preview)
    recentReports: [],
    loadingRecent: false
  },

  onLoad() {
    console.log('[ReportsPage] Page loaded');

    const app = getApp();
    if (!app.requireLogin()) {
      return;
    }

    this.initData();
  },

  onShow() {
    // Refresh recent reports
    this.loadRecentReports();
  },

  onUnload() {
    // Clear poll timer
    if (this.data.pollTimer) {
      clearInterval(this.data.pollTimer);
    }
  },

  /**
   * Initialize page data
   */
  initData() {
    // Get report types
    const reportTypes = reportService.getReportTypes();

    // Get formats for default type
    const formats = reportService.getExportFormats('detection_data');

    // Set default dates (this month)
    const today = new Date();
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const todayStr = this.formatDateForPicker(today);
    const startStr = this.formatDateForPicker(startOfMonth);

    this.setData({
      reportTypes,
      formats,
      today: todayStr,
      startDate: startStr,
      endDate: todayStr,
      activeQuick: 'month'
    });

    this.loadRecentReports();
  },

  /**
   * Format date for picker component
   */
  formatDateForPicker(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  },

  /**
   * Handle report type selection
   */
  onTypeChange(e) {
    const selectedType = e.detail.value;
    const formats = reportService.getExportFormats(selectedType);

    this.setData({
      selectedType,
      formats,
      selectedFormat: formats[0]?.format || 'xlsx'
    });
  },

  /**
   * Handle format selection
   */
  onFormatChange(e) {
    this.setData({
      selectedFormat: e.currentTarget.dataset.format
    });
  },

  /**
   * Handle start date change
   */
  onStartDateChange(e) {
    this.setData({
      startDate: e.detail.value,
      activeQuick: ''
    });
  },

  /**
   * Handle end date change
   */
  onEndDateChange(e) {
    this.setData({
      endDate: e.detail.value,
      activeQuick: ''
    });
  },

  /**
   * Handle quick date option selection
   */
  onQuickSelect(e) {
    const option = e.currentTarget.dataset.option;
    const today = new Date();
    let startDate, endDate;

    switch (option) {
      case 'today':
        startDate = endDate = this.formatDateForPicker(today);
        break;
      case 'week':
        const startOfWeek = new Date(today);
        startOfWeek.setDate(today.getDate() - today.getDay() + 1); // Monday
        startDate = this.formatDateForPicker(startOfWeek);
        endDate = this.formatDateForPicker(today);
        break;
      case 'month':
        const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
        startDate = this.formatDateForPicker(startOfMonth);
        endDate = this.formatDateForPicker(today);
        break;
      case 'last30':
        const last30 = new Date(today);
        last30.setDate(today.getDate() - 30);
        startDate = this.formatDateForPicker(last30);
        endDate = this.formatDateForPicker(today);
        break;
      default:
        return;
    }

    this.setData({
      startDate,
      endDate,
      activeQuick: option
    });
  },

  /**
   * Submit report generation request
   */
  async onGenerateReport() {
    const { selectedType, startDate, endDate, selectedFormat, isGenerating } = this.data;

    if (isGenerating) {
      wx.showToast({ title: '正在生成中...', icon: 'none' });
      return;
    }

    // Validate dates
    if (!startDate || !endDate) {
      wx.showToast({ title: '请选择日期范围', icon: 'none' });
      return;
    }

    if (new Date(startDate) > new Date(endDate)) {
      wx.showToast({ title: '开始日期不能晚于结束日期', icon: 'none' });
      return;
    }

    this.setData({ isGenerating: true });

    try {
      const app = getApp();
      const adminId = app.globalData.adminInfo?.id;

      const result = await reportService.generateReport({
        reportType: selectedType,
        startDate,
        endDate,
        format: selectedFormat
      }, adminId);

      console.log('[ReportsPage] Task created:', result);

      this.setData({
        currentTask: {
          taskId: result.taskId,
          status: 'pending',
          progress: 0
        }
      });

      // Start polling for status
      this.startStatusPolling(result.taskId);

      wx.showToast({
        title: `预计${result.estimatedTime}秒完成`,
        icon: 'none',
        duration: 2000
      });

    } catch (err) {
      console.error('[ReportsPage] Generate report failed:', err);
      this.setData({ isGenerating: false });
      wx.showToast({
        title: err.message || '生成失败，请重试',
        icon: 'none'
      });
    }
  },

  /**
   * Start polling for task status
   */
  startStatusPolling(taskId) {
    // Clear existing timer
    if (this.data.pollTimer) {
      clearInterval(this.data.pollTimer);
    }

    const pollTimer = setInterval(async () => {
      try {
        const status = await reportService.getReportStatus(taskId);
        console.log('[ReportsPage] Task status:', status);

        this.setData({
          currentTask: status
        });

        if (status.status === 'completed') {
          this.stopStatusPolling();
          this.setData({ isGenerating: false });
          this.loadRecentReports();

          wx.showModal({
            title: '报表生成完成',
            content: `${status.fileName}\n是否立即下载？`,
            confirmText: '下载',
            cancelText: '稍后',
            success: (res) => {
              if (res.confirm && status.downloadUrl) {
                this.onDownloadReport({ currentTarget: { dataset: { report: status } } });
              }
            }
          });
        } else if (status.status === 'failed') {
          this.stopStatusPolling();
          this.setData({ isGenerating: false });
          wx.showToast({ title: '生成失败，请重试', icon: 'none' });
        }

      } catch (err) {
        console.error('[ReportsPage] Poll status error:', err);
      }
    }, 2000);

    this.setData({ pollTimer });
  },

  /**
   * Stop status polling
   */
  stopStatusPolling() {
    if (this.data.pollTimer) {
      clearInterval(this.data.pollTimer);
      this.setData({ pollTimer: null });
    }
  },

  /**
   * Load recent reports for quick access
   */
  async loadRecentReports() {
    this.setData({ loadingRecent: true });

    try {
      const app = getApp();
      const adminId = app.globalData.adminInfo?.id;

      const result = await reportService.getReportHistory({
        page: 1,
        pageSize: 5,
        status: 'completed'
      }, adminId);

      this.setData({
        recentReports: result.list.map(r => ({
          ...r,
          fileSizeFormatted: reportService.formatFileSize(r.fileSize),
          createdAtFormatted: reportService.formatDateTime(r.createdAt)
        }))
      });
    } catch (err) {
      console.error('[ReportsPage] Load recent reports failed:', err);
    } finally {
      this.setData({ loadingRecent: false });
    }
  },

  /**
   * Download a report
   */
  async onDownloadReport(e) {
    const report = e.currentTarget.dataset.report;

    if (!report || !report.downloadUrl) {
      wx.showToast({ title: '下载链接无效', icon: 'none' });
      return;
    }

    if (report.isExpired) {
      wx.showToast({ title: '报表已过期', icon: 'none' });
      return;
    }

    wx.showLoading({ title: '下载中...' });

    try {
      await reportService.downloadReport(report.downloadUrl, report.fileName);
      wx.hideLoading();
    } catch (err) {
      wx.hideLoading();
      console.error('[ReportsPage] Download failed:', err);
      wx.showToast({ title: '下载失败', icon: 'none' });
    }
  },

  /**
   * Navigate to history page
   */
  onViewHistory() {
    wx.navigateTo({
      url: '/pages/reports/history/index'
    });
  },

  /**
   * Cancel current generation
   */
  onCancelGeneration() {
    this.stopStatusPolling();
    this.setData({
      isGenerating: false,
      currentTask: null
    });
    wx.showToast({ title: '已取消', icon: 'none' });
  }
});
