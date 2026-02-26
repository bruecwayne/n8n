# FAB Backend — Project Structure

```
supabase/
├── functions/                          # Supabase Edge Functions (Deno/TypeScript)
│   ├── import_map.json                 # Shared Deno import map for all functions
│   │
│   ├── sync-bills/
│   │   └── index.ts                    # [~1800 lines] Core scraping engine
│   │                                   #   - 5 provider-specific scrapers (AADE, EFKA, DEH, EYDAP, COSMOTE)
│   │                                   #   - Browserless v2 integration with stealth mode
│   │                                   #   - AES-256-GCM credential decryption
│   │                                   #   - Shared browser helpers (waitAny, safeType, parseAmount, etc.)
│   │                                   #   - Bill deduplication and upsert logic
│   │                                   #   - Debug logging with screenshots
│   │
│   ├── add-provider-account/
│   │   └── index.ts                    # [~170 lines] Account linking endpoint
│   │                                   #   - Requires authenticated user JWT
│   │                                   #   - Encrypts password (AES-256-GCM)
│   │                                   #   - Masks username for display
│   │                                   #   - Triggers initial sync-bills call
│   │
│   ├── send-notifications/
│   │   └── index.ts                    # [~235 lines] Email notification sender
│   │                                   #   - Queries bills due on target date
│   │                                   #   - Builds Greek HTML email templates
│   │                                   #   - Sends via Resend API
│   │                                   #   - Configurable sender via RESEND_FROM_EMAIL
│   │
│   └── trigger-daily-sync/
│       └── index.ts                    # [~85 lines] Cron orchestrator
│                                       #   - Loops all connected accounts
│                                       #   - Calls sync-bills for each
│                                       #   - 500ms delay between calls (rate limiting)
│
├── migrations/                         # Postgres migrations (run in order by supabase db push)
│   ├── 20240101000001_create_tables.sql
│   │                                   # 8 tables: profiles, providers, provider_accounts,
│   │                                   # bills, sync_jobs, notifications, audit_log, app_settings
│   │                                   # Includes RLS policies, indexes, seed data (5 providers)
│   │
│   ├── 20240101000002_create_functions.sql
│   │                                   # DB functions: handle_new_user(), mark_overdue_bills(),
│   │                                   # cleanup_old_data(), update_bill_status(), mask_username()
│   │
│   ├── 20240101000003_create_cron_jobs.sql
│   │                                   # 5 pg_cron scheduled jobs
│   │                                   # ⚠️  Contains YOUR_PROJECT_REF and YOUR_SERVICE_ROLE_KEY
│   │                                   #    placeholders that MUST be replaced before db push
│   │
│   └── 20240101000004_create_storage.sql
│                                       # Creates 'evidence' storage bucket (private, 5MB, PNG/JPEG)
│                                       # Used for scraper debug screenshots
│
├── config.toml                         # Supabase project configuration
├── .env.example                        # Template for all required environment variables
├── DEPLOYMENT_GUIDE.md                 # [757 lines] Step-by-step guide for non-technical staff
├── ARCHITECTURE.md                     # System architecture and data flow documentation
└── PROJECT_STRUCTURE.md                # This file
```

## How Files Connect

```
                        pg_cron (migration 3)
                             │
                    ┌────────┴────────┐
                    ▼                 ▼
           trigger-daily-sync    send-notifications
                    │
                    ▼
               sync-bills ◄──── add-provider-account
                    │                    │
                    │                    │
            ┌───────┴───────┐     ┌─────┴──────┐
            ▼               ▼     ▼            ▼
      Browserless.io    DB tables (migration 1)
                        DB functions (migration 2)
                        Storage bucket (migration 4)
```

## Key Entry Points

If you're trying to understand the system, read files in this order:

1. **`migrations/20240101000001_create_tables.sql`** — Understand the data model first
2. **`functions/sync-bills/index.ts`** — The core scraping engine (most complex file)
3. **`functions/add-provider-account/index.ts`** — How users connect accounts
4. **`functions/trigger-daily-sync/index.ts`** — How the daily cron works
5. **`functions/send-notifications/index.ts`** — How email alerts are sent
6. **`DEPLOYMENT_GUIDE.md`** — How to deploy the whole system
