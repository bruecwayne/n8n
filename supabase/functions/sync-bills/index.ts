import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// ---------------------------------------------------------------------------
// Encryption utilities
// ---------------------------------------------------------------------------

async function getEncryptionKey(): Promise<CryptoKey> {
  const keyBase64 = Deno.env.get("ENCRYPTION_KEY")!;
  const keyBuffer = Uint8Array.from(atob(keyBase64), (c) => c.charCodeAt(0));

  return crypto.subtle.importKey(
    "raw",
    keyBuffer,
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"],
  );
}

async function decryptPassword(
  encrypted: string,
  iv: string,
  key: CryptoKey,
): Promise<string> {
  const encryptedBuffer = Uint8Array.from(atob(encrypted), (c) =>
    c.charCodeAt(0),
  );
  const ivBuffer = Uint8Array.from(atob(iv), (c) => c.charCodeAt(0));

  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: ivBuffer },
    key,
    encryptedBuffer,
  );

  return new TextDecoder().decode(decrypted);
}

// ---------------------------------------------------------------------------
// Scraper result interface
// ---------------------------------------------------------------------------

interface ScraperResult {
  success: boolean;
  bills: Array<{
    title: string;
    amount: number;
    due_date: string;
    reference_number?: string;
    bill_type?: string;
    period_start?: string;
    period_end?: string;
  }>;
  error?: string;
  debug?: unknown[];
  screenshot?: string;
}

// ---------------------------------------------------------------------------
// Provider scrapers (Browserless.io / Puppeteer)
// ---------------------------------------------------------------------------

