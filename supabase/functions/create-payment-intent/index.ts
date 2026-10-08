import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "npm:stripe@13.10.0";
import { createClient } from "npm:@supabase/supabase-js@2.39.0";

const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
if (!stripeSecretKey) {
  throw new Error("STRIPE_SECRET_KEY is not set");
}

const stripe = new Stripe(stripeSecretKey, {
  apiVersion: "2023-10-16",
  typescript: true,
});

const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";

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

// Hard ceiling so a crafted request can't open a PaymentIntent for absurd
// amounts on the platform's Stripe account.
const MAX_AMOUNT = 250_000; // USD
const ALLOWED_CURRENCIES = new Set(["usd"]);

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }

  try {
    // Verify the caller's JWT — "header present" is not authentication.
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
    const { amount, currency = "usd", metadata = {} } = await req.json();

    const numAmount = Number(amount);
    if (!Number.isFinite(numAmount) || numAmount <= 0 || numAmount > MAX_AMOUNT) {
      return json({ error: "Invalid amount" }, 400);
    }

    const normalizedCurrency = String(currency).toLowerCase();
    if (!ALLOWED_CURRENCIES.has(normalizedCurrency)) {
      return json({ error: "Unsupported currency" }, 400);
    }

    // Keep client metadata but force the owning user into it so the intent is
    // attributable on the Stripe side.
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(numAmount * 100),
      currency: normalizedCurrency,
      metadata: {
        ...metadata,
        supabase_user_id: user.id,
        created_at: new Date().toISOString(),
      },
      automatic_payment_methods: {
        enabled: true,
      },
    });

    // Return the client secret
    return json({
      clientSecret: paymentIntent.client_secret || '',
      paymentIntentId: paymentIntent.id,
      amount: paymentIntent.amount,
      currency: paymentIntent.currency,
      status: paymentIntent.status,
    });
  } catch (error) {
    console.error("Error creating payment intent:", error);
    return json({ error: (error as Error).message }, 500);
  }
});
