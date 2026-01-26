/**
 * Supabase Edge Function: generate-report
 * 报表生成服务 - 异步生成Excel/CSV报表
 *
 * 支持4种报表类型:
 * - detection_data: 检测数据报表
 * - user_stats: 用户统计报表
 * - device_usage: 设备使用报表
 * - risk_analysis: 风险分析报表
 */

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Report type configurations
const REPORT_CONFIGS = {
  detection_data: {
    name: '检测数据报表',
    headers: ['检测ID', '用户昵称', '设备ID', '结果', '置信度', '风险等级', '检测时间'],
    columns: ['id', 'user_nickname', 'device_id', 'result_label', 'confidence', 'risk_level', 'created_at']
  },
  user_stats: {
    name: '用户统计报表',
    headers: ['用户ID', '昵称', '手机号', '检测次数', '最近检测', '注册时间'],
    columns: ['id', 'nickname', 'phone', 'detection_count', 'last_detection', 'created_at']
  },
  device_usage: {
    name: '设备使用报表',
    headers: ['设备ID', '设备编号', '固件版本', '检测次数', '最后在线', '分配用户', '创建时间'],
    columns: ['id', 'device_id', 'firmware_version', 'detection_count', 'last_seen_at', 'assigned_user', 'created_at']
  },
  risk_analysis: {
    name: '风险分析报表',
    headers: ['日期', '总检测数', '安全', '中等风险', '高风险', '安全占比'],
    columns: ['date', 'total', 'safe_count', 'warning_count', 'danger_count', 'safe_ratio']
  }
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { taskId } = await req.json();

    if (!taskId) {
      return new Response(
        JSON.stringify({ error: 'Missing taskId' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get task details
    const { data: task, error: taskError } = await supabase
      .from('report_tasks')
      .select('*')
      .eq('id', taskId)
      .single();

    if (taskError || !task) {
      console.error('Task not found:', taskError);
      return new Response(
        JSON.stringify({ error: 'Task not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Update status to processing
    await supabase
      .from('report_tasks')
      .update({ status: 'processing', progress: 10 })
      .eq('id', taskId);

    try {
      // Generate report data
      const { params, report_type } = task;
      const data = await generateReportData(supabase, report_type, params);

      // Update progress
      await supabase
        .from('report_tasks')
        .update({ progress: 50 })
        .eq('id', taskId);

      // Generate file content
      const config = REPORT_CONFIGS[report_type as keyof typeof REPORT_CONFIGS];
      const format = params.format || 'xlsx';
      let fileContent: Uint8Array;
      let fileName: string;
      let contentType: string;

      if (format === 'csv') {
        fileContent = generateCSV(data, config.headers);
        fileName = `${config.name}_${formatDate(params.start_date)}_${formatDate(params.end_date)}.csv`;
        contentType = 'text/csv';
      } else {
        // For xlsx, we generate a simple CSV with BOM for Excel compatibility
        // (Full xlsx support requires additional libraries)
        fileContent = generateExcelCompatibleCSV(data, config.headers);
        fileName = `${config.name}_${formatDate(params.start_date)}_${formatDate(params.end_date)}.xlsx`;
        contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      }

      // Update progress
      await supabase
        .from('report_tasks')
        .update({ progress: 80 })
        .eq('id', taskId);

      // Upload to storage
      const filePath = `reports/${task.admin_id}/${taskId}/${fileName}`;
      const { error: uploadError } = await supabase.storage
        .from('reports')
        .upload(filePath, fileContent, {
          contentType,
          upsert: true
        });

      if (uploadError) {
        throw new Error(`Upload failed: ${uploadError.message}`);
      }

      // Update task as completed
      await supabase
        .from('report_tasks')
        .update({
          status: 'completed',
          progress: 100,
          file_name: fileName,
          file_path: filePath,
          file_size: fileContent.length,
          completed_at: new Date().toISOString()
        })
        .eq('id', taskId);

      console.log(`Report generated successfully: ${fileName}`);

      return new Response(
        JSON.stringify({ success: true, fileName, fileSize: fileContent.length }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );

    } catch (genError) {
      console.error('Report generation error:', genError);

      // Update task as failed
      await supabase
        .from('report_tasks')
        .update({
          status: 'failed',
          progress: 0
        })
        .eq('id', taskId);

      throw genError;
    }

  } catch (error) {
    console.error('Edge function error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

/**
 * Generate report data based on type
 */
async function generateReportData(
  supabase: any,
  reportType: string,
  params: { start_date: string; end_date: string }
): Promise<any[]> {
  const startDate = `${params.start_date}T00:00:00.000Z`;
  const endDate = `${params.end_date}T23:59:59.999Z`;

  switch (reportType) {
    case 'detection_data':
      return await getDetectionData(supabase, startDate, endDate);

    case 'user_stats':
      return await getUserStats(supabase, startDate, endDate);

    case 'device_usage':
      return await getDeviceUsage(supabase, startDate, endDate);

    case 'risk_analysis':
      return await getRiskAnalysis(supabase, startDate, endDate);

    default:
      throw new Error(`Unknown report type: ${reportType}`);
  }
}

/**
 * Get detection records data
 */
async function getDetectionData(supabase: any, startDate: string, endDate: string) {
  const { data, error } = await supabase
    .from('detection_records')
    .select(`
      id,
      result_label,
      confidence,
      risk_level,
      created_at,
      user:users(nickname),
      device:devices(device_id)
    `)
    .gte('created_at', startDate)
    .lte('created_at', endDate)
    .order('created_at', { ascending: false });

  if (error) throw error;

  return (data || []).map((r: any) => [
    r.id.slice(0, 8),
    r.user?.nickname || '-',
    r.device?.device_id || '-',
    r.result_label,
    `${r.confidence}%`,
    translateRiskLevel(r.risk_level),
    formatDateTime(r.created_at)
  ]);
}

/**
 * Get user statistics data
 */
async function getUserStats(supabase: any, startDate: string, endDate: string) {
  // Get users created in date range
  const { data: users, error } = await supabase
    .from('users')
    .select('id, nickname, phone, created_at')
    .gte('created_at', startDate)
    .lte('created_at', endDate)
    .order('created_at', { ascending: false });

  if (error) throw error;

  // Get detection counts for each user
  const result = [];
  for (const user of users || []) {
    const { count } = await supabase
      .from('detection_records')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id);

    const { data: lastDetection } = await supabase
      .from('detection_records')
      .select('created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    result.push([
      user.id.slice(0, 8),
      user.nickname || '-',
      user.phone || '-',
      count || 0,
      lastDetection ? formatDateTime(lastDetection.created_at) : '-',
      formatDateTime(user.created_at)
    ]);
  }

  return result;
}

/**
 * Get device usage data
 */
async function getDeviceUsage(supabase: any, startDate: string, endDate: string) {
  const { data: devices, error } = await supabase
    .from('devices')
    .select(`
      id,
      device_id,
      firmware_version,
      last_seen_at,
      created_at
    `)
    .order('created_at', { ascending: false });

  if (error) throw error;

  const result = [];
  for (const device of devices || []) {
    // Get detection count in date range
    const { count } = await supabase
      .from('detection_records')
      .select('*', { count: 'exact', head: true })
      .eq('device_id', device.id)
      .gte('created_at', startDate)
      .lte('created_at', endDate);

    // Get assigned user
    const { data: assignment } = await supabase
      .from('user_devices')
      .select('user:users(nickname)')
      .eq('device_id', device.id)
      .single();

    result.push([
      device.id.slice(0, 8),
      device.device_id,
      device.firmware_version || '-',
      count || 0,
      device.last_seen_at ? formatDateTime(device.last_seen_at) : '-',
      assignment?.user?.nickname || '未分配',
      formatDateTime(device.created_at)
    ]);
  }

  return result;
}

/**
 * Get risk analysis data (daily aggregation)
 */
async function getRiskAnalysis(supabase: any, startDate: string, endDate: string) {
  const { data, error } = await supabase
    .from('detection_records')
    .select('risk_level, created_at')
    .gte('created_at', startDate)
    .lte('created_at', endDate);

  if (error) throw error;

  // Group by date
  const dailyStats: Record<string, { total: number; safe: number; warning: number; danger: number }> = {};

  for (const record of data || []) {
    const date = record.created_at.slice(0, 10);
    if (!dailyStats[date]) {
      dailyStats[date] = { total: 0, safe: 0, warning: 0, danger: 0 };
    }
    dailyStats[date].total++;
    if (record.risk_level === 'safe') dailyStats[date].safe++;
    else if (record.risk_level === 'warning') dailyStats[date].warning++;
    else if (record.risk_level === 'danger') dailyStats[date].danger++;
  }

  // Convert to array
  return Object.entries(dailyStats)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, stats]) => [
      date,
      stats.total,
      stats.safe,
      stats.warning,
      stats.danger,
      stats.total > 0 ? `${((stats.safe / stats.total) * 100).toFixed(1)}%` : '-'
    ]);
}

/**
 * Generate CSV content
 */
function generateCSV(data: any[][], headers: string[]): Uint8Array {
  const rows = [headers, ...data];
  const csvContent = rows
    .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n');

  return new TextEncoder().encode(csvContent);
}

/**
 * Generate Excel-compatible CSV with BOM
 */
function generateExcelCompatibleCSV(data: any[][], headers: string[]): Uint8Array {
  const rows = [headers, ...data];
  const csvContent = rows
    .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n');

  // Add UTF-8 BOM for Excel compatibility
  const bom = new Uint8Array([0xEF, 0xBB, 0xBF]);
  const content = new TextEncoder().encode(csvContent);
  const result = new Uint8Array(bom.length + content.length);
  result.set(bom);
  result.set(content, bom.length);

  return result;
}

/**
 * Translate risk level to Chinese
 */
function translateRiskLevel(level: string): string {
  const translations: Record<string, string> = {
    safe: '安全',
    warning: '中等风险',
    danger: '高风险'
  };
  return translations[level] || level;
}

/**
 * Format date for filename
 */
function formatDate(dateStr: string): string {
  return dateStr.replace(/-/g, '');
}

/**
 * Format datetime for display
 */
function formatDateTime(dateStr: string): string {
  const d = new Date(dateStr);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}`;
}
