/**
 * Report History Page - View and download generated reports
 * 历史报表页面 - 查看和下载已生成的报表
 */

const reportService = require('../../../services/report');

Page({
  data: {
    // Report list
    reports: [],
    loading: true,
    loadingMore: false,
    hasMore: true,

    // Pagination
    page: 1,
    pageSize: 20,
    total: 0,

    // Filters
    filterStatus: 'all',
    statusOptions: [
      { label: '全部', value: 'all' },
      { label: '已完成', value: 'completed' },
      { label: '处理中', value: 'processing' },
      { label: '失败', value: 'failed' }
    ]
  },

  onLoad() {
    console.log('[ReportHistoryPage] Page loaded');

    const app = getApp();
    if (!app.requireLogin()) {
      return;
    }

    this.loadReports();
  },

  onShow() {
    // Refresh when coming back
    if (this.data.reports.length > 0) {
      this.refreshReports();
    }
  },

  onPullDownRefresh() {
    this.refreshReports().finally(() => {
      wx.stopPullDownRefresh();
    });
  },

  onReachBottom() {
    this.loadMoreReports();
  },

  /**
   * Load reports (initial)
   */
  async loadReports() {
    this.setData({ loading: true });

    try {
      const app = getApp();
      const adminId = app.globalData.adminInfo?.id;

      const result = await reportService.getReportHistory({
        page: 1,
        pageSize: this.data.pageSize,
        status: this.data.filterStatus
      }, adminId);

      this.setData({
        reports: this.formatReports(result.list),
        total: result.total,
        hasMore: result.hasMore,
        page: 1
      });
    } catch (err) {
      console.error('[ReportHistoryPage] Load reports failed:', err);
      wx.showToast({ title: '加载失败', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },

  /**
   * Refresh reports (pull-to-refresh)
   */
  async refreshReports() {
    try {
      const app = getApp();
      const adminId = app.globalData.adminInfo?.id;

      const result = await reportService.getReportHistory({
        page: 1,
        pageSize: this.data.pageSize,
        status: this.data.filterStatus
      }, adminId);

      this.setData({
        reports: this.formatReports(result.list),
        total: result.total,
        hasMore: result.hasMore,
        page: 1
      });
    } catch (err) {
      console.error('[ReportHistoryPage] Refresh reports failed:', err);
    }
  },

  /**
   * Load more reports (infinite scroll)
   */
  async loadMoreReports() {
    if (this.data.loadingMore || !this.data.hasMore) return;

    this.setData({ loadingMore: true });

    try {
      const app = getApp();
      const adminId = app.globalData.adminInfo?.id;
      const nextPage = this.data.page + 1;

      const result = await reportService.getReportHistory({
        page: nextPage,
        pageSize: this.data.pageSize,
        status: this.data.filterStatus
      }, adminId);

      this.setData({
        reports: [...this.data.reports, ...this.formatReports(result.list)],
        hasMore: result.hasMore,
        page: nextPage
      });
    } catch (err) {
      console.error('[ReportHistoryPage] Load more failed:', err);
    } finally {
      this.setData({ loadingMore: false });
    }
  },

  /**
   * Format reports for display
   */
  formatReports(list) {
    return list.map(r => ({
      ...r,
      fileSizeFormatted: reportService.formatFileSize(r.fileSize),
      createdAtFormatted: reportService.formatDateTime(r.createdAt),
      expiresAtFormatted: reportService.formatDateTime(r.expiresAt),
      statusLabel: this.getStatusLabel(r.status),
      statusClass: r.status
    }));
  },

  /**
   * Get status label
   */
  getStatusLabel(status) {
    const labels = {
      pending: '等待中',
      processing: '处理中',
      completed: '已完成',
      failed: '失败'
    };
    return labels[status] || status;
  },

  /**
   * Handle status filter change
   */
  onFilterChange(e) {
    const filterStatus = e.currentTarget.dataset.status;
    if (filterStatus === this.data.filterStatus) return;

    this.setData({ filterStatus });
    this.loadReports();
  },

  /**
   * Download a report
   */
  async onDownload(e) {
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
      console.error('[ReportHistoryPage] Download failed:', err);
      wx.showToast({ title: '下载失败', icon: 'none' });
    }
  },

  /**
   * Show report details
   */
  onShowDetail(e) {
    const report = e.currentTarget.dataset.report;

    const params = report.params || {};
    const content = [
      `类型: ${report.reportLabel}`,
      `时间: ${params.start_date || '-'} 至 ${params.end_date || '-'}`,
      `格式: ${params.format?.toUpperCase() || '-'}`,
      `状态: ${report.statusLabel}`,
      report.fileName ? `文件: ${report.fileName}` : '',
      report.fileSize ? `大小: ${report.fileSizeFormatted}` : '',
      `创建: ${report.createdAtFormatted}`,
      report.expiresAt ? `过期: ${report.expiresAtFormatted}` : ''
    ].filter(Boolean).join('\n');

    wx.showModal({
      title: '报表详情',
      content,
      showCancel: false,
      confirmText: '关闭'
    });
  },

  /**
   * Retry a failed report
   */
  async onRetry(e) {
    const report = e.currentTarget.dataset.report;

    if (!report || !report.params) {
      wx.showToast({ title: '无法重试', icon: 'none' });
      return;
    }

    wx.showModal({
      title: '重新生成',
      content: `确定要重新生成"${report.reportLabel}"吗？`,
      success: async (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '提交中...' });

          try {
            const app = getApp();
            const adminId = app.globalData.adminInfo?.id;

            await reportService.generateReport({
              reportType: report.reportType,
              startDate: report.params.start_date,
              endDate: report.params.end_date,
              format: report.params.format
            }, adminId);

            wx.hideLoading();
            wx.showToast({ title: '已提交', icon: 'success' });
            this.refreshReports();
          } catch (err) {
            wx.hideLoading();
            console.error('[ReportHistoryPage] Retry failed:', err);
            wx.showToast({ title: '提交失败', icon: 'none' });
          }
        }
      }
    });
  },

  /**
   * Go back to export page
   */
  onGoExport() {
    wx.navigateBack();
  }
});
