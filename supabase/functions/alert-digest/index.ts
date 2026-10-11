import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.39.0";

// SmartAlerts SMS digest — called ONLY by the database via pg_net
// (send_alert_sms_digests), authenticated by the X-Push-Secret shared
// secret, NOT a user JWT. The worker's phone number is resolved
// server-side; the request can never aim a text at an arbitrary number.
//
// Contract: { worker_id, items: [{ title, body }] } — one SMS per call.
// Without TWILIO_* configured it is a graceful no-op, same posture as
// notify-assignment and the Stripe sandbox.

const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const internalSecret = Deno.env.get("PUSH_INTERNAL_SECRET") ?? "";

const twilioSid = Deno.env.get("TWILIO_ACCOUNT_SID");
const twilioToken = Deno.env.get("TWILIO_AUTH_TOKEN");
const twilioFrom = Deno.env.get("TWILIO_FROM_NUMBER");

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

type DigestItem = { title: string; body: string };

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    if (!internalSecret || req.headers.get("X-Push-Secret") !== internalSecret) {
      return json({ error: "Unauthorized" }, 401);
    }

    const { worker_id, items } = await req.json();
    if (!worker_id || !Array.isArray(items) || items.length === 0) {
      return json({ error: "worker_id and non-empty items are required" }, 400);
    }

    const { data: worker, error: workerError } = await supabaseAdmin
      .from("profiles")
      .select("full_name, phone")
      .eq("id", worker_id)
      .maybeSingle();
    if (workerError) throw workerError;
    if (!worker?.phone) {
      return json({ sent: false, reason: "no worker phone on file" });
    }

    const first = (items as DigestItem[])[0];
    const body = items.length === 1
      ? `Flexzora alert: ${first.title} — ${first.body}`
      : `Flexzora: ${items.length} new alerts — ${first.title} +${items.length - 1} more. Open the app for details.`;

    if (!twilioSid || !twilioToken || !twilioFrom) {
      return json({ sent: false, reason: "twilio not configured", preview: body });
    }

    const twilioResp = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: "Basic " + btoa(`${twilioSid}:${twilioToken}`),
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ To: worker.phone, From: twilioFrom, Body: body }),
      }
    );

    if (!twilioResp.ok) {
      const detail = await twilioResp.text();
      console.error(`Twilio send failed (${twilioResp.status}):`, detail);
      return json({ sent: false, reason: "twilio send failed" }, 502);
    }

    return json({ sent: true });
  } catch (error) {
    console.error("alert-digest error:", error);
    return json({ error: (error as Error).message }, 500);
  }
});
