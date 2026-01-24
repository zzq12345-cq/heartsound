-- ============================================================================
-- HeartSound Database Schema - Initial Migration
-- 心音智鉴数据库初始化脚本
-- Version: 001
-- Created: 2026-01-24
-- ============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- 1. users - 用户表
-- ============================================================================
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    openid VARCHAR(64) UNIQUE NOT NULL,          -- 微信openid
    nickname VARCHAR(50),                         -- 微信昵称
    avatar_url TEXT,                              -- 头像URL
    phone VARCHAR(20),                            -- 手机号（可选）
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 索引: 加速openid查询
CREATE INDEX idx_users_openid ON users(openid);

COMMENT ON TABLE users IS '用户表 - 存储微信小程序用户信息';
COMMENT ON COLUMN users.openid IS '微信用户唯一标识';

-- ============================================================================
-- 2. devices - 设备表
-- ============================================================================
CREATE TABLE devices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id VARCHAR(50) UNIQUE NOT NULL,       -- 设备唯一标识 RPi-HS-001
    device_name VARCHAR(100) DEFAULT '心音智鉴设备',
    firmware_version VARCHAR(20),                 -- 固件版本
    model_version VARCHAR(20),                    -- AI模型版本
    last_ip VARCHAR(45),                          -- 最后连接IP
    last_seen_at TIMESTAMPTZ,                     -- 最后在线时间
    created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE devices IS '设备表 - 存储树莓派边缘设备信息';
COMMENT ON COLUMN devices.device_id IS '设备唯一标识，如 RPi-HS-001';

-- ============================================================================
-- 3. user_devices - 用户设备绑定表
-- ============================================================================
CREATE TABLE user_devices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    device_id UUID REFERENCES devices(id) ON DELETE CASCADE,
    bind_at TIMESTAMPTZ DEFAULT NOW(),
    is_primary BOOLEAN DEFAULT FALSE,            -- 是否为主设备
    UNIQUE(user_id, device_id)
);

-- 索引: 加速用户设备查询
CREATE INDEX idx_user_devices_user ON user_devices(user_id);

COMMENT ON TABLE user_devices IS '用户设备绑定关系表';

-- ============================================================================
-- 4. detection_records - 检测记录表
-- ============================================================================
CREATE TABLE detection_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    device_id UUID REFERENCES devices(id),

    -- 检测结果
    result_category VARCHAR(50) NOT NULL,         -- 'normal', 'systolic_murmur', etc.
    result_label VARCHAR(100) NOT NULL,           -- 显示文案：'心脏节律正常'
    confidence DECIMAL(5,2) NOT NULL,             -- 置信度 0-100
    risk_level VARCHAR(20) NOT NULL,              -- 'safe', 'warning', 'danger'

    -- 详细概率分布 (JSONB)
    probabilities JSONB NOT NULL,
    /* 示例:
    {
        "normal": 94.7,
        "systolic_murmur": 3.2,
        "diastolic_murmur": 1.1,
        "extra_heart_sound": 0.8,
        "aortic_stenosis": 0.2
    }
    */

    -- 健康建议 (JSONB)
    health_advice JSONB,
    /* 示例:
    {
        "summary": "心音正常，继续保持良好生活习惯",
        "suggestions": ["每月定期检测", "适度运动"],
        "action": "建议每月进行1-2次自我检测"
    }
    */

    -- 元数据
    duration_seconds INTEGER DEFAULT 30,          -- 录制时长
    audio_file_path TEXT,                         -- 音频文件路径（Supabase Storage）

    created_at TIMESTAMPTZ DEFAULT NOW(),

    -- 约束
    CONSTRAINT valid_risk_level CHECK (risk_level IN ('safe', 'warning', 'danger'))
);

-- 索引: 优化常用查询
CREATE INDEX idx_records_user ON detection_records(user_id);
CREATE INDEX idx_records_created ON detection_records(created_at DESC);
CREATE INDEX idx_records_risk ON detection_records(risk_level);

COMMENT ON TABLE detection_records IS '检测记录表 - 存储心音检测结果和AI分析';
COMMENT ON COLUMN detection_records.probabilities IS 'AI模型输出的各分类概率分布';
COMMENT ON COLUMN detection_records.health_advice IS 'AI生成的健康建议JSON';

