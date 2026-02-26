# FAB Backend — Production Deployment Plan

> **Status:** Draft v1
> **Created:** February 2026
> **Scope:** Fix all issues identified in code review, prepare for production deployment
> **Approach:** Staged, with go/no-go gates between phases

---

## Dependency Graph

```
Phase 0: Context Gathering (no code changes)
    │
    ▼
Phase 1: Data Integrity ─── CRITICAL ─── blocks everything
    │   Fix: Deterministic reference numbers
    │   Fix: DEH page.evaluate() serialization bug
    │
    ▼
Phase 2: Security Hardening ─── CRITICAL
    │   Fix: Auth check on sync-bills
    │   Fix: CORS restriction
    │   Fix: req.json() try-catch in add-provider-account
    │   Fix: Storage RLS policy
    │
    ▼
Phase 3: Reliability ─── HIGH
    │   Fix: Retry logic for failed syncs
    │   Fix: Provider circuit breaker
    │   Fix: trigger-daily-sync timeout + idempotency
    │
    ▼
Phase 4: Operational Readiness ─── MEDIUM
    │   Add: Health check endpoint
    │   Add: Admin alerting
    │   Add: Structured logging
    │
    ▼
Phase 5: Validation & Deployment
    End-to-end testing checklist
    Rollback procedures
```

---

## Phase 0: Context Gathering & Decisions

**Goal:** Collect all information needed before writing any code.

### Decisions Required (from product owner)

| # | Decision | Options | Impact |
|---|----------|---------|--------|
| D1 | What is the frontend domain? | e.g., `fab.gr`, `app.fab.gr`, `localhost:3000` during dev | Needed for CORS restriction (Phase 2) |
| D2 | How many users at launch? | <10, 10-50, 50+ | Determines if sequential sync is acceptable (Phase 3) |
| D3 | Should `config.toml` `site_url` be updated? | Currently hardcoded to `https://fab.gr` | Affects Supabase auth email links |
| D4 | Is Browserless on v1 or v2? | Check dashboard or `GET /` response | Determines if `export default` scrapers are correct |
| D5 | Should plaintext usernames be encrypted? | AFM numbers (AADE/EFKA) are PII | Scope increase if yes — affects all scraper code |
| D6 | Resend verified domain? | What domain is verified for `RESEND_FROM_EMAIL`? | Needed for `config.toml` `site_url` alignment |

### Information to Verify

| # | Check | How | Why |
|---|-------|-----|-----|
| V1 | Browserless API version | `curl $BROWSERLESS_URL/` or check dashboard | Confirms `export default` vs `module.exports` |
| V2 | Browserless auth method | Check docs: token in URL vs header | Security concern from review |
| V3 | Supabase Edge Function timeout | Dashboard > Edge Functions > Settings | Default is 150s; sync-bills may need more |
| V4 | Supabase project plan | Free vs Pro | Free has 500K Edge Function invocations/month |
| V5 | pg_cron timezone | `SHOW timezone;` in SQL Editor | Cron schedule `0 6 * * *` — is this UTC or Athens? |

### Phase 0 Deliverable
A filled-in version of the tables above. No code changes.

### Go/No-Go → Phase 1
- All D1-D6 decisions documented
- V1-V5 verified
- Stakeholder sign-off on scope

---

## Phase 1: Data Integrity Fixes

**Why Critical:** Every daily sync currently creates duplicate bills. This is the #1 data corruption issue. Must be fixed before any real user data enters the system.

**Complexity:** 3/5
**Estimated scope:** ~80 lines changed in 1 file

### Fix 1.1: Deterministic Reference Numbers

**Problem:** When scrapers can't find a real reference number, they generate fallback IDs using `Date.now()`. Since timestamps change every millisecond, the same bill gets a different reference on every sync. The `UNIQUE(user_id, provider_id, reference_number)` constraint on the `bills` table never matches, so duplicates are inserted indefinitely.

**Affected lines in `supabase/functions/sync-bills/index.ts`:**

