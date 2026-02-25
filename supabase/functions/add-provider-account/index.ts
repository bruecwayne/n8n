import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// ---------------------------------------------------------------------------
// Encryption
// ---------------------------------------------------------------------------

async function encryptPassword(
  password: string,
): Promise<{ encrypted: string; iv: string }> {
  const keyBase64 = Deno.env.get("ENCRYPTION_KEY")!;
  const keyBuffer = Uint8Array.from(atob(keyBase64), (c) => c.charCodeAt(0));

  const key = await crypto.subtle.importKey(
    "raw",
    keyBuffer,
    { name: "AES-GCM" },
    false,
    ["encrypt"],
  );

  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(password);

  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoded,
  );

  return {
    encrypted: btoa(String.fromCharCode(...new Uint8Array(encrypted))),
    iv: btoa(String.fromCharCode(...iv)),
  };
}

// ---------------------------------------------------------------------------
// Username masking
// ---------------------------------------------------------------------------

function maskUsername(username: string, providerId: string): string {
  switch (providerId) {
    case "AADE":
    case "EFKA":
      return username.slice(0, 3) + "****" + username.slice(-2);
    case "DEH":
    case "EYDAP":
      return "****" + username.slice(-4);
    case "COSMOTE":
      if (/^\d+$/.test(username)) {
        return username.slice(0, 3) + "****" + username.slice(-2);
      } else {
        const [local, domain] = username.split("@");
        return local.slice(0, 2) + "***@" + (domain || "");
      }
    default:
      return "****" + username.slice(-4);
  }
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization")!;
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Use caller's auth context for RLS
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      throw new Error("Unauthorized");
    }

    const { provider_id, username, password } = await req.json();

    // Validate provider exists and is active
    const { data: provider, error: providerError } = await supabase
      .from("providers")
      .select("*")
      .eq("id", provider_id)
      .eq("is_active", true)
      .single();

    if (providerError || !provider) {
      throw new Error("Invalid or inactive provider");
    }

    // Check if user already connected this provider
    const { data: existing } = await supabase
      .from("provider_accounts")
      .select("id")
      .eq("user_id", user.id)
      .eq("provider_id", provider_id)
      .maybeSingle();

    if (existing) {
      throw new Error("Provider already connected. Please disconnect first.");
    }

    // Encrypt the password before storage
    const { encrypted, iv } = await encryptPassword(password);

    // Create provider account record
    const { data: account, error: insertError } = await supabase
      .from("provider_accounts")
      .insert({
        user_id: user.id,
        provider_id,
        username,
        encrypted_password: encrypted,
        encryption_iv: iv,
        username_masked: maskUsername(username, provider_id),
        status: "pending",
      })
      .select()
      .single();

    if (insertError) {
      throw insertError;
    }

    // Write audit log (uses service role to bypass RLS)
    const supabaseService = createClient(
      supabaseUrl,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    await supabaseService.from("audit_log").insert({
      user_id: user.id,
      action: "provider_account_created",
      resource_type: "provider_account",
      resource_id: account.id,
      new_values: { provider_id, username_masked: account.username_masked },
    });

    // Trigger initial sync
    const syncResponse = await fetch(
      `${supabaseUrl}/functions/v1/sync-bills`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ provider_account_id: account.id }),
      },
    );

    let syncResult: { success: boolean; error?: string } = {
      success: false,
      error: "Sync did not complete",
    };
    try {
      if (syncResponse.ok) {
        syncResult = await syncResponse.json();
      }
    } catch {
      // sync-bills may have timed out or returned non-JSON (e.g. 502 HTML)
    }

    return new Response(
      JSON.stringify({
        success: true,
        account: {
          id: account.id,
          provider_id: account.provider_id,
          username_masked: account.username_masked,
          status: syncResult.success ? "connected" : "error",
        },
        sync_result: syncResult,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      },
    );
  } catch (error) {
    console.error("Add provider error:", error);
    return new Response(
      JSON.stringify({ success: false, error: (error as Error).message }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: (error as Error).message === "Unauthorized" ? 401 : 400,
      },
    );
  }
});
