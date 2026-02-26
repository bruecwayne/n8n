# FAB Backend — Architecture

## System Overview

FAB (Fintrack Assist Bills) is a serverless backend that automatically scrapes bills from 5 Greek government and utility portals, stores them in a database, and sends email notifications before due dates.

```
                          ┌──────────────────┐
                          │    pg_cron        │
                          │  (5 scheduled     │
                          │   jobs)           │
                          └──────┬───────────┘
                                 │ HTTP POST (via pg_net)
                                 ▼
┌────────────┐         ┌──────────────────┐         ┌───────────────┐
│  Frontend  │────────▶│  Supabase Edge   │────────▶│ Browserless   │
│  (future)  │  JWT    │  Functions (4)   │  HTTP   │ .io (Puppeteer│
└────────────┘         └──────┬───────────┘         │  stealth)     │
                              │                      └───────┬───────┘
                              │ SQL                          │ Scrapes
                              ▼                              ▼
                       ┌──────────────┐         ┌───────────────────┐
                       │  Supabase    │         │  Greek Portals    │
                       │  Postgres    │         │  AADE, EFKA, DEH  │
                       │  (8 tables)  │         │  EYDAP, COSMOTE   │
                       └──────────────┘         └───────────────────┘
                              │
                              │ Bills due?
                              ▼
                       ┌──────────────┐
                       │   Resend     │
                       │   (email)    │
                       └──────────────┘
```

---

## Tech Stack

| Component | Technology | Purpose |
|-----------|-----------|---------|
| Database | Supabase Postgres | Tables, RLS, functions, pg_cron |
| Serverless | Supabase Edge Functions (Deno) | Business logic, API endpoints |
| Scraping | Browserless.io + Puppeteer | Headless browser for portal login |
| Email | Resend API | Notification delivery |
| Encryption | Web Crypto API (AES-256-GCM) | Credential storage |
| Auth | Supabase Auth (GoTrue) | User sessions, JWT tokens |
| Scheduler | pg_cron + pg_net | Automated daily tasks |

---

## Edge Functions (4)

### 1. `sync-bills` — The Core Scraper

**Purpose:** Logs into a provider portal via Browserless, scrapes bill data, stores results.

**Trigger:** Called by `trigger-daily-sync` or `add-provider-account`.

**Request body:**
```json
{ "provider_account_id": "uuid" }
```

**Internal flow:**
```
1. Receive provider_account_id
2. Fetch provider_account + provider config from DB
3. Decrypt password (AES-256-GCM via Web Crypto)
4. Create sync_job record (status: "running")
5. Build provider-specific scraper code string
6. POST to Browserless /function endpoint:
   - Stealth mode enabled (?launch={"stealth":true})
   - Credentials passed via `context` object (not string interpolation)
   - Scraper code runs in Browserless sandbox
7. Browserless executes: login → navigate → extract bills
8. Parse response (handles v1 and v2 response formats)
9. For each scraped bill:
   - Check for duplicate (user_id + provider_id + reference_number)
   - INSERT if new, skip if exists
10. Update sync_job (status: "completed" or "failed")
11. Update provider_account (last_sync_at, next_sync_at +24h)
```

**5 Provider Scrapers:**

| Provider | Login Method | Portal | Key Challenges |
|----------|-------------|--------|---------------|
| **AADE** | TaxisNet (GSIS) | aade.gr/myaade | 3 GSIS URL fallbacks (login.jsp, oauth2.gsis.gr, login.gsis.gr). `#amnt1`/`#amnt3` can be `<input>` or `<span>` — uses `.value \|\| .textContent` fallback. |
| **EFKA** | TaxisNet (GSIS) | apps.ika.gr/eAccess | Direct GSIS redirect via `/eAccess/gsis/login.xhtml` with fallback to SSO button text search using `page.evaluateHandle()`. |
| **DEH** | Email + Password | mydei.dei.gr | Next.js SPA — uses `waitNavOrSelector()` for client-side routing. |
| **EYDAP** | Account + Password | eydap.gr/myaccount | Tries `/userLogin/` then `/MyAccount/LogIn` (fallback URLs). Bills page also has fallback URLs. |
| **COSMOTE** | Phone/Email + Password | account.cosmote.gr | Two-step login (username page → password page). |

**Shared browser helpers** (injected as `BROWSER_HELPERS` string into all scrapers):
- `waitAny(page, selectors)` — Polls multiple selectors, returns first match. Has try-catch for invalid CSS.
- `safeType(page, selector, value)` — Click, select-all, type. Avoids appending to existing text.
- `waitNavOrSelector(page, selectors)` — Race between navigation and selector appearance (for SPAs).
- `parseAmount(text)` — Handles Greek (`1.234,56`) and English (`1,234.56`) number formats.
- `parseDate(text)` — Handles DD/MM/YYYY, Greek month names, ISO format.
- `snap(page, debug, label)` — Takes base64 screenshot, appends to debug log.
- `detectError(page)` — Checks for common error patterns in page content.

