-- FAB (Fintrack Assist Bills) - Database Functions & Triggers
-- Migration: Create utility functions, triggers
-- Run order: 2 of 3

-- ============================================================
-- Username masking function
-- ============================================================
CREATE OR REPLACE FUNCTION public.mask_username(username TEXT, provider_id TEXT)
RETURNS TEXT AS $$
BEGIN
  CASE provider_id
    WHEN 'AADE', 'EFKA' THEN
      -- AFM: Show first 3, mask middle, show last 2
      RETURN LEFT(username, 3) || '****' || RIGHT(username, 2);
    WHEN 'DEH', 'EYDAP' THEN
      -- Account number: Show last 4
      RETURN '****' || RIGHT(username, 4);
    WHEN 'COSMOTE' THEN
      -- Phone: Show first 3, mask middle, show last 2
      IF username ~ '^[0-9]+$' THEN
        RETURN LEFT(username, 3) || '****' || RIGHT(username, 2);
      ELSE
        -- Email: show first 2 chars + mask + domain
        RETURN LEFT(SPLIT_PART(username, '@', 1), 2) || '***@' || SPLIT_PART(username, '@', 2);
      END IF;
    ELSE
      RETURN '****' || RIGHT(username, 4);
  END CASE;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ============================================================
-- Bill status auto-updater trigger
-- ============================================================
CREATE OR REPLACE FUNCTION public.update_bill_status()
RETURNS TRIGGER AS $$
BEGIN
  -- Auto-update to overdue if past due date
  IF NEW.status = 'pending' AND NEW.due_date < CURRENT_DATE THEN
    NEW.status := 'overdue';
  END IF;

  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_bill_status_trigger
  BEFORE UPDATE ON public.bills
  FOR EACH ROW EXECUTE FUNCTION public.update_bill_status();

-- ============================================================
-- Daily overdue check function
-- ============================================================
CREATE OR REPLACE FUNCTION public.mark_overdue_bills()
RETURNS INTEGER AS $$
DECLARE
  updated_count INTEGER;
BEGIN
  UPDATE public.bills
  SET status = 'overdue', updated_at = NOW()
  WHERE status = 'pending' AND due_date < CURRENT_DATE;

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- Cleanup old data function
-- ============================================================
CREATE OR REPLACE FUNCTION public.cleanup_old_data()
RETURNS TABLE(sync_jobs_deleted INTEGER, audit_logs_deleted INTEGER, notifications_deleted INTEGER) AS $$
DECLARE
  sj INTEGER;
  al INTEGER;
  nt INTEGER;
BEGIN
  -- Delete sync jobs older than 30 days
  DELETE FROM public.sync_jobs WHERE created_at < NOW() - INTERVAL '30 days';
  GET DIAGNOSTICS sj = ROW_COUNT;

  -- Delete audit logs older than 90 days
  DELETE FROM public.audit_log WHERE created_at < NOW() - INTERVAL '90 days';
  GET DIAGNOSTICS al = ROW_COUNT;

  -- Delete read notifications older than 60 days
  DELETE FROM public.notifications WHERE read_at IS NOT NULL AND created_at < NOW() - INTERVAL '60 days';
  GET DIAGNOSTICS nt = ROW_COUNT;

  RETURN QUERY SELECT sj, al, nt;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