async function scrapeDEH(
  username: string,
  password: string,
): Promise<ScraperResult> {
  const browserlessUrl = Deno.env.get("BROWSERLESS_URL")!;
  const browserlessToken = Deno.env.get("BROWSERLESS_TOKEN")!;

  // Escape special characters for safe embedding in the JS string
  const safeUser = username.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  const safePwd = password.replace(/\\/g, "\\\\").replace(/'/g, "\\'");

  const code = `
    module.exports = async ({ page }) => {
      const debug = [];
      const bills = [];

      try {
        debug.push({ step: 'navigate', url: 'https://mydei.dei.gr/el/login/' });
        await page.goto('https://mydei.dei.gr/el/login/', { waitUntil: 'networkidle0', timeout: 30000 });

        debug.push({ step: 'enter_credentials' });
        await page.type('input[name="email"], input[type="email"]', '${safeUser}');
        await page.type('input[name="password"], input[type="password"]', '${safePwd}');

        debug.push({ step: 'submit_login' });
        await Promise.all([
          page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 30000 }),
          page.click('button[type="submit"], input[type="submit"]')
        ]);

        const errorElement = await page.$('.error, .alert-danger, .login-error');
        if (errorElement) {
          const errorText = await page.evaluate(el => el.textContent, errorElement);
          throw new Error('Login failed: ' + errorText);
        }

        debug.push({ step: 'navigate_bills' });
        await page.goto('https://mydei.dei.gr/el/my-bills/', { waitUntil: 'networkidle0', timeout: 30000 });

        debug.push({ step: 'extract_bills' });
        const billElements = await page.$$('.bill-item, .invoice-row, tr.bill');

        for (const billEl of billElements) {
          const bill = await page.evaluate(el => {
            const getText = (sel) => el.querySelector(sel)?.textContent?.trim() || '';
            const amount = parseFloat(
              getText('.amount, .bill-amount, td:nth-child(3)')
                .replace(/[^0-9.,]/g, '')
                .replace(',', '.')
            ) || 0;
            const dueDateStr = getText('.due-date, .bill-due, td:nth-child(4)');

            return {
              title: '\\u039B\\u03BF\\u03B3\\u03B1\\u03C1\\u03B9\\u03B1\\u03C3\\u03BC\\u03CC\\u03C2 \\u03A1\\u03B5\\u03CD\\u03BC\\u03B1\\u03C4\\u03BF\\u03C2',
              amount,
              due_date: dueDateStr,
              reference_number: getText('.reference, .bill-id, td:nth-child(1)'),
              bill_type: 'electricity'
            };
          }, billEl);

          if (bill.amount > 0) {
            bills.push(bill);
          }
        }

        const screenshot = await page.screenshot({ encoding: 'base64', fullPage: false });
        return { success: true, bills, debug, screenshot };

      } catch (error) {
        debug.push({ step: 'error', message: error.message });
        const screenshot = await page.screenshot({ encoding: 'base64' }).catch(() => null);
        return { success: false, bills: [], error: error.message, debug, screenshot };
      }
    };
  `;

  const response = await fetch(
    `${browserlessUrl}/function?token=${browserlessToken}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, context: {} }),
    },
  );

  if (!response.ok) {
    throw new Error(`Browserless error: ${response.status}`);
  }

  return response.json();
}

async function scrapeEYDAP(
  username: string,
  password: string,
): Promise<ScraperResult> {
  const browserlessUrl = Deno.env.get("BROWSERLESS_URL")!;
  const browserlessToken = Deno.env.get("BROWSERLESS_TOKEN")!;

  const safeUser = username.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  const safePwd = password.replace(/\\/g, "\\\\").replace(/'/g, "\\'");

  const code = `
    module.exports = async ({ page }) => {
      const debug = [];

      try {
        debug.push({ step: 'navigate', url: 'https://www.eydap.gr/myaccount/' });
        await page.goto('https://www.eydap.gr/myaccount/', { waitUntil: 'networkidle0', timeout: 30000 });

        debug.push({ step: 'enter_credentials' });
        await page.type('input[name="customerCode"], #customerCode', '${safeUser}');
        await page.type('input[name="password"], #password', '${safePwd}');

        debug.push({ step: 'submit_login' });
        await Promise.all([
          page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 30000 }),
          page.click('button[type="submit"], .login-btn')
        ]);

        debug.push({ step: 'extract_bills' });
        const billData = await page.evaluate(() => {
          const bills = [];
          const rows = document.querySelectorAll('.bill-row, .invoice-item, table tr');

          rows.forEach(row => {
            const amount = parseFloat(
              row.querySelector('.amount, td:nth-child(2)')?.textContent
                ?.replace(/[^0-9.,]/g, '')
                .replace(',', '.') ?? '0'
            ) || 0;
            const dueDate = row.querySelector('.due-date, td:nth-child(3)')?.textContent?.trim();

            if (amount > 0 && dueDate) {
              bills.push({
                title: '\\u039B\\u03BF\\u03B3\\u03B1\\u03C1\\u03B9\\u03B1\\u03C3\\u03BC\\u03CC\\u03C2 \\u038E\\u03B4\\u03C1\\u03B5\\u03C5\\u03C3\\u03B7\\u03C2',
                amount,
                due_date: dueDate,
                reference_number: row.querySelector('.ref, td:nth-child(1)')?.textContent?.trim(),
                bill_type: 'water'
              });
            }
          });

          return bills;
        });

        const screenshot = await page.screenshot({ encoding: 'base64', fullPage: false });
        return { success: true, bills: billData, debug, screenshot };

      } catch (error) {
        debug.push({ step: 'error', message: error.message });
        const screenshot = await page.screenshot({ encoding: 'base64' }).catch(() => null);
        return { success: false, bills: [], error: error.message, debug, screenshot };
      }
    };
  `;

  const response = await fetch(
    `${browserlessUrl}/function?token=${browserlessToken}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, context: {} }),
    },
  );

  return response.json();
}