### 2. `add-provider-account` — Account Linking

**Purpose:** Encrypts credentials, stores provider account, triggers initial sync.

**Auth:** Requires authenticated user JWT (via `supabase.auth.getUser()`).

**Request body:**
```json
{ "provider_id": "DEH", "username": "user@email.com", "password": "secret" }
```

**Flow:**
```
1. Verify JWT → get user_id
2. Check if account already exists (.maybeSingle() — not .single())
3. Encrypt password with AES-256-GCM → { encrypted, iv }
4. Mask username for display (AFM: 123****89, Phone: 694****12, etc.)
5. INSERT into provider_accounts (or UPDATE if reconnecting)
6. Call sync-bills to test credentials immediately
7. Return success/failure with masked username
```

### 3. `send-notifications` — Email Alerts

**Purpose:** Finds bills due soon and sends email reminders via Resend.

**Request body:**
```json
{ "type": "d3" }  // or "d0"
```

**Flow:**
```
1. Calculate target date (today for d0, today+3 for d3)
2. Query bills WHERE status='pending' AND due_date=target AND notified_X=false
   - JOIN profiles (email, notification_preferences)
   - JOIN providers (name_el, icon)
3. For each bill:
   - Skip if user has email notifications disabled
   - Skip if provider join returned null
   - Build HTML email template (Greek language)
   - Send via Resend API (from address: RESEND_FROM_EMAIL env var)
   - Mark bill as notified (notified_d3=true or notified_d0=true)
   - Record in notifications table
4. Return count of sent notifications
```

### 4. `trigger-daily-sync` — Cron Orchestrator

**Purpose:** Loops through all connected accounts and calls `sync-bills` for each.

**Auth:** Service role key (called by pg_cron, not by users).

**Flow:**
```
1. Query provider_accounts WHERE status='connected' AND next_sync_at <= now()
2. For each account:
   - POST to sync-bills with provider_account_id
   - Wait 500ms between calls (Browserless rate limiting)
   - Track success/fail counts
3. Return summary
```

---

## Database Schema (8 Tables)

### Entity Relationship

```
auth.users (Supabase managed)
  │
  ├──▶ profiles (1:1) — name, phone, notification preferences
  │
  ├──▶ provider_accounts (1:many) — encrypted credentials per provider
  │     │
  │     ├──▶ sync_jobs (1:many) — scraping history, debug logs
  │     │
  │     └──▶ bills (1:many) — scraped invoices
  │           │
  │           └──▶ notifications (1:many) — email alert records
  │
  └──▶ audit_log (1:many) — security trail

providers (static lookup, 5 rows) ──▶ referenced by provider_accounts, bills
app_settings (key-value config)
```

### Table Details

| Table | Purpose | Key Fields | RLS |
|-------|---------|-----------|-----|
| `profiles` | User profile extending auth.users | email, full_name, notification_preferences (JSONB), timezone | Users see own |
| `providers` | Static lookup for 5 providers | id (TEXT PK), name_el, category, login_url, auth_method, scraper_status | Public read |
| `provider_accounts` | User's linked provider credentials | encrypted_password, encryption_iv, status, last_sync_at, next_sync_at | Users see own |
| `bills` | Scraped invoices/obligations | amount (DECIMAL 12,2), due_date, status, reference_number, notified_d3/d0 | Users see own |
| `sync_jobs` | Scraping job history | status, debug_log (JSONB), error_code, error_message, duration_ms | Users see own |
| `notifications` | Email notification records | type, channel, status, sent_at | Users see own |
| `audit_log` | Security audit trail | action, resource_type, ip_address, old/new_values | No RLS (admin only) |
| `app_settings` | Global configuration KV store | key (TEXT PK), value (JSONB) | Public read |

### Key Constraints & Indexes

- `provider_accounts`: UNIQUE(user_id, provider_id) — one account per provider per user
- `bills`: UNIQUE(user_id, provider_id, reference_number) — deduplicate scraped bills
- `idx_provider_accounts_next_sync`: Filtered index for sync scheduling
- `idx_bills_notifications`: Filtered index for notification queries (pending bills only)
- `idx_sync_jobs_retry`: Filtered index for failed jobs eligible for retry

### Database Functions

