import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "npm:stripe@13.10.0";
import { createClient } from "npm:@supabase/supabase-js@2.39.0";

// Reports the caller's Stripe Connect status and syncs the cached flags on
// worker_sensitive. Flag-gated: {available:false} when Stripe isn't configured.

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

    if (!stripe) return json({ available: false });

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (!profile) return json({ error: "Profile not found" }, 404);

    const { data: sensitive } = await supabaseAdmin
      .from("worker_sensitive")
      .select("stripe_connect_account_id, payouts_enabled, stripe_connect_details_submitted")
      .eq("worker_id", profile.id)
      .maybeSingle();

    if (!sensitive?.stripe_connect_account_id) {
      return json({ available: true, connected: false, payoutsEnabled: false, detailsSubmitted: false });
    }

    const account = await stripe.accounts.retrieve(sensitive.stripe_connect_account_id);
    const payoutsEnabled = account.payouts_enabled === true;
    const detailsSubmitted = account.details_submitted === true;

    const { error: syncError } = await supabaseAdmin
      .from("worker_sensitive")
      .update({
        payouts_enabled: payoutsEnabled,
        stripe_connect_details_submitted: detailsSubmitted,
        connect_updated_at: new Date().toISOString(),
      })
      .eq("worker_id", profile.id);
    if (syncError) console.error("connect-status sync failed:", syncError);

    return json({ available: true, connected: true, payoutsEnabled, detailsSubmitted });
  } catch (error) {
    console.error("connect-status error:", error);
    return json({ error: "Failed to fetch connect status" }, 500);
  }
});
