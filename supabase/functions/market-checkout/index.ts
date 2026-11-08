import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "npm:stripe@13.10.0";
import { createClient } from "npm:@supabase/supabase-js@2.39.0";

// Crew-marketplace checkout. The client sends only `order_id`; everything
// money-related — amount, the 5% platform fee, the seller's Connect
// destination — is read server-side from the order/listing/seller rows.
// A browser can never dictate what a marketplace checkout charges.
//
// Charge shape: Stripe *destination charge* — the full item price is
// collected from the buyer, `application_fee_amount` (5%, snapshotted on
// the order at creation) goes to the platform, the remainder transfers
// to the seller's Express account. Shipping cost is NOT in the checkout:
// v1 captures the buyer's address + tracking number for coordination,
// actual freight is settled between the parties (documented decision —
// no shipping-rate integration yet).

const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
if (!stripeSecretKey) {
  throw new Error("STRIPE_SECRET_KEY is not set");
}
const stripe = new Stripe(stripeSecretKey, { apiVersion: "2023-10-16" });

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

    const { order_id } = await req.json();
    if (!order_id || typeof order_id !== "string") {
      return json({ error: "order_id is required" }, 400);
    }

    // Resolve the caller's profile — orders are keyed by profile id.
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (!profile) return json({ error: "Profile not found" }, 403);

    // Service-role read: the order row is the source of truth for amount,
    // fee, seller and listing title.
    const { data: order, error: orderError } = await supabaseAdmin
      .from("marketplace_orders")
      .select("id, listing_id, buyer_id, seller_id, amount_cents, fee_cents, currency, fulfillment, status, stripe_checkout_session_id")
      .eq("id", order_id)
      .maybeSingle();
    if (orderError) throw orderError;
    if (!order) return json({ error: "Order not found" }, 404);
    if (order.buyer_id !== profile.id) {
      return json({ error: "Only the buyer can check out this order" }, 403);
    }
    if (order.status !== "pending_payment") {
      return json({ error: `Order is ${order.status} — cannot check out` }, 409);
    }

    const [{ data: listing }, { data: sellerSensitive }] = await Promise.all([
      supabaseAdmin
        .from("marketplace_listings")
        .select("title, status")
        .eq("id", order.listing_id)
        .maybeSingle(),
      supabaseAdmin
        .from("worker_sensitive")
        .select("stripe_connect_account_id, payouts_enabled")
        .eq("worker_id", order.seller_id)
        .maybeSingle(),
    ]);
    if (!listing) return json({ error: "Listing not found" }, 404);
    // The listing must still be active at checkout time — 'sold' means
    // another order already paid for it (the one-open-order-per-listing
    // index makes this rare, but the check stays as the backstop).
    if (listing.status !== "active") {
      return json({ error: "Listing is no longer available" }, 409);
    }

    // The seller must be able to receive the transfer before we charge
    // the buyer — otherwise the platform collects money it cannot deliver.
    const connectAcct = sellerSensitive?.stripe_connect_account_id;
    if (!connectAcct || sellerSensitive?.payouts_enabled !== true) {
      return json({
        error: "seller_payouts_not_ready",
        message: "The seller hasn't finished connecting their payout account yet. Try again later or message them.",
      }, 409);
    }

    const origin = Deno.env.get("APP_BASE_URL") || "https://flexzora.pro";
    const currency = String(order.currency || "usd").toLowerCase();

    // Idempotent re-checkout: if a session was already created for this
    // order, reuse it while Stripe still has it open. Without this, a buyer
    // who abandons checkout and clicks Pay again gets a SECOND payable
    // session — paying both would double-charge them (the webhook only
    // marks the order paid once).
    if (order.stripe_checkout_session_id) {
      try {
        const existing = await stripe.checkout.sessions.retrieve(order.stripe_checkout_session_id);
        if (existing.status === "open" && existing.url) {
          return json({ sessionId: existing.id, url: existing.url });
        }
        // 'expired' or 'complete' — fall through and create a fresh session.
      } catch {
        // Session gone (deleted/test-mode churn) — create a new one.
      }
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [{
        price_data: {
          currency,
          product_data: {
            name: listing.title,
            description: `Flexzora Market — ${order.fulfillment === "ship" ? "shipped" : "local pickup"}`,
          },
          unit_amount: order.amount_cents,
        },
        quantity: 1,
      }],
      mode: "payment",
      success_url: `${origin}/market/orders?paid=1`,
      cancel_url: `${origin}/market/orders?cancelled=1`,
      // Destination charge: buyer pays item price; Stripe takes its
      // processing cut from the transfer; our 5% application fee and the
      // seller's remainder split automatically.
      payment_intent_data: {
        application_fee_amount: order.fee_cents,
        transfer_data: { destination: connectAcct },
      },
      metadata: {
        market_order_id: order.id,
        listing_id: order.listing_id,
      },
    });

    // Record the session on the order so the next Pay click reuses it (see
    // above). The webhook overwrites the same column with the same value at
    // payment time — harmless. Only claim the column if still empty so a
    // racing checkout can't clobber a session another request just stored.
    await supabaseAdmin
      .from("marketplace_orders")
      .update({ stripe_checkout_session_id: session.id })
      .eq("id", order.id)
      .is("stripe_checkout_session_id", null);

    return json({ sessionId: session.id, url: session.url });
  } catch (error) {
    console.error("market-checkout error:", error);
    return json({ error: (error as Error).message }, 500);
  }
});
