import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "npm:stripe@13.10.0";
import { createClient } from "npm:@supabase/supabase-js@2.39.0";

// Stripe Connect onboarding for workers: creates (or reuses) the caller's
// Express account and returns a hosted onboarding link. Flag-gated: when
// STRIPE_SECRET_KEY isn't configured the function answers {available:false}
// instead of crashing — the UI hides the card in that case.

const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
const stripe = stripeSecretKey
  ? new Stripe(stripeSecretKey, { apiVersion: "2023-10-16" })
  : null;

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

    if (!stripe) return json({ available: false, reason: "stripe_not_configured" });

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("id, email, full_name")
      .eq("user_id", user.id)
      .maybeSingle();
    if (!profile) return json({ error: "Profile not found" }, 404);

    // Resolve the caller's sensitive row, creating it if needed.
    const { data: sensitive } = await supabaseAdmin
      .from("worker_sensitive")
      .select("worker_id, stripe_connect_account_id")
      .eq("worker_id", profile.id)
      .maybeSingle();

    let accountId = sensitive?.stripe_connect_account_id ?? null;
    if (!accountId) {
      const account = await stripe.accounts.create({
        type: "express",
        email: profile.email,
        capabilities: { transfers: { requested: true } },
        metadata: { worker_id: profile.id },
      });
      accountId = account.id;
      const { error: upsertError } = await supabaseAdmin
        .from("worker_sensitive")
        .upsert({ worker_id: profile.id, stripe_connect_account_id: accountId });
      if (upsertError) throw upsertError;
    }

    // Onboarding link: base URL comes from env, falling back to the caller's
    // Origin — it's only ever used for that user's own redirect.
    // Never trust request Origin for redirect returns — a forged header
    // sends Stripe's return link to an attacker domain. Site URL only.
    const base = (Deno.env.get("APP_BASE_URL") || "https://flexzora.pro").replace(/\/$/, "");
    const link = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${base}/payouts?connect=refresh`,
      return_url: `${base}/payouts?connect=return`,
      type: "account_onboarding",
    });

    return json({ available: true, url: link.url });
  } catch (error) {
    console.error("connect-onboard error:", error);
    return json({ error: "Failed to create onboarding link" }, 500);
  }
});