async function scrapeCOSMOTE(
  username: string,
  password: string,
): Promise<ScraperResult> {
  const browserlessUrl = Deno.env.get("BROWSERLESS_URL")!;
  const browserlessToken = Deno.env.get("BROWSERLESS_TOKEN")!;

  const safeUser = username.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  const safePwd = password.replace(/\\/g, "\\\\").replace(/'/g, "\\'");

  const code = `
    module.exports = async ({ page }) => {
      const debug = [];

      try {
        debug.push({ step: 'navigate', url: 'https://account.cosmote.gr/' });
        await page.goto('https://account.cosmote.gr/', { waitUntil: 'networkidle0', timeout: 30000 });

        debug.push({ step: 'enter_username' });
        await page.type('input[name="username"], #username', '${safeUser}');

        const nextButton = await page.$('button.next, button[type="submit"]');
        if (nextButton) {
          await nextButton.click();
          await page.waitForTimeout(2000);
        }

        debug.push({ step: 'enter_password' });
        await page.type('input[name="password"], #password', '${safePwd}');

        debug.push({ step: 'submit_login' });
        await Promise.all([
          page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 30000 }),
          page.click('button[type="submit"], .login-submit')
        ]);

        debug.push({ step: 'navigate_bills' });
        await page.goto('https://my.cosmote.gr/selfcare/jsp/billing.jsp', { waitUntil: 'networkidle0', timeout: 30000 });

        debug.push({ step: 'extract_bills' });
        const billData = await page.evaluate(() => {
          const bills = [];
          const billElements = document.querySelectorAll('.bill-entry, .invoice-row');

          billElements.forEach(el => {
            const amount = parseFloat(
              el.querySelector('.amount')?.textContent
                ?.replace(/[^0-9.,]/g, '')
                .replace(',', '.') ?? '0'
            ) || 0;
            const dueDate = el.querySelector('.due-date')?.textContent?.trim();
            const billType = el.querySelector('.bill-type')?.textContent?.includes('Internet')
              ? 'internet'
              : 'mobile';

            if (amount > 0) {
              bills.push({
                title: billType === 'internet'
                  ? '\\u039B\\u03BF\\u03B3\\u03B1\\u03C1\\u03B9\\u03B1\\u03C3\\u03BC\\u03CC\\u03C2 Internet'
                  : '\\u039B\\u03BF\\u03B3\\u03B1\\u03C1\\u03B9\\u03B1\\u03C3\\u03BC\\u03CC\\u03C2 \\u039A\\u03B9\\u03BD\\u03B7\\u03C4\\u03AE\\u03C2',
                amount,
                due_date: dueDate,
                reference_number: el.querySelector('.ref-num')?.textContent?.trim(),
                bill_type: billType
              });
            }
          });

          return bills;
        });

        const screenshot = await page.screenshot({ encoding: 'base64', fullPage: false });
        return { success: true, bills: billData, debug, screenshot };

      } catch (error) {
        debug.push({ step: 'error', message: error.message });
        const screenshot = await page.screenshot({ encoding: 'base64' }).catch(() => null);
        return { success: false, bills: [], error: error.message, debug, screenshot };
      }
    };
  `;

  const response = await fetch(
    `${browserlessUrl}/function?token=${browserlessToken}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, context: {} }),
    },
  );

  return response.json();
}

// AADE and EFKA use TaxisNet SSO which requires complex 2FA handling.
// For MVP these return a graceful error suggesting manual entry.

async function scrapeAADE(
  _username: string,
  _password: string,
): Promise<ScraperResult> {
  return {
    success: false,
    bills: [],
    error: "AADE/TaxisNet scraping requires 2FA. Please use manual entry.",
    debug: [{ step: "info", message: "TaxisNet integration pending" }],
  };
}

async function scrapeEFKA(
  _username: string,
  _password: string,
): Promise<ScraperResult> {
  return {
    success: false,
    bills: [],
    error: "EFKA/TaxisNet scraping requires 2FA. Please use manual entry.",
    debug: [{ step: "info", message: "TaxisNet integration pending" }],
  };
}

// ---------------------------------------------------------------------------
// Greek date parser
// ---------------------------------------------------------------------------

function parseGreekDate(dateStr: string): string {
  if (!dateStr) return new Date().toISOString().split("T")[0];

  const patterns = [
    /(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})/,
    /(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})/,
  ];

  for (const pattern of patterns) {
    const match = dateStr.match(pattern);
    if (match) {
      if (match[3].length === 4) {
        // DD/MM/YYYY
        return `${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
      } else {
        // YYYY/MM/DD
        return `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
      }
    }
  }

  const parsed = new Date(dateStr);
  return isNaN(parsed.getTime())
    ? new Date().toISOString().split("T")[0]
    : parsed.toISOString().split("T")[0];
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { provider_account_id } = await req.json();

    // Get provider account details
    const { data: account, error: accountError } = await supabase
      .from("provider_accounts")
      .select("*, providers(*)")
      .eq("id", provider_account_id)
      .single();

    if (accountError || !account) {
      throw new Error("Provider account not found");
    }

    // Update status to syncing
    await supabase
      .from("provider_accounts")
      .update({ status: "syncing", updated_at: new Date().toISOString() })
      .eq("id", provider_account_id);

    // Create sync job
    const { data: syncJob } = await supabase
      .from("sync_jobs")
      .insert({
        provider_account_id,
        user_id: account.user_id,
        status: "running",
        started_at: new Date().toISOString(),
      })
      .select()
      .single();

    // Decrypt password
    const encryptionKey = await getEncryptionKey();
    const password = await decryptPassword(
      account.encrypted_password,
      account.encryption_iv,
      encryptionKey,
    );

    // Run appropriate scraper
    let result: ScraperResult;
    switch (account.provider_id) {
      case "DEH":
        result = await scrapeDEH(account.username, password);
        break;
      case "EYDAP":
        result = await scrapeEYDAP(account.username, password);
        break;
      case "COSMOTE":
        result = await scrapeCOSMOTE(account.username, password);
        break;
      case "AADE":
        result = await scrapeAADE(account.username, password);
        break;
      case "EFKA":
        result = await scrapeEFKA(account.username, password);
        break;
      default:
        result = { success: false, bills: [], error: "Unknown provider" };
    }

    // Process results
    let billsNew = 0;
    let billsUpdated = 0;

    if (result.success && result.bills.length > 0) {
      for (const bill of result.bills) {
        const parsedDueDate = parseGreekDate(bill.due_date);

        const { data: existingBill } = await supabase
          .from("bills")
          .select("id")
          .eq("user_id", account.user_id)
          .eq("provider_id", account.provider_id)
          .eq("reference_number", bill.reference_number)
          .single();

        if (existingBill) {
          await supabase
            .from("bills")
            .update({
              amount: bill.amount,
              due_date: parsedDueDate,
              scraped_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq("id", existingBill.id);
          billsUpdated++;
        } else {
          await supabase.from("bills").insert({
            user_id: account.user_id,
            provider_account_id,
            provider_id: account.provider_id,
            title: bill.title,
            amount: bill.amount,
            due_date: parsedDueDate,
            reference_number: bill.reference_number,
            bill_type: bill.bill_type,
            period_start: bill.period_start
              ? parseGreekDate(bill.period_start)
              : null,
            period_end: bill.period_end
              ? parseGreekDate(bill.period_end)
              : null,
            source: "scraped",
            scraped_at: new Date().toISOString(),
          });
          billsNew++;
        }
      }
    }

    // Update sync job
    await supabase
      .from("sync_jobs")
      .update({
        status: result.success ? "completed" : "failed",
        completed_at: new Date().toISOString(),
        duration_ms: syncJob
          ? Date.now() - new Date(syncJob.created_at).getTime()
          : 0,
        bills_found: result.bills.length,
        bills_new: billsNew,
        bills_updated: billsUpdated,
        error_message: result.error,
        debug_log: result.debug,
      })
      .eq("id", syncJob!.id);

    // Update provider account status
    await supabase
      .from("provider_accounts")
      .update({
        status: result.success ? "connected" : "error",
        status_message: result.error,
        last_sync_at: new Date().toISOString(),
        last_sync_success: result.success,
        last_sync_bills_found: result.bills.length,
        next_sync_at: new Date(
          Date.now() + 24 * 60 * 60 * 1000,
        ).toISOString(),
        sync_count: account.sync_count + 1,
        error_count: result.success ? 0 : account.error_count + 1,
        updated_at: new Date().toISOString(),
      })
      .eq("id", provider_account_id);

    return new Response(
      JSON.stringify({
        success: result.success,
        bills_found: result.bills.length,
        bills_new: billsNew,
        bills_updated: billsUpdated,
        error: result.error,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      },
    );
  } catch (error) {
    console.error("Sync error:", error);
    return new Response(
      JSON.stringify({ success: false, error: (error as Error).message }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      },
    );
  }
});