| Function | Trigger | Purpose |
|----------|---------|---------|
| `handle_new_user()` | AFTER INSERT on auth.users | Auto-create profile row on signup |
| `update_bill_status()` | BEFORE UPDATE on bills | Auto-mark as overdue if past due_date |
| `mark_overdue_bills()` | pg_cron (midnight) | Batch-mark all overdue pending bills |
| `cleanup_old_data()` | pg_cron (Sunday 3AM) | Delete sync_jobs >30d, audit_log >90d, read notifications >60d |
| `mask_username()` | Called by application | Mask credentials for display (AFM: 123****89) |

---

## Scheduled Jobs (pg_cron)

| Job Name | Schedule | What It Does |
|----------|----------|-------------|
| `daily-sync-trigger` | 6:00 AM daily | HTTP POST to `trigger-daily-sync` |
| `notifications-d0` | 8:30 AM daily | HTTP POST to `send-notifications` with `{"type":"d0"}` |
| `notifications-d3` | 9:30 AM daily | HTTP POST to `send-notifications` with `{"type":"d3"}` |
| `mark-overdue-bills` | Midnight daily | SQL: `SELECT mark_overdue_bills()` |
| `weekly-cleanup` | Sunday 3 AM | SQL: `SELECT cleanup_old_data()` |

The HTTP jobs use `pg_net.http_post()` with the service role key in the Authorization header.

---

## Security Model

### Credential Encryption
- Passwords encrypted with **AES-256-GCM** via Web Crypto API
- Key stored as Supabase secret (`ENCRYPTION_KEY`), never in database
- Random 12-byte IV per encryption, stored alongside ciphertext
- Credentials passed to Browserless via `context` object (never string-interpolated into JS code)

### Row Level Security (RLS)
- All user-facing tables have RLS enabled
- Users can only see/modify their own data (`auth.uid() = user_id`)
- `providers` and `app_settings` are public-read
- `audit_log` has no RLS (admin access via service role only)

### Authentication
- `add-provider-account`: Requires user JWT from `supabase.auth.getUser()`
- `trigger-daily-sync`, `send-notifications`: Require service role key (called by cron)
- `sync-bills`: Accepts both (called by user via add-provider-account, or by cron via trigger-daily-sync)

---

## Data Flow: Complete Lifecycle

### 1. User Connects a Provider
```
Frontend → add-provider-account (JWT) → encrypt password → store in DB → call sync-bills → Browserless → scrape portal → store bills
```

### 2. Daily Automatic Sync
```
pg_cron (6 AM) → trigger-daily-sync → for each account: sync-bills → Browserless → scrape → upsert bills
```

### 3. Notification Emails
```
pg_cron (8:30/9:30 AM) → send-notifications → query due bills → Resend API → user inbox
```

### 4. Overdue Marking
```
pg_cron (midnight) → mark_overdue_bills() → UPDATE bills SET status='overdue'
```

### 5. Cleanup
```
pg_cron (Sunday 3 AM) → cleanup_old_data() → DELETE old sync_jobs, audit_log, notifications
```

---

## Environment Variables

| Variable | Required | Used By | Purpose |
|----------|----------|---------|---------|
| `SUPABASE_URL` | Auto | All functions | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Auto | All functions | Admin database access |
| `BROWSERLESS_URL` | Yes | sync-bills | Browserless endpoint |
| `BROWSERLESS_TOKEN` | Yes | sync-bills | Browserless API key |
| `ENCRYPTION_KEY` | Yes | sync-bills, add-provider-account | AES-256-GCM key (base64) |
| `RESEND_API_KEY` | Yes | send-notifications | Resend email API key |
| `RESEND_FROM_EMAIL` | Optional | send-notifications | Sender address (default: `FAB <notifications@fab.gr>`) |
| `SCRAPER_TIMEOUT_MS` | Optional | sync-bills | Browserless timeout (default: 120000) |

---

## Error Handling

### Scraper Error Codes
| Code | Meaning |
|------|---------|
| `LOGIN_FAILED` | Invalid credentials |
| `2FA_REQUIRED` | Portal requested OTP/2FA |
| `SCRAPER_BROKEN` | Portal layout changed, selectors don't match |
| `SCRAPER_ERROR` | Unexpected runtime error |

### Resilience Patterns
- **Fallback URLs**: EYDAP and AADE scrapers try multiple login URLs
- **Fallback selectors**: EFKA tries direct GSIS redirect, then SSO button text search
- **Response format handling**: `runBrowserless()` handles both v1 and v2 Browserless response formats
- **Null guards**: All DB operation results are null-checked before use
- **Try-catch on `req.json()`**: Malformed request bodies return 400 instead of crashing
- **AbortSignal timeout**: Safety net if Browserless ignores its own timeout parameter
