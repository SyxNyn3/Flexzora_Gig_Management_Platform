import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "npm:stripe@13.10.0";
import { createClient } from "npm:@supabase/supabase-js@2.39.0";

// Returns a minimal, non-sensitive projection of a PaymentIntent — and only to
// a caller who owns the company that funded the escrow deposit the intent paid
// for. Never return the raw Stripe object: it carries customer, charge and
// payment-method details that must not be readable by arbitrary users.

const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
if (!stripeSecretKey) {
  throw new Error("STRIPE_SECRET_KEY is not set");
}

const stripe = new Stripe(stripeSecretKey, {
  apiVersion: "2023-10-16",
});

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
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }

  try {
    // Verify the caller's JWT.
    const authHeader = req.headers.get("Authorization");
    const jwt = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!jwt) {
      return json({ error: "No authorization header" }, 401);
    }

    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey);
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser(jwt);
    if (authError || !user) {
      return json({ error: "Invalid or expired token" }, 401);
    }

    // Parse request body
    const { paymentIntentId } = await req.json();
    if (!paymentIntentId || typeof paymentIntentId !== "string") {
      return json({ error: "No payment intent ID provided" }, 400);
    }

    // Ownership: the intent must back an escrow deposit owned by a company the
    // caller created.
    const { data: deposit, error: depositError } = await supabaseAdmin
      .from("escrow_deposits")
      .select("id, company_id")
      .eq("stripe_payment_intent_id", paymentIntentId)
      .maybeSingle();
    if (depositError) throw depositError;

    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (profileError) throw profileError;
    if (!profile) return json({ error: "Payment intent not found" }, 404);

    let authorized = false;
    if (deposit) {
      const { data: company } = await supabaseAdmin
        .from("companies")
        .select("created_by")
        .eq("id", deposit.company_id)
        .maybeSingle();
      authorized = company?.created_by === profile.id;
    }
    if (!authorized) {
      // Indistinguishable from "does not exist" — no oracle.
      return json({ error: "Payment intent not found" }, 404);
    }

    // Retrieve the payment intent
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

    // Minimal projection only.
    return json({
      id: paymentIntent.id,
      status: paymentIntent.status,
      amount: paymentIntent.amount,
      currency: paymentIntent.currency,
      created: paymentIntent.created,
      metadata: { event_id: paymentIntent.metadata?.event_id },
    });
  } catch (error) {
    console.error("Error retrieving payment intent:", error);
    return json({ error: (error as Error).message }, 500);
  }
});
