-- FAB (Fintrack Assist Bills) - Database Schema
-- Migration: Create all tables
-- Run order: 1 of 3

-- ============================================================
-- 1. profiles (extends auth.users)
-- ============================================================
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  phone TEXT,
  notification_preferences JSONB DEFAULT '{"email": true, "push": true, "sms": false}'::jsonb,
  timezone TEXT DEFAULT 'Europe/Athens',
  language TEXT DEFAULT 'el',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data->>'full_name');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- ============================================================
-- 2. providers (static lookup table)
-- ============================================================
CREATE TABLE public.providers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  name_el TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('tax', 'insurance', 'electricity', 'water', 'telecom')),
  icon TEXT,
  color TEXT,
  login_url TEXT,
  portal_url TEXT,
  auth_method TEXT CHECK (auth_method IN ('taxisnet', 'email_password', 'account_number', 'phone_password')),
  requires_2fa BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,
  scraper_status TEXT DEFAULT 'active' CHECK (scraper_status IN ('active', 'maintenance', 'broken')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed data
INSERT INTO public.providers (id, name, name_el, category, icon, color, login_url, portal_url, auth_method, requires_2fa) VALUES
  ('AADE', 'AADE/Taxisnet', 'ΑΑΔΕ/Taxisnet', 'tax', '🏛️', '#1E40AF', 'https://www1.aade.gr/taxisnet/', 'https://www.aade.gr/myaade', 'taxisnet', true),
  ('EFKA', 'e-EFKA', 'e-ΕΦΚΑ', 'insurance', '🛡️', '#166534', 'https://www.efka.gov.gr/el/elektronikes-yperesies', 'https://apps.ika.gr/eAccess/', 'taxisnet', true),
  ('DEH', 'DEI/PPC', 'ΔΕΗ', 'electricity', '⚡', '#D97706', 'https://mydei.dei.gr/el/login/', 'https://mydei.dei.gr/', 'email_password', false),
  ('EYDAP', 'EYDAP', 'ΕΥΔΑΠ', 'water', '💧', '#0891B2', 'https://www.eydap.gr/myaccount/', 'https://www.eydap.gr/', 'account_number', false),
  ('COSMOTE', 'COSMOTE', 'COSMOTE', 'telecom', '📱', '#9333EA', 'https://account.cosmote.gr/', 'https://my.cosmote.gr/', 'phone_password', false);

-- Public read access
ALTER TABLE public.providers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view providers" ON public.providers FOR SELECT USING (true);

-- ============================================================
-- 3. provider_accounts (user's connected accounts)
-- ============================================================
CREATE TABLE public.provider_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider_id TEXT NOT NULL REFERENCES public.providers(id),

  -- Credentials (encrypted at application layer)
  username TEXT NOT NULL,
  encrypted_password TEXT NOT NULL,
  encryption_iv TEXT NOT NULL,

  -- Masking for display
  username_masked TEXT NOT NULL,

  -- Status tracking
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'connected', 'syncing', 'error', 'needs_otp', 'locked', 'disconnected')),
  status_message TEXT,

  -- Sync metadata
  last_sync_at TIMESTAMPTZ,
  last_sync_success BOOLEAN,
  last_sync_bills_found INTEGER DEFAULT 0,
  next_sync_at TIMESTAMPTZ,
  sync_count INTEGER DEFAULT 0,
  error_count INTEGER DEFAULT 0,

  -- Session storage for Puppeteer
  session_cookies JSONB,
  session_expires_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(user_id, provider_id)
);

-- RLS
ALTER TABLE public.provider_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own provider accounts" ON public.provider_accounts
  FOR ALL USING (auth.uid() = user_id);

-- Indexes
CREATE INDEX idx_provider_accounts_next_sync ON public.provider_accounts(next_sync_at) WHERE status = 'connected';
CREATE INDEX idx_provider_accounts_user ON public.provider_accounts(user_id);

-- ============================================================
-- 4. bills (obligations/invoices)
-- ============================================================
CREATE TABLE public.bills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider_account_id UUID REFERENCES public.provider_accounts(id) ON DELETE SET NULL,
  provider_id TEXT NOT NULL REFERENCES public.providers(id),

  -- Bill details
  title TEXT NOT NULL,
  description TEXT,
  bill_type TEXT,

  -- Financial
  amount DECIMAL(12,2) NOT NULL,
  currency TEXT DEFAULT 'EUR',

  -- Dates
  due_date DATE NOT NULL,
  issue_date DATE,
  period_start DATE,
  period_end DATE,

  -- Status
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'overdue', 'partial', 'cancelled')),
  paid_at TIMESTAMPTZ,
  paid_amount DECIMAL(12,2),

  -- Reference
  reference_number TEXT,
  barcode TEXT,
  payment_code TEXT,

  -- Source tracking
  source TEXT DEFAULT 'scraped' CHECK (source IN ('scraped', 'manual', 'api', 'ocr')),
  scraped_at TIMESTAMPTZ,

  -- Evidence
  screenshot_url TEXT,
  pdf_url TEXT,
  raw_data JSONB,

  -- Notification tracking
  notified_d3 BOOLEAN DEFAULT FALSE,
  notified_d0 BOOLEAN DEFAULT FALSE,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Prevent duplicates
  UNIQUE(user_id, provider_id, reference_number)
);

