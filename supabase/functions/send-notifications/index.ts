import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// ---------------------------------------------------------------------------
// Email via Resend
// ---------------------------------------------------------------------------

async function sendEmail(
  to: string,
  subject: string,
  html: string,
): Promise<boolean> {
  const resendApiKey = Deno.env.get("RESEND_API_KEY")!;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "FAB <notifications@fab.gr>",
      to: [to],
      subject,
      html,
    }),
  });

  return response.ok;
}

// ---------------------------------------------------------------------------
// Email template builder
// ---------------------------------------------------------------------------

function buildEmailHtml(
  type: string,
  profile: { full_name?: string },
  provider: { name_el: string; icon: string },
  bill: { title: string; amount: number; due_date: string; reference_number?: string },
): string {
  const dueDateColor = type === "d0" ? "#ef4444" : "#f59e0b";
  const heading = type === "d3" ? "\u03A5\u03C0\u03B5\u03BD\u03B8\u03CD\u03BC\u03B9\u03C3\u03B7 \u03A0\u03BB\u03B7\u03C1\u03C9\u03BC\u03AE\u03C2" : "\u0397\u03BC\u03AD\u03C1\u03B1 \u039B\u03AE\u03BE\u03B7\u03C2!";
  const bodyText =
    type === "d3"
      ? "\u039F \u03C0\u03B1\u03C1\u03B1\u03BA\u03AC\u03C4\u03C9 \u03BB\u03BF\u03B3\u03B1\u03C1\u03B9\u03B1\u03C3\u03BC\u03CC\u03C2 \u03BB\u03AE\u03B3\u03B5\u03B9 \u03C3\u03B5 3 \u03B7\u03BC\u03AD\u03C1\u03B5\u03C2:"
      : "\u03A3\u03AE\u03BC\u03B5\u03C1\u03B1 \u03B5\u03AF\u03BD\u03B1\u03B9 \u03B7 \u03B7\u03BC\u03B5\u03C1\u03BF\u03BC\u03B7\u03BD\u03AF\u03B1 \u03BB\u03AE\u03BE\u03B7\u03C2 \u03C4\u03BF\u03C5 \u03C0\u03B1\u03C1\u03B1\u03BA\u03AC\u03C4\u03C9 \u03BB\u03BF\u03B3\u03B1\u03C1\u03B9\u03B1\u03C3\u03BC\u03BF\u03CD:";

  const formattedDate = new Date(bill.due_date).toLocaleDateString("el-GR");
  const referenceHtml = bill.reference_number
    ? `<p style="color: #6b7280; font-size: 14px;">\u0391\u03C1. \u0391\u03BD\u03B1\u03C6\u03BF\u03C1\u03AC\u03C2: ${bill.reference_number}</p>`
    : "";

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: system-ui, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #4f46e5 0%, #22c55e 100%); color: white; padding: 30px; border-radius: 10px 10px 0 0; }
    .content { background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; }
    .bill-card { background: white; border-radius: 8px; padding: 20px; margin: 20px 0; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
    .amount { font-size: 28px; font-weight: bold; color: #4f46e5; }
    .due-date { color: ${dueDateColor}; font-weight: 600; }
    .button { display: inline-block; background: #4f46e5; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; margin-top: 20px; }
    .footer { text-align: center; color: #6b7280; font-size: 12px; margin-top: 30px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1 style="margin:0;">FAB</h1>
      <p style="margin:10px 0 0 0;">${heading}</p>
    </div>
    <div class="content">
      <p>\u0393\u03B5\u03B9\u03B1 \u03C3\u03BF\u03C5 ${profile.full_name || ""},</p>
      <p>${bodyText}</p>

      <div class="bill-card">
        <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 15px;">
          <span style="font-size: 24px;">${provider.icon}</span>
          <span style="font-weight: 600; font-size: 18px;">${provider.name_el}</span>
        </div>
        <p style="margin: 5px 0;"><strong>\u03A4\u03AF\u03C4\u03BB\u03BF\u03C2:</strong> ${bill.title}</p>
        <p class="amount">\u20AC${bill.amount.toFixed(2)}</p>
        <p class="due-date">\u039B\u03AE\u03BE\u03B7: ${formattedDate}</p>
        ${referenceHtml}
      </div>

      <a href="https://fab.gr/dashboard" class="button">\u0394\u03B5\u03C2 \u03C4\u03BF\u03C5\u03C2 \u03BB\u03BF\u03B3\u03B1\u03C1\u03B9\u03B1\u03C3\u03BC\u03BF\u03CD\u03C2 \u03C3\u03BF\u03C5</a>

      <div class="footer">
        <p>\u0391\u03C5\u03C4\u03CC \u03C4\u03BF email \u03C3\u03C4\u03AC\u03BB\u03B8\u03B7\u03BA\u03B5 \u03B1\u03C0\u03CC \u03C4\u03B7\u03BD FAB.</p>
        <p>\u0393\u03B9\u03B1 \u03BD\u03B1 \u03B4\u03B9\u03B1\u03C7\u03B5\u03B9\u03C1\u03B9\u03C3\u03C4\u03B5\u03AF\u03C2 \u03C4\u03B9\u03C2 \u03B5\u03B9\u03B4\u03BF\u03C0\u03BF\u03B9\u03AE\u03C3\u03B5\u03B9\u03C2 \u03C3\u03BF\u03C5, \u03B5\u03C0\u03B9\u03C3\u03BA\u03AD\u03C8\u03BF\u03C5 \u03C4\u03B9\u03C2 <a href="https://fab.gr/settings">\u03C1\u03C5\u03B8\u03BC\u03AF\u03C3\u03B5\u03B9\u03C2</a>.</p>
      </div>
    </div>
  </div>
</body>
</html>`;
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

    const { type } = await req.json(); // 'd3' or 'd0'
    const today = new Date();
    let targetDate: Date;
    let notificationType: string;
    let updateField: string;

    if (type === "d3") {
      targetDate = new Date(today.getTime() + 3 * 24 * 60 * 60 * 1000);
      notificationType = "bill_due_d3";
      updateField = "notified_d3";
    } else if (type === "d0") {
      targetDate = today;
      notificationType = "bill_due_d0";
      updateField = "notified_d0";
    } else {
      throw new Error("Invalid notification type");
    }

    const targetDateStr = targetDate.toISOString().split("T")[0];

    // Fetch bills due on the target date that haven't been notified yet
    const { data: bills, error: billsError } = await supabase
      .from("bills")
      .select(
        `
        *,
        profiles:user_id (email, full_name, notification_preferences),
        providers:provider_id (name, name_el, icon)
      `,
      )
      .eq("status", "pending")
      .eq("due_date", targetDateStr)
      .eq(updateField, false);

    if (billsError) throw billsError;

    let sentCount = 0;

    for (const bill of bills || []) {
      const profile = bill.profiles as {
        email: string;
        full_name?: string;
        notification_preferences?: { email?: boolean };
      } | null;
      const provider = bill.providers as {
        name: string;
        name_el: string;
        icon: string;
      } | null;

      if (!profile?.email || !profile.notification_preferences?.email) {
        continue;
      }

      const subject =
        type === "d3"
          ? `\u23F0 \u03A5\u03C0\u03B5\u03BD\u03B8\u03CD\u03BC\u03B9\u03C3\u03B7: \u039B\u03BF\u03B3\u03B1\u03C1\u03B9\u03B1\u03C3\u03BC\u03CC\u03C2 ${provider!.name_el} \u03BB\u03AE\u03B3\u03B5\u03B9 \u03C3\u03B5 3 \u03B7\u03BC\u03AD\u03C1\u03B5\u03C2`
          : `\uD83D\uDD14 \u03A3\u03AE\u03BC\u03B5\u03C1\u03B1 \u03BB\u03AE\u03B3\u03B5\u03B9 \u03BF \u03BB\u03BF\u03B3\u03B1\u03C1\u03B9\u03B1\u03C3\u03BC\u03CC\u03C2 ${provider!.name_el}`;

      const html = buildEmailHtml(type, profile, provider!, bill);

      const sent = await sendEmail(profile.email, subject, html);

      if (sent) {
        // Mark bill as notified
        await supabase
          .from("bills")
          .update({ [updateField]: true })
          .eq("id", bill.id);

        // Record notification
        await supabase.from("notifications").insert({
          user_id: bill.user_id,
          bill_id: bill.id,
          type: notificationType,
          channel: "email",
          title: subject,
          body: `${provider!.name_el}: \u20AC${bill.amount.toFixed(2)} - \u03BB\u03AE\u03BE\u03B7 ${new Date(bill.due_date).toLocaleDateString("el-GR")}`,
          status: "sent",
          sent_at: new Date().toISOString(),
        });

        sentCount++;
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        type,
        target_date: targetDateStr,
        bills_found: bills?.length || 0,
        notifications_sent: sentCount,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      },
    );
  } catch (error) {
    console.error("Notification error:", error);
    return new Response(
      JSON.stringify({ success: false, error: (error as Error).message }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      },
    );
  }
});
