-- ============================================================================
-- HeartSound AI Tables Migration
-- 心音智鉴 AI相关表迁移
-- Version: 004
-- Created: 2026-01-24
-- ============================================================================

-- ============================================================================
-- 1. ai_conversations - AI对话记录表
-- ============================================================================
CREATE TABLE ai_conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    dify_conversation_id VARCHAR(100),          -- Dify对话ID
    title VARCHAR(200),                          -- 对话标题（首条消息摘要）
    message_count INTEGER DEFAULT 0,             -- 消息数量
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_message_at TIMESTAMPTZ DEFAULT NOW()
);

-- 索引
CREATE INDEX idx_ai_conversations_user ON ai_conversations(user_id);
CREATE INDEX idx_ai_conversations_dify ON ai_conversations(dify_conversation_id);

COMMENT ON TABLE ai_conversations IS 'AI对话记录表 - 存储与健康助手的对话';
COMMENT ON COLUMN ai_conversations.dify_conversation_id IS 'Dify平台返回的对话ID';

-- ============================================================================
-- 2. ai_reports - AI健康报告表
-- ============================================================================
CREATE TABLE ai_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    report_type VARCHAR(20) NOT NULL,            -- weekly, monthly, custom
    report_period_start DATE,                    -- 报告起始日期
    report_period_end DATE,                      -- 报告结束日期
    report_content TEXT NOT NULL,                -- 报告内容（Markdown）
    detection_count INTEGER DEFAULT 0,           -- 包含的检测记录数
    summary JSONB,                               -- 统计摘要
    /* 示例:
    {
        "total_detections": 12,
        "safe_count": 10,
        "warning_count": 2,
        "danger_count": 0,
        "average_confidence": 92.5
    }
    */
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 索引
CREATE INDEX idx_ai_reports_user ON ai_reports(user_id);
CREATE INDEX idx_ai_reports_type ON ai_reports(report_type);
CREATE INDEX idx_ai_reports_created ON ai_reports(created_at DESC);

COMMENT ON TABLE ai_reports IS 'AI健康报告表 - 存储智能生成的健康分析报告';
COMMENT ON COLUMN ai_reports.report_content IS 'AI生成的报告Markdown内容';

-- ============================================================================
-- 3. RLS Policies - 行级安全策略
-- ============================================================================

-- ai_conversations RLS
ALTER TABLE ai_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_conversations_select_anon"
    ON ai_conversations FOR SELECT
    TO anon
    USING (TRUE);

CREATE POLICY "ai_conversations_insert_anon"
    ON ai_conversations FOR INSERT
    TO anon
    WITH CHECK (TRUE);

CREATE POLICY "ai_conversations_update_anon"
    ON ai_conversations FOR UPDATE
    TO anon
    USING (TRUE)
    WITH CHECK (TRUE);

-- ai_reports RLS
ALTER TABLE ai_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_reports_select_anon"
    ON ai_reports FOR SELECT
    TO anon
    USING (TRUE);

CREATE POLICY "ai_reports_insert_anon"
    ON ai_reports FOR INSERT
    TO anon
    WITH CHECK (TRUE);

-- ============================================================================
-- Summary
-- ============================================================================
-- Tables Created: 2
--   1. ai_conversations - AI对话记录
--   2. ai_reports - AI健康报告
--
-- Indexes Created: 5
-- RLS Policies Created: 5
-- ============================================================================
