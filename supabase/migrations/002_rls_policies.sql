-- ============================================================================
-- HeartSound Row Level Security Policies
-- 心音智鉴 RLS 安全策略
-- Version: 002
-- Created: 2026-01-24
-- ============================================================================

-- ============================================================================
-- 1. users 表 RLS
-- ============================================================================
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Policy 1: 用户只能查看自己的资料
CREATE POLICY "users_select_own"
    ON users FOR SELECT
    USING (auth.uid() = id);

-- Policy 2: 用户只能更新自己的资料
CREATE POLICY "users_update_own"
    ON users FOR UPDATE
    USING (auth.uid() = id);

-- ============================================================================
-- 2. detection_records 表 RLS
-- ============================================================================
ALTER TABLE detection_records ENABLE ROW LEVEL SECURITY;

-- Policy 3: 用户只能查看自己的检测记录
CREATE POLICY "records_select_own"
    ON detection_records FOR SELECT
    USING (auth.uid() = user_id);

-- Policy 4: 用户只能插入自己的检测记录
CREATE POLICY "records_insert_own"
    ON detection_records FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- ============================================================================
-- 3. user_devices 表 RLS
-- ============================================================================
ALTER TABLE user_devices ENABLE ROW LEVEL SECURITY;

-- Policy 5: 用户只能查看自己绑定的设备
CREATE POLICY "user_devices_select_own"
    ON user_devices FOR SELECT
    USING (auth.uid() = user_id);

-- ============================================================================
-- 4. health_tips 表 RLS (公开可读)
-- ============================================================================
ALTER TABLE health_tips ENABLE ROW LEVEL SECURITY;

-- Policy 6: 所有人可以读取激活的健康小贴士
CREATE POLICY "health_tips_public_read"
    ON health_tips FOR SELECT
    USING (is_active = TRUE);

-- ============================================================================
-- 5. ai_reports 表 RLS
-- ============================================================================
ALTER TABLE ai_reports ENABLE ROW LEVEL SECURITY;

-- Policy 7: 用户只能查看自己的AI报告
CREATE POLICY "ai_reports_select_own"
    ON ai_reports FOR SELECT
    USING (auth.uid() = user_id);

-- Policy 8: 用户只能插入自己的AI报告
CREATE POLICY "ai_reports_insert_own"
    ON ai_reports FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- ============================================================================
-- Admin tables: No RLS (accessed via service_role key)
-- 管理员表不启用RLS，通过service_role密钥访问
-- ============================================================================
-- admins, admin_logs, report_tasks 表使用 service_role key 直接访问
-- 确保管理后台API使用 SUPABASE_SERVICE_ROLE_KEY

-- ============================================================================
-- Summary
-- ============================================================================
-- RLS Enabled Tables: 5
--   1. users
--   2. detection_records
--   3. user_devices
--   4. health_tips
--   5. ai_reports
--
-- Policies Created: 8
--   1. users_select_own - 用户查看自己资料
--   2. users_update_own - 用户更新自己资料
--   3. records_select_own - 用户查看自己检测记录
--   4. records_insert_own - 用户插入自己检测记录
--   5. user_devices_select_own - 用户查看自己设备绑定
--   6. health_tips_public_read - 公开读取健康小贴士
--   7. ai_reports_select_own - 用户查看自己AI报告
--   8. ai_reports_insert_own - 用户插入自己AI报告
--
-- Admin Tables (No RLS - use service_role key): 3
--   - admins
--   - admin_logs
--   - report_tasks
-- ============================================================================