-- ============================================================================
-- 5. health_tips - 健康小贴士表
-- ============================================================================
CREATE TABLE health_tips (
    id SERIAL PRIMARY KEY,
    content TEXT NOT NULL,                        -- 贴士内容
    category VARCHAR(50) DEFAULT 'general',       -- 分类
    is_active BOOLEAN DEFAULT TRUE,
    display_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE health_tips IS '健康小贴士表 - 首页展示的健康知识';

-- ============================================================================
-- 6. admins - 管理员表
-- ============================================================================
CREATE TABLE admins (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    openid VARCHAR(64) UNIQUE NOT NULL,          -- 微信openid
    nickname VARCHAR(50),
    avatar_url TEXT,
    role VARCHAR(20) DEFAULT 'super_admin',      -- super_admin
    permissions JSONB DEFAULT '["*"]',           -- 权限列表，*表示全部
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_login_at TIMESTAMPTZ
);

COMMENT ON TABLE admins IS '管理员表 - 管理后台用户';

-- ============================================================================
-- 7. admin_logs - 管理操作日志表
-- ============================================================================
CREATE TABLE admin_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id UUID REFERENCES admins(id),
    action VARCHAR(100) NOT NULL,                -- 操作类型
    target_type VARCHAR(50),                     -- 操作对象类型
    target_id UUID,                              -- 操作对象ID
    details JSONB,                               -- 操作详情
    ip_address VARCHAR(45),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 索引
CREATE INDEX idx_admin_logs_admin ON admin_logs(admin_id);
CREATE INDEX idx_admin_logs_created ON admin_logs(created_at DESC);

COMMENT ON TABLE admin_logs IS '管理操作日志表 - 记录所有管理员操作';

-- ============================================================================
-- 8. ai_reports - AI生成报告表
-- ============================================================================
CREATE TABLE ai_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    report_type VARCHAR(50) DEFAULT 'health_summary',
    report_period VARCHAR(50),                   -- 如 "30天"
    report_content JSONB NOT NULL,               -- 报告JSON内容
    pdf_path TEXT,                               -- PDF文件路径
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 索引
CREATE INDEX idx_ai_reports_user ON ai_reports(user_id);
CREATE INDEX idx_ai_reports_created ON ai_reports(created_at DESC);

COMMENT ON TABLE ai_reports IS 'AI健康报告表 - Dify Workflow生成的智能报告';

-- ============================================================================
-- 9. report_tasks - 报表导出任务表
-- ============================================================================
CREATE TABLE report_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id UUID REFERENCES admins(id),
    report_type VARCHAR(50) NOT NULL,
    status VARCHAR(20) DEFAULT 'pending',        -- pending | processing | completed | failed
    progress INTEGER DEFAULT 0,

    -- 参数
    params JSONB NOT NULL,
    /* 示例:
    {
        "start_date": "2024-01-01",
        "end_date": "2024-01-17",
        "format": "xlsx"
    }
    */

    -- 结果
    file_name VARCHAR(255),
    file_path TEXT,                              -- Supabase Storage 路径
    file_size INTEGER,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ                       -- 文件过期时间（7天后）
);

-- 索引
CREATE INDEX idx_report_tasks_admin ON report_tasks(admin_id);
CREATE INDEX idx_report_tasks_status ON report_tasks(status);

COMMENT ON TABLE report_tasks IS '报表导出任务表 - 管理后台异步报表生成';

-- ============================================================================
-- Trigger: 自动更新 updated_at
-- ============================================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- Summary
-- ============================================================================
-- Tables created: 9
--   1. users - 用户表
--   2. devices - 设备表
--   3. user_devices - 用户设备绑定表
--   4. detection_records - 检测记录表
--   5. health_tips - 健康小贴士表
--   6. admins - 管理员表
--   7. admin_logs - 管理操作日志表
--   8. ai_reports - AI生成报告表
--   9. report_tasks - 报表导出任务表
--
-- Indexes created: 5 main + 4 admin
--   1. idx_users_openid
--   2. idx_user_devices_user
--   3. idx_records_user
--   4. idx_records_created
--   5. idx_records_risk
-- ============================================================================
