import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "npm:stripe@13.10.0";
import { createClient } from "npm:@supabase/supabase-js@2.39.0";

// Escrow funding checkout. The client sends only `escrow_deposit_id`; the
// amount, currency, line items, metadata and redirect URLs are all derived
// here from the deposit row — a browser can never dictate what a checkout
// charges or which deposit it claims to fund.

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
    // Verify the caller's JWT and resolve their user.
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

    // Parse request body — only the deposit id is honored.
    const { escrow_deposit_id } = await req.json();
    if (!escrow_deposit_id || typeof escrow_deposit_id !== "string") {
      return json({ error: "escrow_deposit_id is required" }, 400);
    }

    // Look up the deposit and the caller's profile, then verify the caller
    // owns the company that opened the deposit.
    const [{ data: deposit, error: depositError }, { data: profile, error: profileError }] =
      await Promise.all([
        supabaseAdmin
          .from("escrow_deposits")
          .select("id, event_id, company_id, amount, currency, status")
          .eq("id", escrow_deposit_id)
          .maybeSingle(),
        supabaseAdmin
          .from("profiles")
          .select("id")
          .eq("user_id", user.id)
          .maybeSingle(),
      ]);

    if (depositError) throw depositError;
    if (profileError) throw profileError;
    if (!deposit) return json({ error: "Escrow deposit not found" }, 404);
    if (!profile) return json({ error: "Profile not found" }, 403);
    if (deposit.status !== "pending") {
      return json({ error: "Escrow deposit is not pending funding" }, 409);
    }

    const { data: company, error: companyError } = await supabaseAdmin
      .from("companies")
      .select("id, name, created_by")
      .eq("id", deposit.company_id)
      .single();
    if (companyError) throw companyError;
    if (company.created_by !== profile.id) {
      return json({ error: "Only the company that opened this deposit can fund it" }, 403);
    }

    const { data: event, error: eventError } = await supabaseAdmin
      .from("events")
      .select("id, name")
      .eq("id", deposit.event_id)
      .single();
    if (eventError) throw eventError;

    const origin = req.headers.get("origin") || new URL(req.url).origin;
    const returnTo = `${origin}/events/${deposit.event_id}`;
    const currency = String(deposit.currency || "usd").toLowerCase();
    const unitAmount = Math.round(Number(deposit.amount) * 100);
    if (!Number.isFinite(unitAmount) || unitAmount <= 0) {
      return json({ error: "Escrow deposit has an invalid amount" }, 422);
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [{
        price_data: {
          currency,
          product_data: {
            name: `Escrow deposit – ${event.name}`,
            description: "Held in escrow and released to crew as timesheets are approved",
          },
          unit_amount: unitAmount,
        },
        quantity: 1,
      }],
      mode: "payment",
      success_url: `${returnTo}?escrow=funded`,
      cancel_url: `${returnTo}?escrow=cancelled`,
      metadata: {
        escrow_deposit_id: deposit.id,
        event_id: deposit.event_id,
        company_id: deposit.company_id,
      },
    });

    return json({ sessionId: session.id, url: session.url });
  } catch (error) {
    console.error("Error creating checkout session:", error);
    return json({ error: (error as Error).message }, 500);
  }
});
