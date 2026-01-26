/**
 * Report Service - Report Generation and Management
 * 报表服务 - 生成、查询和下载报表
 *
 * 支持4种报表类型:
 * - detection_data: 检测数据报表
 * - user_stats: 用户统计报表
 * - device_usage: 设备使用报表
 * - risk_analysis: 风险分析报表
 */

const { supabase, SUPABASE_CONFIG } = require('../utils/supabase');
const adminService = require('./admin');

// Report type definitions
const REPORT_TYPES = {
  detection_data: {
    label: '检测数据报表',
    description: '指定时间段内的所有检测记录',
    formats: ['xlsx', 'csv']
  },
  user_stats: {
    label: '用户统计报表',
    description: '用户注册、活跃度统计',
    formats: ['xlsx']
  },
  device_usage: {
    label: '设备使用报表',
    description: '设备使用频率、在线状态统计',
    formats: ['xlsx']
  },
  risk_analysis: {
    label: '风险分析报表',
    description: '各风险等级分布、趋势分析',
    formats: ['xlsx']
  }
};

// Export format definitions
const EXPORT_FORMATS = {
  xlsx: { label: 'Excel', extension: '.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
  csv: { label: 'CSV', extension: '.csv', mimeType: 'text/csv' }
};

/**
 * 获取报表类型配置列表
 * @returns {array}
 */
function getReportTypes() {
  return Object.entries(REPORT_TYPES).map(([key, value]) => ({
    type: key,
    ...value
  }));
}

/**
 * 获取导出格式配置列表
 * @param {string} reportType - 报表类型
 * @returns {array}
 */
function getExportFormats(reportType) {
  const config = REPORT_TYPES[reportType];
  if (!config) return [];

  return config.formats.map(f => ({
    format: f,
    ...EXPORT_FORMATS[f]
  }));
}

/**
 * 提交报表生成任务
 *
 * @param {object} options - 报表参数
 * @param {string} options.reportType - 报表类型
 * @param {string} options.startDate - 开始日期 YYYY-MM-DD
 * @param {string} options.endDate - 结束日期 YYYY-MM-DD
 * @param {string} options.format - 导出格式 xlsx/csv
 * @param {string} adminId - 管理员ID
 * @returns {Promise<{taskId: string, status: string, estimatedTime: number}>}
 */
async function generateReport({ reportType, startDate, endDate, format = 'xlsx' }, adminId) {
  try {
    if (!REPORT_TYPES[reportType]) {
      throw new Error(`无效的报表类型: ${reportType}`);
    }

    // Calculate expires_at (7 days from now)
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    // Create task record
    const { data: task, error } = await supabase
      .from('report_tasks')
      .insert({
        admin_id: adminId,
        report_type: reportType,
        status: 'pending',
        progress: 0,
        params: {
          start_date: startDate,
          end_date: endDate,
          format: format
        },
        expires_at: expiresAt.toISOString()
      })
      .select()
      .single();

    if (error) {
      console.error('[ReportService] Create task error:', error);
      throw error;
    }

    // Trigger Edge Function to process (async)
    triggerReportGeneration(task.id).catch(err => {
      console.error('[ReportService] Trigger generation error:', err);
    });

    // Log admin action
    await adminService.logAdminAction(
      adminId,
      'generate_report',
      'report_task',
      task.id,
      { report_type: reportType, params: task.params }
    );

    console.log('[ReportService] Task created:', task.id);

    // Estimate time based on date range
    const daysDiff = Math.ceil((new Date(endDate) - new Date(startDate)) / (1000 * 60 * 60 * 24));
    const estimatedTime = Math.max(5, Math.min(60, daysDiff * 2));

    return {
      taskId: task.id,
      status: 'pending',
      estimatedTime
    };
  } catch (err) {
    console.error('[ReportService] generateReport failed:', err);
    throw err;
  }
}

/**
 * Trigger Edge Function to generate report
 * (Internal, non-blocking)
 *
 * @param {string} taskId - Task ID
 */
async function triggerReportGeneration(taskId) {
  try {
    // Call Supabase Edge Function
    const response = await new Promise((resolve, reject) => {
      wx.request({
        url: `${SUPABASE_CONFIG.url}/functions/v1/generate-report`,
        method: 'POST',
        header: {
          'Authorization': `Bearer ${SUPABASE_CONFIG.anonKey}`,
          'Content-Type': 'application/json'
        },
        data: { taskId },
        success: (res) => resolve(res),
        fail: (err) => reject(err)
      });
    });

    console.log('[ReportService] Edge Function triggered:', response.statusCode);
  } catch (err) {
    // If Edge Function fails, update task status
    console.error('[ReportService] Edge Function call failed:', err);
    await updateTaskStatus(taskId, 'failed');
  }
}

/**
 * 查询报表任务状态
 *
 * @param {string} taskId - 任务ID
 * @returns {Promise<object>}
 */
async function getReportStatus(taskId) {
  try {
    const { data, error } = await supabase
      .from('report_tasks')
      .select('*')
      .eq('id', taskId)
      .single();

    if (error) {
      throw error;
    }

    const result = {
      taskId: data.id,
      status: data.status,
      progress: data.progress,
      reportType: data.report_type,
      params: data.params,
      createdAt: data.created_at
    };

    // Include file info if completed
    if (data.status === 'completed') {
      result.fileName = data.file_name;
      result.fileSize = data.file_size;
      result.downloadUrl = await getDownloadUrl(data.file_path);
      result.expiresAt = data.expires_at;
    }

    return result;
  } catch (err) {
    console.error('[ReportService] getReportStatus failed:', err);
    throw err;
  }
}

/**
 * 获取历史报表列表（分页）
 *
 * @param {object} options - 查询选项
 * @param {number} options.page - 页码
 * @param {number} options.pageSize - 每页条数
 * @param {string} options.status - 状态筛选 all/completed/failed
 * @param {string} adminId - 管理员ID
 * @returns {Promise<{list: array, total: number, hasMore: boolean}>}
 */
async function getReportHistory({ page = 1, pageSize = 20, status = 'all' } = {}, adminId) {
  try {
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = supabase
      .from('report_tasks')
      .select('*', { count: 'exact' });

    // Filter by admin if not super admin
    if (adminId) {
      query = query.eq('admin_id', adminId);
    }

    // Status filter
    if (status !== 'all') {
      query = query.eq('status', status);
    }

    const { data, error, count } = await query
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) {
      throw error;
    }

    // Process each report
    const list = await Promise.all(
      (data || []).map(async (task) => {
        const item = {
          id: task.id,
          reportType: task.report_type,
          reportLabel: REPORT_TYPES[task.report_type]?.label || task.report_type,
          status: task.status,
          progress: task.progress,
          params: task.params,
          fileName: task.file_name,
          fileSize: task.file_size,
          createdAt: task.created_at,
          expiresAt: task.expires_at,
          isExpired: task.expires_at ? new Date(task.expires_at) < new Date() : false
        };

        // Get download URL if completed and not expired
        if (task.status === 'completed' && task.file_path && !item.isExpired) {
          try {
            item.downloadUrl = await getDownloadUrl(task.file_path);
          } catch (e) {
            console.warn('[ReportService] Get download URL failed:', e);
          }
        }

        return item;
      })
    );

    return {
      list,
      total: count || 0,
      hasMore: (from + (data?.length || 0)) < count
    };
  } catch (err) {
    console.error('[ReportService] getReportHistory failed:', err);
    throw err;
  }
}