| Line | Provider | Current Code |
|------|----------|-------------|
| 376 | DEH Strategy A | `'DEH-' + Date.now() + '-' + results.length` |
| 396 | DEH Strategy B (__NEXT_DATA__) | `'DEH-' + Date.now()` |
| 449 | DEH Strategy C (text scan) | `'DEH-' + Date.now() + '-' + results.length` |
| 675 | EYDAP Strategy A | `'EYDAP-' + Date.now() + '-' + results.length` |
| 704 | EYDAP Strategy B | `'EYDAP-' + Date.now() + '-' + results.length` |
| 923 | COSMOTE Strategy A | `'COS-' + Date.now() + '-' + results.length` |
| 948 | COSMOTE Strategy B | `'COS-' + Date.now() + '-' + results.length` |
| 1186 | AADE Strategy A | `'AADE-' + Date.now() + '-' + results.length` |
| 1206 | AADE Strategy B | `'AADE-' + Date.now()` |
| 1237 | AADE Strategy C | `'AADE-' + Date.now() + '-' + results.length` |
| 1510 | EFKA Strategy A | `'EFKA-' + Date.now() + '-' + results.length` |
| 1539 | EFKA Strategy B | `'EFKA-' + Date.now() + '-' + results.length` |

**Fix approach:** Replace `Date.now()` with a deterministic hash derived from the bill's content. Since `page.evaluate()` runs inside the browser (no access to Node crypto), use a simple string hash:

```javascript
// Add to BROWSER_HELPERS (insert after parseDate, around line 189)
stableRef(provider, amount, dueDate, index) {
  // Deterministic reference: same bill always produces same key
  const input = provider + '|' + amount.toFixed(2) + '|' + (dueDate || 'unknown') + '|' + index;
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) - hash + input.charCodeAt(i)) | 0;
  }
  return provider + '-' + Math.abs(hash).toString(36);
}
```

Then replace all 12 occurrences: e.g., line 376 becomes:
```javascript
reference_number: refMatch ? refMatch[1] : helpers.stableRef('DEH', amount, dueDate, results.length),
```

**Wait — `helpers` is NOT available inside `page.evaluate()`.** The browser helpers are defined in `BROWSER_HELPERS` but `page.evaluate()` runs in the browser context. The `helpers` object is only available in the Browserless function scope, not inside `page.evaluate()`.

**Revised approach:** Define `stableRef` as a standalone function INSIDE the `page.evaluate()` callback, or pass it as a serializable string. The simplest fix: define the hash function inline in each `page.evaluate()` call, OR add it to the scraper code string before the `page.evaluate()` calls.

**Testing approach:**
1. Run sync-bills twice for the same provider account
2. After first run: check `bills` table — should have N rows
3. After second run: should still have exactly N rows (no duplicates)
4. Check `sync_jobs` — second run should show `bills_new: 0, bills_updated: N`

### Fix 1.2: DEH page.evaluate() Function Serialization Bug

**Problem:** At line 339, the DEH scraper passes `parseAmount` and `parseDate` as arguments to `page.evaluate()`:
```javascript
const bills = await page.evaluate((parseAmount, parseDate) => { ... }, parseAmount, parseDate);
```

But `parseAmount` and `parseDate` are defined inside the `BROWSER_HELPERS` string as properties of the `helpers` object. They are function references. Puppeteer's `page.evaluate()` serializes arguments via `JSON.stringify()`, which cannot serialize functions — they become `undefined`.

Inside the evaluate callback, lines that call `parseAmount(...)` or `parseDate(...)` will throw `TypeError: parseAmount is not a function`.

**However:** Looking more closely at the actual code at lines 339-408, the callback at line 339 receives `parseAmount` and `parseDate` as parameters but **never actually calls them**. The amount parsing at line 359 is done inline with `parseFloat(amountStr.replace(...))`, and the date parsing at line 364 uses a direct regex. The parameter names are misleading vestiges — the code works despite the serialization issue because it doesn't use the serialized values.

**Revised assessment:** This is a **code quality issue**, not a runtime bug. The parameters should be removed to avoid confusion, but the scraper will not crash.

**Fix:** Remove the unused parameters from line 339:
```javascript
// Before:
const bills = await page.evaluate((parseAmount, parseDate) => {
// After:
const bills = await page.evaluate(() => {
```
And remove the trailing arguments passed to `page.evaluate()` (if any exist after the closing `}`).

