-- FAB (Fintrack Assist Bills) - pg_cron Scheduled Jobs
-- Migration: Set up recurring cron jobs
-- Run order: 3 of 3
--
-- NOTE: Replace YOUR_PROJECT_REF and YOUR_SERVICE_ROLE_KEY with actual values
-- before running this migration. pg_cron and pg_net extensions must be enabled
-- in your Supabase project dashboard first.

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- ============================================================
-- Daily sync trigger at 6 AM Athens time (UTC+2 / UTC+3 DST)
-- ============================================================
SELECT cron.schedule(
  'daily-sync-trigger',
  '0 6 * * *',
  $$SELECT net.http_post(
    url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/trigger-daily-sync',
    headers := '{"Authorization": "Bearer YOUR_SERVICE_ROLE_KEY", "Content-Type": "application/json"}'::jsonb
  )$$
);

-- ============================================================
-- Mark overdue bills at midnight
-- ============================================================
SELECT cron.schedule(
  'mark-overdue-bills',
  '0 0 * * *',
  $$SELECT public.mark_overdue_bills()$$
);

-- ============================================================
-- Send D-3 notifications at 9:30 AM
-- ============================================================
SELECT cron.schedule(
  'notifications-d3',
  '30 9 * * *',
  $$SELECT net.http_post(
    url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/send-notifications',
    headers := '{"Authorization": "Bearer YOUR_SERVICE_ROLE_KEY", "Content-Type": "application/json"}'::jsonb,
    body := '{"type": "d3"}'::jsonb
  )$$
);

-- ============================================================
-- Send D-0 notifications at 8:30 AM
-- ============================================================
SELECT cron.schedule(
  'notifications-d0',
  '30 8 * * *',
  $$SELECT net.http_post(
    url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/send-notifications',
    headers := '{"Authorization": "Bearer YOUR_SERVICE_ROLE_KEY", "Content-Type": "application/json"}'::jsonb,
    body := '{"type": "d0"}'::jsonb
  )$$
);

-- ============================================================
-- Cleanup old data weekly on Sunday at 3 AM
-- ============================================================
SELECT cron.schedule(
  'weekly-cleanup',
  '0 3 * * 0',
  $$SELECT public.cleanup_old_data()$$
);