/**
 * 获取下载链接（签名URL）
 *
 * @param {string} filePath - Storage中的文件路径
 * @returns {Promise<string>}
 */
async function getDownloadUrl(filePath) {
  if (!filePath) return null;

  try {
    const { data, error } = await supabase
      .storage
      .from('reports')
      .createSignedUrl(filePath, 3600); // 1 hour expiry

    if (error) {
      throw error;
    }

    return data.signedUrl;
  } catch (err) {
    console.error('[ReportService] getDownloadUrl failed:', err);
    return null;
  }
}

/**
 * 下载报表文件
 *
 * @param {string} downloadUrl - 下载链接
 * @param {string} fileName - 文件名
 * @returns {Promise<void>}
 */
async function downloadReport(downloadUrl, fileName) {
  return new Promise((resolve, reject) => {
    wx.downloadFile({
      url: downloadUrl,
      success: (res) => {
        if (res.statusCode === 200) {
          // Save to local and open
          const filePath = res.tempFilePath;
          wx.openDocument({
            filePath,
            showMenu: true,
            success: () => resolve(filePath),
            fail: (err) => {
              console.error('[ReportService] Open document failed:', err);
              // Fallback: save file
              wx.saveFile({
                tempFilePath: filePath,
                success: (saveRes) => resolve(saveRes.savedFilePath),
                fail: reject
              });
            }
          });
        } else {
          reject(new Error(`Download failed: ${res.statusCode}`));
        }
      },
      fail: reject
    });
  });
}

/**
 * 更新任务状态（内部使用）
 *
 * @param {string} taskId - 任务ID
 * @param {string} status - 新状态
 * @param {object} extra - 额外字段
 */
async function updateTaskStatus(taskId, status, extra = {}) {
  try {
    const updateData = { status, ...extra };

    if (status === 'completed') {
      updateData.completed_at = new Date().toISOString();
      updateData.progress = 100;
    } else if (status === 'failed') {
      updateData.progress = 0;
    }

    await supabase
      .from('report_tasks')
      .update(updateData)
      .eq('id', taskId);
  } catch (err) {
    console.error('[ReportService] updateTaskStatus failed:', err);
  }
}

/**
 * 删除已过期的报表任务
 * (可由定时任务调用)
 */
async function cleanupExpiredReports() {
  try {
    const now = new Date().toISOString();

    // Get expired tasks with files
    const { data: expiredTasks } = await supabase
      .from('report_tasks')
      .select('id, file_path')
      .lt('expires_at', now)
      .not('file_path', 'is', null);

    if (!expiredTasks || expiredTasks.length === 0) {
      return { deleted: 0 };
    }

    // Delete files from storage
    const filePaths = expiredTasks.map(t => t.file_path).filter(Boolean);
    if (filePaths.length > 0) {
      await supabase.storage.from('reports').remove(filePaths);
    }

    // Delete task records
    const { count } = await supabase
      .from('report_tasks')
      .delete()
      .lt('expires_at', now);

    console.log('[ReportService] Cleaned up expired reports:', count);
    return { deleted: count };
  } catch (err) {
    console.error('[ReportService] cleanupExpiredReports failed:', err);
    return { deleted: 0 };
  }
}

/**
 * 格式化文件大小
 *
 * @param {number} bytes - 字节数
 * @returns {string}
 */
function formatFileSize(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

/**
 * 格式化日期为显示格式
 *
 * @param {string} dateStr - ISO日期字符串
 * @returns {string}
 */
function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * 格式化日期时间为显示格式
 *
 * @param {string} dateStr - ISO日期字符串
 * @returns {string}
 */
function formatDateTime(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

module.exports = {
  // Types and configs
  REPORT_TYPES,
  EXPORT_FORMATS,
  getReportTypes,
  getExportFormats,

  // Core functions
  generateReport,
  getReportStatus,
  getReportHistory,
  downloadReport,

  // Utilities
  formatFileSize,
  formatDate,
  formatDateTime,

  // Cleanup
  cleanupExpiredReports
};