**Testing approach:**
1. Trigger a DEH sync
2. Verify `sync_jobs.status = 'completed'` (not 'failed')
3. Verify `bills` table has extracted DEH bills

### Phase 1 Rollback
- Git revert the commit
- No database migration needed (only code changes)
- Existing duplicate bills in DB should be cleaned up with:
  ```sql
  -- Find and remove duplicates, keeping the earliest
  DELETE FROM bills a USING bills b
  WHERE a.id > b.id
    AND a.user_id = b.user_id
    AND a.provider_id = b.provider_id
    AND a.amount = b.amount
    AND a.due_date = b.due_date;
  ```

### Go/No-Go → Phase 2
- [ ] All 12 `Date.now()` references replaced with deterministic hash
- [ ] `stableRef` helper tested: same inputs produce same output
- [ ] DEH scraper tested: sync completes successfully
- [ ] Double-sync test: no duplicate bills created
- [ ] `supabase functions deploy sync-bills` succeeds

---

## Phase 2: Security Hardening

**Why Critical:** `sync-bills` accepts unauthenticated requests. CORS allows any origin. These must be fixed before any real user credentials enter the system.

**Complexity:** 2/5
**Estimated scope:** ~40 lines changed across 3 files + 1 migration

### Fix 2.1: Add Auth Check to sync-bills

**File:** `supabase/functions/sync-bills/index.ts`
**Lines:** 1620-1638 (main handler, after `req.json()` parsing)

**Problem:** The handler creates a service-role Supabase client at line 1628 and proceeds to sync any `provider_account_id` without verifying the caller is authorized. Any HTTP client that discovers the URL can trigger syncs.

**Fix:** After line 1638, add an auth check:
```typescript
// Verify caller is service role or account owner
const authHeader = req.headers.get("Authorization") || "";
const token = authHeader.replace("Bearer ", "");
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

if (token !== supabaseServiceKey) {
  // Not service role — check if caller owns this account
  const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) {
    return new Response(
      JSON.stringify({ success: false, error: "Unauthorized" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 401 },
    );
  }
  // Verify user owns this provider_account
  const { data: ownerCheck } = await supabase
    .from("provider_accounts")
    .select("id")
    .eq("id", provider_account_id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!ownerCheck) {
    return new Response(
      JSON.stringify({ success: false, error: "Forbidden" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 403 },
    );
  }
}
```

**Dependency:** None
**Testing:**
1. Call sync-bills with NO auth header → expect 401
2. Call sync-bills with anon key for a different user's account → expect 403
3. Call sync-bills with service role key → expect success
4. Call add-provider-account (which internally calls sync-bills with service role) → expect success

### Fix 2.2: Restrict CORS

**Files:**
- `supabase/functions/sync-bills/index.ts` line 5
- `supabase/functions/add-provider-account/index.ts` line 5
- `supabase/functions/send-notifications/index.ts` line 5
- `supabase/functions/trigger-daily-sync/index.ts` line 9

**Problem:** All 4 functions have `"Access-Control-Allow-Origin": "*"`.

**Fix:** Use an environment variable for allowed origin:
```typescript
const ALLOWED_ORIGIN = Deno.env.get("CORS_ALLOWED_ORIGIN") || "*";
const corsHeaders = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  ...
};
```

**Dependency:** Decision D1 (frontend domain)
**Note:** `trigger-daily-sync` and `send-notifications` are only called by pg_cron (server-side), not from browsers. CORS doesn't apply to them. But consistent headers across all functions prevents confusion.

**Testing:**
1. Set `CORS_ALLOWED_ORIGIN=https://fab.gr`
2. Make request from browser on different origin → should be blocked by browser
3. Make request from curl (no origin) → should work (CORS is browser-enforced)

### Fix 2.3: Try-catch req.json() in add-provider-account

**File:** `supabase/functions/add-provider-account/index.ts`
**Line:** 94

**Problem:** `const { provider_id, username, password } = await req.json();` is not wrapped in try-catch. A malformed body crashes the function with an unhandled error.

**Fix:**
```typescript
let provider_id: string, username: string, password: string;
try {
  ({ provider_id, username, password } = await req.json());
} catch {
  return new Response(
    JSON.stringify({ success: false, error: "Invalid JSON body" }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 },
  );
}
```

