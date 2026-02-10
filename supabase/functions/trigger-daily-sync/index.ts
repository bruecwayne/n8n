import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers":
          "authorization, x-client-info, apikey, content-type",
      },
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get all connected provider accounts that are due for sync
    const { data: accounts, error } = await supabase
      .from("provider_accounts")
      .select("id, user_id, provider_id")
      .eq("status", "connected")
      .or(
        `next_sync_at.lte.${new Date().toISOString()},next_sync_at.is.null`,
      );

    if (error) throw error;

    let successCount = 0;
    let failCount = 0;

    for (const account of accounts || []) {
      try {
        const response = await fetch(
          `${supabaseUrl}/functions/v1/sync-bills`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${supabaseServiceKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ provider_account_id: account.id }),
          },
        );

        if (response.ok) {
          successCount++;
        } else {
          failCount++;
        }

        // Small delay to avoid rate limiting on Browserless
        await new Promise((r) => setTimeout(r, 500));
      } catch (e) {
        console.error(`Sync failed for account ${account.id}:`, e);
        failCount++;
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        accounts_processed: accounts?.length || 0,
        success_count: successCount,
        fail_count: failCount,
        timestamp: new Date().toISOString(),
      }),
      {
        headers: { "Content-Type": "application/json" },
        status: 200,
      },
    );
  } catch (error) {
    console.error("Daily sync trigger error:", error);
    return new Response(
      JSON.stringify({ success: false, error: (error as Error).message }),
      {
        headers: { "Content-Type": "application/json" },
        status: 500,
      },
    );
  }
});
