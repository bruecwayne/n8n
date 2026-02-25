# FAB (Fintrack Assist Bills) - Deployment Guide

> **For:** Non-technical staff deploying the FAB backend
> **Last updated:** February 2026
> **Time required:** 45-60 minutes for first deployment

---

## Table of Contents

1. [What You Are Deploying](#1-what-you-are-deploying)
2. [What You Need Before Starting](#2-what-you-need-before-starting)
3. [Step 1 — Create Accounts](#step-1--create-accounts)
4. [Step 2 — Set Up Your Supabase Project](#step-2--set-up-your-supabase-project)
5. [Step 3 — Install the Supabase Tool on Your Computer](#step-3--install-the-supabase-tool-on-your-computer)
6. [Step 4 — Download the Project Code](#step-4--download-the-project-code)
7. [Step 5 — Connect to Your Supabase Project](#step-5--connect-to-your-supabase-project)
8. [Step 6 — Create the Database Tables](#step-6--create-the-database-tables)
9. [Step 7 — Set Up the Scheduled Jobs](#step-7--set-up-the-scheduled-jobs)
10. [Step 8 — Generate Your Encryption Key](#step-8--generate-your-encryption-key)
11. [Step 9 — Store Your Secret Keys](#step-9--store-your-secret-keys)
12. [Step 10 — Deploy the Application](#step-10--deploy-the-application)
13. [Step 11 — Verify Everything Works](#step-11--verify-everything-works)
14. [Step 12 — Test With a Real Provider](#step-12--test-with-a-real-provider)
15. [Troubleshooting](#troubleshooting)
16. [Daily Operations](#daily-operations)
17. [Security Rules](#security-rules)

---

## 1. What You Are Deploying

FAB is a backend system that automatically tracks bills from 5 Greek providers:

| Provider | What It Tracks |
|----------|---------------|
| **AADE** | Tax obligations (TaxisNet) |
| **EFKA** | Social security contributions |
| **DEH** | Electricity bills |
| **EYDAP** | Water bills |
| **COSMOTE** | Telecom bills |

The system runs automatically every day at 6:00 AM, checks each provider for new bills, and sends email reminders 3 days before and on the day a bill is due.

---

## 2. What You Need Before Starting

You need to create **3 accounts** on 3 different websites. Each account provides a key that the application needs to work.

| Account | Website | What It Does | Cost |
|---------|---------|-------------|------|
| **Supabase** | supabase.com | Hosts the database and runs the application | Free tier available |
| **Browserless** | browserless.io | Visits provider websites to read bills | Paid (starts ~$50/month) |
| **Resend** | resend.com | Sends email notifications | Free tier available (100 emails/day) |

You also need:
- A computer (Windows, Mac, or Linux)
- An internet connection
- About 45-60 minutes of uninterrupted time

---

## Step 1 — Create Accounts

### 1A. Create a Supabase Account

1. Open your browser and go to **https://supabase.com**
2. Click **"Start your project"** (or "Sign Up")
3. Sign up with your company email (you can use GitHub, Google, or email/password)
4. Verify your email if asked
5. You will arrive at the Supabase Dashboard

### 1B. Create a Browserless Account

1. Open a new tab and go to **https://www.browserless.io**
2. Click **"Sign Up"** or **"Get Started"**
3. Sign up with your company email
4. Choose a plan (you need at least the basic paid plan for production use)
5. After signing up, go to **Account Settings** or **API Keys**
6. You will see your **API Token** — it looks like a long string of letters and numbers
7. **Copy this token** and save it in a temporary note — you will need it later

> **Important:** Your Browserless API token is a secret. Do not share it with anyone or post it in chat messages.

### 1C. Create a Resend Account

1. Open a new tab and go to **https://resend.com**
2. Click **"Sign Up"**
3. Sign up with your company email
4. After signing up, you need to **verify your sending domain:**
   - Go to **Domains** in the left sidebar
   - Click **"Add Domain"**
   - Enter your company domain (e.g., `fab.gr` or `yourcompany.gr`)
   - Resend will show you DNS records to add — **give these to whoever manages your company's domain/DNS** (usually IT or your domain registrar)
   - Wait until the domain shows as **"Verified"** (can take minutes to hours)
5. Go to **API Keys** in the left sidebar
6. Click **"Create API Key"**
7. Give it a name like `FAB Production`
8. **Copy the API key** (starts with `re_`) and save it in your temporary note

> **Note about Resend domain:** Until the domain is verified, emails will not be sent. The rest of the deployment can continue without this, and notifications will start working once the domain is verified.

---

## Step 2 — Set Up Your Supabase Project

### 2A. Create a New Project

1. Go to your **Supabase Dashboard** (https://supabase.com/dashboard)
2. Click **"New project"**
3. Fill in:
   - **Name:** `FAB Production` (or any name you prefer)
   - **Database Password:** Click **"Generate a password"** — then **copy this password and save it in your note**. You will need it later.
   - **Region:** Choose **West EU (Ireland)** or the closest to Greece
   - **Plan:** Free tier works for testing; Pro plan recommended for production
4. Click **"Create new project"**
5. Wait 1-2 minutes while Supabase sets up your project

### 2B. Find Your Project Keys

Once the project is ready:

1. Click **"Settings"** (gear icon) in the left sidebar
2. Click **"API"** under Settings
3. You will see:
   - **Project URL** — looks like `https://abcdefghijk.supabase.co`
   - **anon (public) key** — a long string starting with `eyJ...`
   - **service_role (secret) key** — click "Reveal" to see it, also starts with `eyJ...`
4. **Copy all three values** and save them in your temporary note

Label them clearly:
```
SUPABASE_URL = https://abcdefghijk.supabase.co
SUPABASE_ANON_KEY = eyJ...
SUPABASE_SERVICE_ROLE_KEY = eyJ...
```

### 2C. Find Your Project Reference ID

The **Project Reference ID** is the random part of your project URL.

For example, if your URL is `https://abcdefghijk.supabase.co`, then your Project Reference ID is `abcdefghijk`.

**Write this down** — you need it in Step 7.

### 2D. Enable Required Extensions

1. In the Supabase Dashboard, click **"Database"** in the left sidebar
2. Click **"Extensions"**
3. Search for **`pg_cron`** and click the toggle to **enable** it
4. Search for **`pg_net`** and click the toggle to **enable** it
5. Both should show as **Enabled** (green toggle)

> These extensions allow the application to run scheduled tasks automatically (like checking for bills every morning).

---

## Step 3 — Install the Supabase Tool on Your Computer

The Supabase CLI (Command Line Interface) is a program you install on your computer that lets you deploy code to your Supabase project.

### On Windows:

1. Press **Windows key + X**, then click **"Terminal"** (or **"PowerShell"**)
2. A black/blue window will open — this is your **terminal**
3. Copy and paste this entire line into the terminal, then press **Enter**:
   ```
   npx supabase --version
   ```
4. If it asks you to install something, type **y** and press **Enter**
5. If you see a version number (like `1.x.x`), the tool is ready

> **If the above doesn't work**, you may need to install Node.js first:
> 1. Go to **https://nodejs.org**
> 2. Download the **LTS** version (the one that says "Recommended")
> 3. Run the installer — click **Next** on every screen until done
> 4. Close and reopen your terminal, then try step 3 again

### On Mac:

1. Press **Command + Space**, type **Terminal**, press **Enter**
2. Copy and paste this line, then press **Enter**:
   ```
   brew install supabase/tap/supabase
   ```
3. If `brew` is not found, first install it by pasting this and pressing Enter:
   ```
   /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
   ```
   Then try step 2 again.

4. Verify it works:
   ```
   supabase --version
   ```

---

## Step 4 — Download the Project Code

You need to download the application code from this project to your computer.

### 4A. Install Git (if not already installed)

**On Windows:**
1. Go to **https://git-scm.com/download/win**
2. Download and run the installer
3. Click **Next** on every screen — use all default settings
4. Close and reopen your terminal after installing

**On Mac:**
1. Open Terminal
2. Type `git --version` and press Enter
3. If prompted to install Xcode Command Line Tools, click **Install**

### 4B. Download the Code

1. Open your terminal
2. Choose where to save the project. For example, to save it on your Desktop:

   **Windows:**
   ```
   cd %USERPROFILE%\Desktop
   ```

   **Mac:**
   ```
   cd ~/Desktop
   ```

3. Download the project:
   ```
   git clone -b claude/fab-backend-build-yb4QR https://github.com/indigo-greco/n8n-workflows.git fab-backend
   ```

4. Go into the project folder:
   ```
   cd fab-backend
   ```

> You should now have a folder called `fab-backend` on your Desktop containing all the application code.

---

## Step 5 — Connect to Your Supabase Project

1. In your terminal (make sure you're inside the `fab-backend` folder), type:
   ```
   supabase login
   ```
2. It will open your browser — log in to Supabase and authorize the CLI
3. Go back to your terminal and link the project:
   ```
   supabase link --project-ref YOUR_PROJECT_REF
   ```
   Replace `YOUR_PROJECT_REF` with the Project Reference ID you saved in Step 2C.

   **Example:**
   ```
   supabase link --project-ref abcdefghijk
   ```
4. When asked for the database password, paste the password you saved in Step 2A
5. You should see a success message

---

## Step 6 — Create the Database Tables

This step creates all the database tables the application needs.

> **Important:** We will run the first 2 migrations and the storage migration now. The cron jobs migration (file 3) needs manual editing first, which we do in Step 7.

1. In your terminal, run:
   ```
   supabase db push
   ```
2. It will ask you to confirm — type **y** and press **Enter**
3. Wait for it to complete. You should see messages about migrations being applied.

> **If you get an error about pg_cron:** Go back to Step 2D and make sure both extensions are enabled in the Supabase Dashboard.

### Verify in the Dashboard:

1. Go to your **Supabase Dashboard**
2. Click **"Table Editor"** in the left sidebar
3. You should see these tables:
   - `profiles`
   - `providers` (should have 5 rows: AADE, EFKA, DEH, EYDAP, COSMOTE)
   - `provider_accounts`
   - `bills`
   - `sync_jobs`
   - `notifications`
   - `audit_log`
   - `app_settings`

> If you see all 8 tables, the database is set up correctly.

---

## Step 7 — Set Up the Scheduled Jobs

The cron jobs migration file contains placeholder values that must be replaced with your actual project details.

### 7A. Edit the Cron Jobs File

1. Navigate to the file on your computer:
   ```
   fab-backend/supabase/migrations/20240101000003_create_cron_jobs.sql
   ```
2. Open it with any text editor:
   - **Windows:** Right-click the file, choose "Open with" > "Notepad"
   - **Mac:** Right-click the file, choose "Open With" > "TextEdit"

3. Use **Find and Replace** (Ctrl+H on Windows, Cmd+H on Mac):

   **First replacement:**
   - Find: `YOUR_PROJECT_REF`
   - Replace with: your actual Project Reference ID (e.g., `abcdefghijk`)
   - Click **"Replace All"** — it should replace 3 occurrences

   **Second replacement:**
   - Find: `YOUR_SERVICE_ROLE_KEY`
   - Replace with: your actual Service Role Key (the one starting with `eyJ...` from Step 2B)
   - Click **"Replace All"** — it should replace 3 occurrences

4. **Save the file** (Ctrl+S or Cmd+S)

### 7B. Apply the Cron Jobs

If the migration already ran with placeholders during Step 6, you need to run the SQL manually:

1. Go to your **Supabase Dashboard**
2. Click **"SQL Editor"** in the left sidebar
3. Click **"New query"**
4. Open the file you just edited (`20240101000003_create_cron_jobs.sql`) in your text editor
5. **Select all the text** (Ctrl+A or Cmd+A), **copy it** (Ctrl+C or Cmd+C)
6. **Paste it** into the SQL Editor in your browser (Ctrl+V or Cmd+V)
7. Click the green **"Run"** button (or press Ctrl+Enter)
8. You should see "Success. No rows returned" — this is normal

### 7C. Verify Cron Jobs

1. In the SQL Editor, create a new query
2. Paste this and click Run:
   ```sql
   SELECT jobname, schedule, command FROM cron.job ORDER BY jobname;
   ```
3. You should see 5 rows:
   - `daily-sync-trigger` — runs at `0 6 * * *` (6:00 AM daily)
   - `mark-overdue-bills` — runs at `0 0 * * *` (midnight daily)
   - `notifications-d0` — runs at `30 8 * * *` (8:30 AM daily)
   - `notifications-d3` — runs at `30 9 * * *` (9:30 AM daily)
   - `weekly-cleanup` — runs at `0 3 * * 0` (3:00 AM every Sunday)

---

## Step 8 — Generate Your Encryption Key

The application encrypts user passwords before storing them. You need to generate a secure encryption key.

### Option A: Using Your Terminal (Preferred)

1. In your terminal, type:

   **Mac/Linux:**
   ```
   openssl rand -base64 32
   ```

   **Windows (PowerShell):**
   ```
   [Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Maximum 256 }) -as [byte[]])
   ```

2. You will see a random string like: `K7gNU3sdo+OL0wNhqoVWhr3g6s1xYv72ol/pe/Unols=`
3. **Copy this string** and save it in your temporary note as `ENCRYPTION_KEY`

### Option B: Using an Online Tool

1. Go to **https://generate.plus/en/base64** (or any Base64 generator)
2. Generate a random 32-byte Base64 string
3. Copy and save it

> **Warning:** This key protects all user credentials. If you lose it, all stored passwords become unreadable. **Store a backup of this key in a secure location** (e.g., a password manager or a safe).

---

## Step 9 — Store Your Secret Keys

Now you need to give the application all the keys it needs to work.

1. In your terminal (inside the `fab-backend` folder), run these commands **one at a time**.

   **Replace each placeholder with your actual values from your temporary note:**

   ```
   supabase secrets set BROWSERLESS_URL=https://production-sfo.browserless.io
   ```

   ```
   supabase secrets set BROWSERLESS_TOKEN=your_browserless_token_here
   ```

   ```
   supabase secrets set ENCRYPTION_KEY=your_encryption_key_from_step_8
   ```

   ```
   supabase secrets set RESEND_API_KEY=re_your_resend_api_key_here
   ```

2. Verify all secrets are saved:
   ```
   supabase secrets list
   ```
   You should see all 4 secrets listed (values are hidden, which is correct).

> **Note:** `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are automatically available to Edge Functions — you do NOT need to set them manually.

---

## Step 10 — Deploy the Application

This step uploads the application code to Supabase so it can run.

1. In your terminal, run:
   ```
   supabase functions deploy sync-bills
   ```
   Wait for it to finish, then:
   ```
   supabase functions deploy add-provider-account
   ```
   Then:
   ```
   supabase functions deploy send-notifications
   ```
   Then:
   ```
   supabase functions deploy trigger-daily-sync
   ```

2. Each command should show a success message.

3. Verify in the Dashboard:
   - Go to your **Supabase Dashboard**
   - Click **"Edge Functions"** in the left sidebar
   - You should see 4 functions listed, all with **"Active"** status

> **If a deploy fails:** Read the error message. Common issues:
> - "Not logged in" — run `supabase login` again
> - "Project not linked" — run `supabase link` again (Step 5)
> - Network error — check your internet connection and try again

---

## Step 11 — Verify Everything Works

### 11A. Check the Database

1. Go to **Supabase Dashboard > Table Editor**
2. Click on the **`providers`** table
3. Verify you see 5 rows: AADE, EFKA, DEH, EYDAP, COSMOTE

### 11B. Check the Edge Functions

1. Go to **Supabase Dashboard > Edge Functions**
2. Verify all 4 functions show as **Active**

### 11C. Test the Sync Function

1. Go to **Supabase Dashboard > SQL Editor**
2. Click **"New query"**
3. Paste this and click **Run**:
   ```sql
   SELECT id, name, name_el, is_active FROM providers ORDER BY name;
   ```
4. You should see:

   | id | name | name_el | is_active |
   |----|------|---------|-----------|
   | AADE | AADE | ΑΑΔΕ | true |
   | COSMOTE | COSMOTE | COSMOTE | true |
   | DEH | DEH | ΔΕΗ | true |
   | EFKA | EFKA | e-ΕΦΚΑ | true |
   | EYDAP | EYDAP | ΕΥΔΑΠ | true |

### 11D. Quick API Test

In your terminal, run this command (replace the placeholders):

```
curl -X POST https://YOUR_PROJECT_REF.supabase.co/functions/v1/trigger-daily-sync \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json"
```

**Windows PowerShell version:**
```
Invoke-RestMethod -Method Post -Uri "https://YOUR_PROJECT_REF.supabase.co/functions/v1/trigger-daily-sync" -Headers @{ "Authorization" = "Bearer YOUR_SERVICE_ROLE_KEY"; "Content-Type" = "application/json" }
```

You should see a response like:
```json
{"success":true,"accounts_processed":0,"success_count":0,"fail_count":0}
```

The `accounts_processed: 0` is correct — no users have connected any providers yet.

---

## Step 12 — Test With a Real Provider

To test that a connector actually works, you need to manually create a test through the API. This requires a registered user in the system.

### 12A. Create a Test User

1. Go to **Supabase Dashboard > Authentication**
2. Click **"Add user"** > **"Create new user"**
3. Enter a test email and password
4. Click **"Create user"**
5. Note the **User ID** (UUID) that appears

### 12B. Add a Provider Account (via SQL for testing)

1. Go to **SQL Editor**
2. You need to encrypt a test password first. Instead, use the API:

   ```
   curl -X POST https://YOUR_PROJECT_REF.supabase.co/functions/v1/add-provider-account \
     -H "Authorization: Bearer YOUR_ANON_KEY" \
     -H "Content-Type: application/json" \
     -d '{"provider_id": "DEH", "username": "your-dei-email@example.com", "password": "your-dei-password"}'
   ```

   > **Note:** This requires the user to be authenticated. For production, the frontend handles this. For testing, you can use the Service Role Key instead of the Anon Key.

### 12C. Check the Results

1. Go to **Table Editor > sync_jobs**
2. You should see a new row with:
   - `status`: "completed" or "failed"
   - `debug_log`: detailed step-by-step log of what happened
   - `error_message`: if failed, explains why

3. If the status is "failed", check the `debug_log` column — it contains step-by-step details and the `error_code` tells you what went wrong:

   | Error Code | Meaning | What To Do |
   |-----------|---------|-----------|
   | `LOGIN_FAILED` | Wrong username or password | Verify the credentials |
   | `2FA_REQUIRED` | Provider requires two-factor authentication | User needs to complete 2FA manually |
   | `SCRAPER_BROKEN` | The provider website changed its layout | Contact the development team |
   | `SCRAPER_ERROR` | Unexpected error during scraping | Check `debug_log` for details |

---

## Troubleshooting

### "supabase: command not found"
- Reinstall the Supabase CLI (Step 3)
- Close and reopen your terminal after installing

### "Project not linked"
- Run `supabase link --project-ref YOUR_PROJECT_REF` again

### "Error: relation already exists"
- This means the migration was already applied. This is safe to ignore.

### Edge Function shows "Error" status
1. Go to **Edge Functions** in the dashboard
2. Click on the function name
3. Check the **Logs** tab for error details
4. Most common cause: missing secrets (Step 9)

### Cron jobs not running
1. Check that `pg_cron` and `pg_net` extensions are enabled (Step 2D)
2. Verify cron jobs exist (Step 7C)
3. Check that the URLs in the cron jobs contain your real Project Reference ID (not `YOUR_PROJECT_REF`)

### Emails not sending
1. Verify your domain is verified in Resend (Step 1C)
2. Check the Resend dashboard for delivery logs
3. Make sure `RESEND_API_KEY` is set correctly (Step 9)

### "Browserless HTTP 401"
- Your Browserless API token is wrong or expired
- Go to browserless.io, get a new token, and update it:
  ```
  supabase secrets set BROWSERLESS_TOKEN=your_new_token
  ```

---

## Daily Operations

Once deployed, the system runs automatically. Here is what happens every day:

| Time | What Happens |
|------|-------------|
| **6:00 AM** | System checks all connected provider accounts for new bills |
| **8:30 AM** | System sends email reminders for bills due **today** |
| **9:30 AM** | System sends email reminders for bills due in **3 days** |
| **Midnight** | System marks overdue bills |
| **Sunday 3 AM** | System cleans up old data (logs older than 30-90 days) |

### Monitoring

To check if things are working:

1. **Supabase Dashboard > Table Editor > sync_jobs** — Shows all sync attempts with success/failure status
2. **Supabase Dashboard > Table Editor > bills** — Shows all discovered bills
3. **Supabase Dashboard > Edge Functions > [function name] > Logs** — Shows real-time logs
4. **Resend Dashboard** — Shows email delivery status

---

## Security Rules

**NEVER share these values publicly:**
- Supabase Service Role Key
- Browserless API Token
- Encryption Key
- Resend API Key
- Database password

**If any key is compromised:**
1. Immediately rotate (regenerate) the key on the provider's website
2. Update it in Supabase:
   ```
   supabase secrets set KEY_NAME=new_value
   ```
3. Redeploy the affected functions:
   ```
   supabase functions deploy function-name
   ```

**Delete the temporary note** with all your keys after deployment is complete. All keys are safely stored in Supabase secrets.

---

## Updating the Application

When the development team pushes a new version:

1. Open your terminal
2. Navigate to your project folder:
   ```
   cd Desktop/fab-backend
   ```
3. Download the latest code:
   ```
   git pull origin claude/fab-backend-build-yb4QR
   ```
4. If there are database changes, apply them:
   ```
   supabase db push
   ```
5. Redeploy all functions:
   ```
   supabase functions deploy sync-bills
   supabase functions deploy add-provider-account
   supabase functions deploy send-notifications
   supabase functions deploy trigger-daily-sync
   ```

---

## Quick Reference Card

| What | Value |
|------|-------|
| **Supabase Dashboard** | https://supabase.com/dashboard |
| **Browserless Dashboard** | https://www.browserless.io/dashboard |
| **Resend Dashboard** | https://resend.com |
| **Project Branch** | `claude/fab-backend-build-yb4QR` |
| **Edge Functions** | sync-bills, add-provider-account, send-notifications, trigger-daily-sync |
| **Database Tables** | profiles, providers, provider_accounts, bills, sync_jobs, notifications, audit_log, app_settings |
| **Cron Schedule** | Sync 6AM, Notifications 8:30/9:30AM, Overdue midnight, Cleanup Sunday 3AM |

---

*This guide was created for FAB v1.0. If you encounter issues not covered here, contact the development team.*