**Also fix line 77:** Add null check for Authorization header:
```typescript
const authHeader = req.headers.get("Authorization");
if (!authHeader) {
  return new Response(
    JSON.stringify({ success: false, error: "Missing authorization header" }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 401 },
  );
}
```

**Dependency:** None
**Testing:**
1. POST with invalid JSON body → expect 400 with "Invalid JSON body"
2. POST with no Authorization header → expect 401
3. POST with valid body + valid auth → expect normal behavior

### Fix 2.4: Storage RLS Policy

**File:** `supabase/migrations/20240101000004_create_storage.sql`
**Lines:** 13-16

**Problem:** The "Service role full access" policy uses `USING (bucket_id = 'evidence')` with no role check. This allows any authenticated user to write to the bucket.

**Fix:** This requires a new migration file since the original has already been applied:

Create `supabase/migrations/20240201000001_fix_storage_rls.sql`:
```sql
-- Drop overly permissive policy
DROP POLICY IF EXISTS "Service role full access on evidence" ON storage.objects;

-- Recreate with service role check (service role bypasses RLS anyway,
-- but this makes intent explicit and prevents accidental access)
CREATE POLICY "Service role manages evidence"
  ON storage.objects FOR ALL
  USING (bucket_id = 'evidence' AND auth.role() = 'service_role')
  WITH CHECK (bucket_id = 'evidence' AND auth.role() = 'service_role');
```

**Dependency:** None
**Testing:**
1. Verify sync-bills can still upload screenshots (uses service role)
2. Verify a regular user JWT cannot upload to evidence bucket
3. Verify users can still read their own screenshots (separate policy at lines 18-23)

### Phase 2 Rollback
- Git revert the commit
- For Fix 2.4: `DROP POLICY` the new policy, re-create the original
- Rollback is safe — removes restrictions, doesn't break functionality

### Go/No-Go → Phase 3
- [ ] sync-bills returns 401 without auth
- [ ] sync-bills returns 403 for wrong user
- [ ] CORS header is configurable
- [ ] add-provider-account handles malformed JSON gracefully
- [ ] Storage RLS prevents unauthorized uploads
- [ ] All 4 functions deploy successfully

---

## Phase 3: Reliability Improvements

**Why High Priority:** Without retries, a single transient failure means 24-hour gap. Without timeouts, a hung scrape blocks all subsequent accounts. Without a circuit breaker, a down provider wastes all Browserless credits.

**Complexity:** 4/5
**Estimated scope:** ~150 lines changed across 2 files + 1 migration

### Fix 3.1: Retry Logic for Failed Syncs

**File:** `supabase/functions/sync-bills/index.ts`
**Context:** The `sync_jobs` table already has `retry_count`, `max_retries`, and `next_retry_at` columns (migration 1, lines 206-208). No code uses them.

**Implementation:**

Add a new database function (new migration) and modify the sync failure handler:

**New migration `supabase/migrations/20240201000002_add_retry_logic.sql`:**
```sql
-- Function called by pg_cron to retry failed sync jobs
CREATE OR REPLACE FUNCTION public.process_retry_queue()
RETURNS INTEGER AS $$
DECLARE
  job RECORD;
  retry_count INTEGER := 0;
BEGIN
  FOR job IN
    SELECT sj.id, sj.provider_account_id
    FROM sync_jobs sj
    WHERE sj.status = 'failed'
      AND sj.retry_count < sj.max_retries
      AND sj.next_retry_at <= NOW()
    ORDER BY sj.next_retry_at
    LIMIT 10
  LOOP
    -- Mark as pending retry
    UPDATE sync_jobs SET status = 'pending' WHERE id = job.id;
    retry_count := retry_count + 1;
  END LOOP;
  RETURN retry_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Schedule retry processing every 15 minutes
SELECT cron.schedule(
  'process-retry-queue',
  '*/15 * * * *',
  $$SELECT public.process_retry_queue()$$
);
```