-- RLS
ALTER TABLE public.bills ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own bills" ON public.bills FOR ALL USING (auth.uid() = user_id);

-- Indexes
CREATE INDEX idx_bills_user_due ON public.bills(user_id, due_date);
CREATE INDEX idx_bills_status ON public.bills(status) WHERE status IN ('pending', 'overdue');
CREATE INDEX idx_bills_notifications ON public.bills(due_date, notified_d3, notified_d0) WHERE status = 'pending';

-- ============================================================
-- 5. sync_jobs (job queue)
-- ============================================================
CREATE TABLE public.sync_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_account_id UUID NOT NULL REFERENCES public.provider_accounts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Job status
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
  job_type TEXT DEFAULT 'scheduled' CHECK (job_type IN ('scheduled', 'manual', 'retry', 'initial')),
  priority INTEGER DEFAULT 5,

  -- Execution
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER,

  -- Results
  bills_found INTEGER DEFAULT 0,
  bills_new INTEGER DEFAULT 0,
  bills_updated INTEGER DEFAULT 0,

  -- Error handling
  error_code TEXT,
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  next_retry_at TIMESTAMPTZ,

  -- Debug
  debug_log JSONB DEFAULT '[]'::jsonb,
  screenshot_url TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE public.sync_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own sync jobs" ON public.sync_jobs FOR SELECT USING (auth.uid() = user_id);

-- Indexes
CREATE INDEX idx_sync_jobs_pending ON public.sync_jobs(priority DESC, created_at) WHERE status = 'pending';
CREATE INDEX idx_sync_jobs_retry ON public.sync_jobs(next_retry_at) WHERE status = 'failed' AND retry_count < max_retries;

-- ============================================================
-- 6. notifications
-- ============================================================
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  bill_id UUID REFERENCES public.bills(id) ON DELETE CASCADE,

  -- Notification type
  type TEXT NOT NULL CHECK (type IN ('bill_due_d3', 'bill_due_d0', 'bill_overdue', 'sync_failed', 'sync_success', 'account_connected', 'system')),
  channel TEXT NOT NULL CHECK (channel IN ('email', 'push', 'sms', 'in_app')),

  -- Content
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  action_url TEXT,
  data JSONB,

  -- Status
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'delivered', 'failed', 'read')),
  sent_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ,
  error_message TEXT,

  -- Scheduling
  scheduled_for TIMESTAMPTZ DEFAULT NOW(),

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own notifications" ON public.notifications FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update own notifications" ON public.notifications FOR UPDATE USING (auth.uid() = user_id);

-- Indexes
CREATE INDEX idx_notifications_pending ON public.notifications(scheduled_for) WHERE status = 'pending';
CREATE INDEX idx_notifications_user ON public.notifications(user_id, created_at DESC);

-- ============================================================
-- 7. audit_log (security audit trail)
-- ============================================================
CREATE TABLE public.audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Action details
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT,

  -- Context
  ip_address INET,
  user_agent TEXT,

  -- Change tracking
  old_values JSONB,
  new_values JSONB,

  -- Status
  success BOOLEAN DEFAULT TRUE,
  error_message TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- No RLS - admin only via service role
-- Retention: auto-delete after 90 days
CREATE INDEX idx_audit_log_user ON public.audit_log(user_id, created_at DESC);
CREATE INDEX idx_audit_log_action ON public.audit_log(action, created_at DESC);

-- ============================================================
-- 8. app_settings (global configuration)
-- ============================================================
CREATE TABLE public.app_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  description TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by UUID REFERENCES auth.users(id)
);

-- Seed settings
INSERT INTO public.app_settings (key, value, description) VALUES
  ('sync_schedule', '"0 6 * * *"'::jsonb, 'Cron expression for daily sync (6 AM Athens time)'),
  ('notification_d3_time', '"09:30"'::jsonb, 'Time to send D-3 notifications'),
  ('notification_d0_time', '"08:30"'::jsonb, 'Time to send D-0 notifications'),
  ('max_retries', '3'::jsonb, 'Maximum sync retry attempts'),
  ('retry_backoff_minutes', '[5, 30, 120]'::jsonb, 'Backoff intervals for retries'),
  ('scraper_timeout_ms', '60000'::jsonb, 'Browserless scraper timeout'),
  ('maintenance_mode', 'false'::jsonb, 'Global maintenance mode flag');

-- Public read for app settings
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read settings" ON public.app_settings FOR SELECT USING (true);
