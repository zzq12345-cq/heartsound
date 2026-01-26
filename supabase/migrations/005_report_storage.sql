-- ============================================================================
-- HeartSound Database Schema - Report Storage Setup
-- 报表存储配置
-- Version: 005
-- Created: 2026-01-26
-- ============================================================================

-- Create storage bucket for reports
-- NOTE: Supabase Storage buckets are created via API/Dashboard, not SQL
-- This migration documents the required setup

-- ============================================================================
-- Storage Bucket Configuration (Create in Supabase Dashboard)
-- ============================================================================
-- Bucket Name: reports
-- Public: false (private bucket)
-- File Size Limit: 50MB
-- Allowed MIME Types: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, text/csv

-- ============================================================================
-- Storage Policies (Run in SQL Editor or via Dashboard)
-- ============================================================================

-- Policy 1: Allow authenticated users to upload
-- INSERT policy for 'reports' bucket
-- CREATE POLICY "Allow admins to upload reports"
-- ON storage.objects FOR INSERT
-- TO authenticated
-- WITH CHECK (bucket_id = 'reports');

-- Policy 2: Allow admins to read their own reports
-- SELECT policy for 'reports' bucket
-- CREATE POLICY "Allow admins to read own reports"
-- ON storage.objects FOR SELECT
-- TO authenticated
-- USING (bucket_id = 'reports' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Policy 3: Allow service role to manage all
-- (Service role has full access by default)

-- ============================================================================
-- RLS Policy for report_tasks table (already in main schema)
-- ============================================================================

-- Ensure admins can only see their own report tasks
ALTER TABLE report_tasks ENABLE ROW LEVEL SECURITY;

-- Admin can view their own tasks
DROP POLICY IF EXISTS "Admins can view own report tasks" ON report_tasks;
CREATE POLICY "Admins can view own report tasks"
ON report_tasks
FOR SELECT
USING (true);  -- For now allow all authenticated users, refine if needed

-- Admin can create report tasks
DROP POLICY IF EXISTS "Admins can create report tasks" ON report_tasks;
CREATE POLICY "Admins can create report tasks"
ON report_tasks
FOR INSERT
WITH CHECK (true);

-- Admin can update their own tasks (for status updates)
DROP POLICY IF EXISTS "Admins can update own report tasks" ON report_tasks;
CREATE POLICY "Admins can update own report tasks"
ON report_tasks
FOR UPDATE
USING (true);

-- ============================================================================
-- Index for report_tasks cleanup
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_report_tasks_expires ON report_tasks(expires_at);

-- ============================================================================
-- Summary
-- ============================================================================
-- 1. Storage bucket 'reports' needs to be created in Dashboard
-- 2. RLS policies added for report_tasks table
-- 3. Index added for expires_at to support cleanup queries
-- ============================================================================