**Modify sync-bills failure handler** (around line 1780-1810 in sync-bills/index.ts):
When a sync fails, calculate next retry time using exponential backoff from `app_settings.retry_backoff_minutes` (`[5, 30, 120]`):
```typescript
// In the catch block where sync_job is marked as failed:
const retryBackoff = [5, 30, 120]; // minutes
const currentRetry = syncJob?.retry_count || 0;
if (currentRetry < 3) {
  const backoffMinutes = retryBackoff[currentRetry] || 120;
  await supabase.from("sync_jobs").update({
    retry_count: currentRetry + 1,
    next_retry_at: new Date(Date.now() + backoffMinutes * 60000).toISOString(),
  }).eq("id", syncJob.id);
}
```

**Dependency:** Phase 1 (fix dedup first — retries with broken dedup would create MORE duplicates)
**Testing:**
1. Force a sync failure (use invalid credentials)
2. Check `sync_jobs` row: `retry_count=0, next_retry_at` should be set to +5 min
3. Wait 5+ min (or manually trigger `process_retry_queue()`)
4. Check that a new sync attempt was made
5. After 3 failures: verify no more retries scheduled

### Fix 3.2: Provider Circuit Breaker

**File:** `supabase/functions/sync-bills/index.ts` (failure handler)
**File:** `supabase/migrations/20240101000001_create_tables.sql` (providers table already has `scraper_status`)

**Implementation:**
After each sync failure, check recent failure rate for the provider. If >80% failures in last 10 syncs, mark provider as maintenance:

```typescript
// After recording sync failure:
const { count: recentFailures } = await supabase
  .from("sync_jobs")
  .select("id", { count: "exact", head: true })
  .eq("provider_id", account.provider_id)  // Note: need to add provider_id to sync_jobs query
  .eq("status", "failed")
  .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

const { count: recentTotal } = await supabase
  .from("sync_jobs")
  .select("id", { count: "exact", head: true })
  .eq("provider_id", account.provider_id)
  .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

if (recentTotal && recentTotal >= 5 && recentFailures && recentFailures / recentTotal > 0.8) {
  await supabase.from("providers").update({ scraper_status: "maintenance" }).eq("id", account.provider_id);
}
```

**Issue:** `sync_jobs` doesn't have a direct `provider_id` column — it joins through `provider_accounts`. Need to either:
- (a) Add `provider_id` column to `sync_jobs` (new migration), or
- (b) Use a JOIN query

Option (a) is cleaner. New migration:
```sql
ALTER TABLE public.sync_jobs ADD COLUMN IF NOT EXISTS provider_id TEXT REFERENCES public.providers(id);
-- Backfill from existing data
UPDATE sync_jobs sj SET provider_id = pa.provider_id FROM provider_accounts pa WHERE sj.provider_account_id = pa.id;
```

Also: `trigger-daily-sync` must check `providers.scraper_status != 'maintenance'` before syncing.

**Dependency:** Fix 3.1 (retry logic)
**Testing:**
1. Create 5+ consecutive failed syncs for one provider
2. Verify `providers.scraper_status` flips to 'maintenance'
3. Verify `trigger-daily-sync` skips that provider
4. Manually set `scraper_status = 'active'` to recover

### Fix 3.3: trigger-daily-sync Timeout + Idempotency

**File:** `supabase/functions/trigger-daily-sync/index.ts`
**Lines:** 34-60

**Problem 1:** The `fetch()` call to sync-bills at line 36 has no timeout. A hung sync blocks all subsequent accounts.

**Problem 2:** No idempotency — if the function is killed and re-triggered, it re-processes already-synced accounts.

**Fix:**
```typescript
// Add timeout to fetch (line 36-45):
const response = await fetch(
  `${supabaseUrl}/functions/v1/sync-bills`,
  {
    method: "POST",
    headers: { ... },
    body: JSON.stringify({ provider_account_id: account.id }),
    signal: AbortSignal.timeout(180000), // 3 minutes max per sync
  },
);

// Add idempotency check (modify query at line 21-27):
const { data: accounts, error } = await supabase
  .from("provider_accounts")
  .select("id, user_id, provider_id, providers!inner(scraper_status)")
  .eq("status", "connected")
  .neq("providers.scraper_status", "maintenance")  // circuit breaker
  .or(`next_sync_at.lte.${new Date().toISOString()},next_sync_at.is.null`);
```

