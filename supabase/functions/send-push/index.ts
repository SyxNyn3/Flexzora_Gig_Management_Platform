import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2.39.0";
import { logOutbound } from "../_shared/logOutbound.ts";

// Internal push dispatcher. Called by the crew_alert_push trigger through
// pg_net — authenticated by the X-Push-Secret shared secret, NOT a user JWT
// (verify_jwt = false in config.toml). Sends a Web Push payload to every
// subscription registered to the target worker; dead endpoints are pruned.

const vapidPublic = Deno.env.get("VAPID_PUBLIC_KEY") ?? "";
const vapidPrivate = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
const vapidSubject = Deno.env.get("VAPID_SUBJECT") || "mailto:ops@flexzora.dev";
const internalSecret = Deno.env.get("PUSH_INTERNAL_SECRET") ?? "";

const pushReady = !!(vapidPublic && vapidPrivate);
if (pushReady) {
  webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate);
}

const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-push-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    // Shared-secret gate — this function must not be callable by users.
    if (!internalSecret || req.headers.get("X-Push-Secret") !== internalSecret) {
      return json({ error: "Unauthorized" }, 401);
    }
    if (!pushReady) return json({ available: false, reason: "vapid_not_configured" });

    const { worker_id: workerId, title, body, url } = await req.json().catch(() => ({}));
    if (!workerId || !title) return json({ error: "worker_id and title required" }, 400);

    const { data: subs, error: subsError } = await supabaseAdmin
      .from("push_subscriptions")
      .select("endpoint, p256dh, auth")
      .eq("worker_id", workerId);
    if (subsError) throw subsError;
    if (!subs?.length) return json({ sent: 0 });

    const payload = JSON.stringify({ title, body: body ?? "", url: url ?? "/dashboard" });
    const dead: string[] = [];
    let sent = 0;

    for (const sub of subs) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload,
        );
        sent += 1;
      } catch (e) {
        const status = (e as { statusCode?: number })?.statusCode;
        if (status === 404 || status === 410) dead.push(sub.endpoint);
        else console.error("push send failed:", status ?? e);
      }
    }

    if (dead.length) {
      await supabaseAdmin.from("push_subscriptions").delete().in("endpoint", dead);
    }

    await logOutbound(supabaseAdmin, {
      recipient_profile_id: workerId, channel: "push",
      template: title, body_preview: body,
    });
    return json({ sent, pruned: dead.length });
  } catch (error) {
    console.error("send-push error:", error);
    return json({ error: "Failed to send push" }, 500);
  }
});
