import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.39.0";

// Registers the caller's Web Push subscription (endpoint + keys) on
// push_subscriptions. Delete with {endpoint, unsubscribe:true}.

const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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
    const authHeader = req.headers.get("Authorization");
    const jwt = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!jwt) return json({ error: "No authorization header" }, 401);

    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey);
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser(jwt);
    if (authError || !user) return json({ error: "Invalid or expired token" }, 401);

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (!profile) return json({ error: "Profile not found" }, 404);

    const body = await req.json().catch(() => ({}));
    const { endpoint, keys, unsubscribe } = body ?? {};
    if (!endpoint || typeof endpoint !== "string" || !endpoint.startsWith("https://")) {
      return json({ error: "Valid push endpoint required" }, 400);
    }

    if (unsubscribe) {
      await supabaseAdmin
        .from("push_subscriptions")
        .delete()
        .eq("endpoint", endpoint)
        .eq("worker_id", profile.id);
      return json({ removed: true });
    }

    if (!keys?.p256dh || !keys?.auth) {
      return json({ error: "Push subscription keys required" }, 400);
    }

    const { error: upsertError } = await supabaseAdmin
      .from("push_subscriptions")
      .upsert(
        {
          worker_id: profile.id,
          endpoint,
          p256dh: String(keys.p256dh),
          auth: String(keys.auth),
          user_agent: req.headers.get("User-Agent") ?? null,
          last_seen_at: new Date().toISOString(),
        },
        { onConflict: "endpoint" },
      );
    if (upsertError) throw upsertError;

    return json({ saved: true });
  } catch (error) {
    console.error("save-push-subscription error:", error);
    return json({ error: "Failed to save subscription" }, 500);
  }
});