**Dependency:** Fix 3.2 (circuit breaker — uses `scraper_status` filter)
**Testing:**
1. Deploy with 180s timeout
2. Verify a slow sync (>3min) is aborted, not hung
3. Run trigger-daily-sync twice in quick succession — second run should find 0 accounts (next_sync_at was updated)

### Phase 3 Rollback
- Git revert code changes
- Run `SELECT cron.unschedule('process-retry-queue');` to remove retry cron
- `ALTER TABLE sync_jobs DROP COLUMN IF EXISTS provider_id;`
- Set any `providers.scraper_status = 'active'` manually

### Go/No-Go → Phase 4
- [ ] Failed syncs create retry entries with correct backoff
- [ ] Retries execute automatically within 15 minutes
- [ ] After 3 retries, sync is abandoned
- [ ] 5+ consecutive failures trigger provider maintenance mode
- [ ] trigger-daily-sync skips maintenance providers
- [ ] trigger-daily-sync has per-sync timeout
- [ ] Double-trigger doesn't double-sync

---

## Phase 4: Operational Readiness

**Why Medium Priority:** System can function without these, but operators will be blind to failures. Should be in place before real users are onboarded.

**Complexity:** 2/5
**Estimated scope:** 1 new Edge Function (~80 lines) + 1 migration

### Fix 4.1: Health Check Endpoint

**New file:** `supabase/functions/health-check/index.ts`

**Purpose:** Single endpoint that returns system status. Called by monitoring tools or manually.

**Returns:**
```json
{
  "status": "healthy",
  "checks": {
    "database": true,
    "browserless": true,
    "resend": true,
    "recent_sync_success_rate": 0.85,
    "providers": {
      "AADE": "active",
      "EFKA": "active",
      "DEH": "maintenance",
      "EYDAP": "active",
      "COSMOTE": "active"
    },
    "last_sync": "2026-02-26T06:15:00Z",
    "pending_bills": 12,
    "cron_jobs": 6
  }
}
```

**Testing:** `curl` the endpoint after deploy, verify all checks pass.

### Fix 4.2: Admin Alert on High Failure Rate

**New migration:** Add a SQL function called by pg_cron that checks daily sync results and sends an alert via `pg_net` to a designated webhook/endpoint if failure rate > 50%.

Alternatively, add a check at the end of `trigger-daily-sync`: if `failCount > successCount`, log a WARNING and optionally call `send-notifications` with a special admin notification type.

**Dependency:** Fix 4.1 (health check gives something to alert on)

### Fix 4.3: Structured Logging

**All 4 Edge Functions**

**Current state:** All logging is `console.error()` with string messages. No request IDs, no correlation between trigger-daily-sync and its child sync-bills calls.

**Fix:** Add a simple request ID at the top of each handler:
```typescript
const requestId = crypto.randomUUID().slice(0, 8);
const log = (level: string, msg: string, data?: unknown) =>
  console[level === "error" ? "error" : "log"](
    JSON.stringify({ requestId, fn: "sync-bills", level, msg, ...data })
  );
```

Pass `requestId` from trigger-daily-sync to sync-bills via request body so logs can be correlated.

**Dependency:** None
**Testing:** Check Edge Function logs in Supabase dashboard — should be JSON-formatted

### Phase 4 Rollback
- Delete health-check function: `supabase functions delete health-check`
- Git revert logging changes
- No data impact

### Go/No-Go → Phase 5
- [ ] Health check endpoint returns meaningful status
- [ ] Logs are structured JSON with request IDs
- [ ] At least one alerting mechanism exists for high failure rates

---

## Phase 5: Validation & Deployment

### Pre-Deployment Checklist

