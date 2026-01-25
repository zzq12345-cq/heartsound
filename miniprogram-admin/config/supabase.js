/**
 * Supabase Configuration - Admin
 * Supabase配置文件 (管理后台)
 *
 * 与用户端共用同一个Supabase项目
 */

module.exports = {
  // Supabase项目URL
  url: 'https://vvywzephdzhxufpcxpsv.supabase.co',

  // Supabase公开访问密钥 (可在客户端使用)
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ2eXd6ZXBoZHpoeHVmcGN4cHN2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkyMjc3MzIsImV4cCI6MjA4NDgwMzczMn0.VNV6DfEKwRKFem1mce8vOb8BefzPsk8xtcDl6NKwkhc',

  // API设置
  apiSettings: {
    timeout: 10000,
    retries: 3
  }
};
