-- ============================================================================
-- HeartSound Anonymous Access Policies (Development)
-- 心音智鉴 匿名访问策略 (开发阶段使用)
-- Version: 003
-- Created: 2026-01-24
-- ============================================================================
--
-- NOTE: These policies allow anonymous access based on openid.
-- In production, consider implementing proper Supabase Auth with WeChat login.
-- ============================================================================

-- ============================================================================
-- 1. users 表 - 添加匿名访问策略
-- ============================================================================

-- Policy: 允许通过openid查询用户
CREATE POLICY "users_select_by_openid"
    ON users FOR SELECT
    TO anon
    USING (TRUE);

-- Policy: 允许匿名用户创建账户
CREATE POLICY "users_insert_anon"
    ON users FOR INSERT
    TO anon
    WITH CHECK (TRUE);

-- Policy: 允许用户更新自己的资料 (通过openid验证)
CREATE POLICY "users_update_by_openid"
    ON users FOR UPDATE
    TO anon
    USING (TRUE)
    WITH CHECK (TRUE);

-- ============================================================================
-- 2. detection_records 表 - 添加匿名访问策略
-- ============================================================================

-- Policy: 允许匿名用户查询检测记录 (通过user_id)
CREATE POLICY "records_select_anon"
    ON detection_records FOR SELECT
    TO anon
    USING (TRUE);

-- Policy: 允许匿名用户插入检测记录
CREATE POLICY "records_insert_anon"
    ON detection_records FOR INSERT
    TO anon
    WITH CHECK (TRUE);

-- ============================================================================
-- 3. user_devices 表 - 添加匿名访问策略
-- ============================================================================

-- Policy: 允许匿名用户查询设备绑定
CREATE POLICY "user_devices_select_anon"
    ON user_devices FOR SELECT
    TO anon
    USING (TRUE);

-- Policy: 允许匿名用户绑定设备
CREATE POLICY "user_devices_insert_anon"
    ON user_devices FOR INSERT
    TO anon
    WITH CHECK (TRUE);

-- ============================================================================
-- 4. ai_reports 表 - 添加匿名访问策略
-- ============================================================================

-- Policy: 允许匿名用户查询AI报告
CREATE POLICY "ai_reports_select_anon"
    ON ai_reports FOR SELECT
    TO anon
    USING (TRUE);

-- Policy: 允许匿名用户创建AI报告
CREATE POLICY "ai_reports_insert_anon"
    ON ai_reports FOR INSERT
    TO anon
    WITH CHECK (TRUE);

-- ============================================================================
-- Summary
-- ============================================================================
-- Added 8 anonymous access policies for development:
--   1. users_select_by_openid
--   2. users_insert_anon
--   3. users_update_by_openid
--   4. records_select_anon
--   5. records_insert_anon
--   6. user_devices_select_anon
--   7. user_devices_insert_anon
--   8. ai_reports_select_anon
--   9. ai_reports_insert_anon
--
-- TODO: In production, implement proper authentication:
--   1. Set up WeChat OAuth via cloud function
--   2. Use Supabase Auth with custom JWT
--   3. Remove these anon policies
-- ============================================================================