| # | Check | How to Verify | Status |
|---|-------|--------------|--------|
| 1 | All 12 `Date.now()` references replaced | `grep -n "Date.now()" sync-bills/index.ts` — should only show debug/screenshot lines (125, 126, 195, 197, 1768, 1790, 1817) | |
| 2 | sync-bills rejects unauthenticated calls | `curl -X POST .../sync-bills -d '{}'` → 401 | |
| 3 | CORS restricted to frontend domain | Check response headers | |
| 4 | add-provider-account handles bad JSON | `curl -X POST .../add-provider-account -d 'garbage'` → 400 | |
| 5 | Storage RLS blocks unauthorized uploads | Attempt upload with user JWT → denied | |
| 6 | Retry logic works | Force failure, wait 15 min, check retry | |
| 7 | Circuit breaker triggers | Force 5+ failures, check provider status | |
| 8 | trigger-daily-sync has per-sync timeout | Check code for `AbortSignal.timeout` | |
| 9 | Double-sync produces no duplicates | Run sync twice, count bills | |
| 10 | Health check returns valid status | `curl .../health-check` | |
| 11 | Cron jobs have real URLs (not placeholders) | `SELECT command FROM cron.job;` | |
| 12 | All 5 secrets are set | `supabase secrets list` — 5+ secrets | |
| 13 | Resend domain is verified | Check Resend dashboard | |
| 14 | Edge Functions show Active in dashboard | Check Supabase Dashboard | |
| 15 | `config.toml` site_url matches real domain | Compare with actual frontend URL | |

### End-to-End Test Procedure

```
1. Create test user (Supabase Dashboard > Authentication)
2. Sign in to get JWT:
   POST /auth/v1/token?grant_type=password
3. Add DEH provider account:
   POST /functions/v1/add-provider-account (with JWT)
4. Wait for initial sync to complete (check sync_jobs table)
5. Verify bills appear in bills table
6. Run trigger-daily-sync manually:
   POST /functions/v1/trigger-daily-sync (with service role key)
7. Verify no duplicate bills created
8. Force a sync failure (use wrong credentials)
9. Verify retry is scheduled (check sync_jobs.next_retry_at)
10. Check health endpoint:
    POST /functions/v1/health-check (with service role key)
11. Verify cron jobs have correct URLs:
    SELECT jobname, command FROM cron.job;
```

### Deployment Order

```
1. supabase db push                    # New migrations (retry, storage fix)
2. supabase functions deploy sync-bills
3. supabase functions deploy add-provider-account
4. supabase functions deploy send-notifications
5. supabase functions deploy trigger-daily-sync
6. supabase functions deploy health-check          # Phase 4
7. supabase secrets set CORS_ALLOWED_ORIGIN=https://your-frontend.com
8. Run end-to-end test procedure
9. Monitor first automated daily sync (next 6 AM)
```

### Rollback Procedure

If critical issues found after deployment:

```
1. git log --oneline -10               # Find the last known-good commit
2. git checkout <good-commit> -- supabase/functions/
3. supabase functions deploy sync-bills
4. supabase functions deploy add-provider-account
5. supabase functions deploy send-notifications
6. supabase functions deploy trigger-daily-sync
```

For database rollbacks (if migrations caused issues):
```sql
-- Phase 3 rollback
SELECT cron.unschedule('process-retry-queue');
ALTER TABLE sync_jobs DROP COLUMN IF EXISTS provider_id;

-- Phase 2 rollback
DROP POLICY IF EXISTS "Service role manages evidence" ON storage.objects;
CREATE POLICY "Service role full access on evidence"
  ON storage.objects FOR ALL
  USING (bucket_id = 'evidence')
  WITH CHECK (bucket_id = 'evidence');
```

---

## Summary: Phase-by-Phase Overview

| Phase | Focus | Fixes | Complexity | Files Changed |
|-------|-------|-------|-----------|---------------|
| **0** | Decisions | 0 | 0/5 | 0 |
| **1** | Data Integrity | 2 (dedup, DEH evaluate) | 3/5 | 1 file |
| **2** | Security | 4 (auth, CORS, JSON, storage) | 2/5 | 4 files + 1 migration |
| **3** | Reliability | 3 (retry, circuit breaker, timeout) | 4/5 | 2 files + 2 migrations |
| **4** | Operations | 3 (health, alerts, logging) | 2/5 | 5 files + 1 function |
| **5** | Validation | End-to-end test | 1/5 | 0 |

**Total: 12 fixes across 5 phases.**
**Critical path: Phase 0 → Phase 1 → Phase 2 → Deploy for limited beta.**
**Phases 3-4 can follow incrementally.**
