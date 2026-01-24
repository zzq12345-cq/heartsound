/**
 * Supabase Configuration
 * Supabase配置文件
 */

module.exports = {
  // Supabase项目URL
  url: 'https://vvywzephdzhxufpcxpsv.supabase.co',

  // Supabase公开访问密钥 (可在客户端使用)
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ2eXd6ZXBoZHpoeHVmcGN4cHN2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Mzc3MTM5MzAsImV4cCI6MjA1MzI4OTkzMH0.xBxHXxbYL88w6cOKZB5V3lPlBPY9lD-X3P3_8dXn2xE',

  // API设置
  apiSettings: {
    timeout: 10000,
    retries: 3
  }
};
