import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "npm:stripe@13.10.0";
import { createClient } from "npm:@supabase/supabase-js@2.39.0";

// Stripe → Flexzora webhook. Confirms escrow deposits once the company's
// Checkout payment settles by calling the service-role-only RPC
// `mark_escrow_funded`. Deploy with `--no-verify-jwt`; authenticity is
// established by the Stripe signature, not a Supabase JWT.

const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
if (!stripeSecretKey) throw new Error("STRIPE_SECRET_KEY is not set");
if (!webhookSecret) throw new Error("STRIPE_WEBHOOK_SECRET is not set");

const stripe = new Stripe(stripeSecretKey, { apiVersion: "2023-10-16" });
const supabase = createClient(
  Deno.env.get("SUPABASE_URL") || "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
);

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const signature = req.headers.get("stripe-signature");
  if (!signature) return json({ error: "Missing stripe-signature header" }, 400);

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(await req.text(), signature, webhookSecret);
  } catch (err) {
    return json({ error: `Invalid signature: ${(err as Error).message}` }, 400);
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded": {
        const session = event.data.object as Stripe.Checkout.Session;
        const depositId = session.metadata?.escrow_deposit_id;
        if (depositId && session.payment_status === "paid") {
          const paymentRef = typeof session.payment_intent === "string" ? session.payment_intent : session.id;
          const { error } = await supabase.rpc("mark_escrow_funded", {
            p_deposit_id: depositId,
            p_payment_ref: paymentRef,
          });
          // Stripe retries on non-2xx; an already-funded deposit is not an error worth retrying.
          if (error && !/already funded/.test(error.message)) throw error;
        }
        break;
      }
      default:
        break;
    }
    return json({ received: true });
  } catch (err) {
    console.error("stripe-webhook error", err);
    return json({ error: (err as Error).message }, 500);
  }
});
