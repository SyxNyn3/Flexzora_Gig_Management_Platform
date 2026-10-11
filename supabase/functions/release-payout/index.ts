import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "npm:stripe@13.10.0";
import { createClient } from "npm:@supabase/supabase-js@2.39.0";

// Releases a queued payout: company-side "send the money" that creates the
// Stripe Connect transfer to the worker's onboarded account and marks the
// payout paid. Flag-gated: {available:false} without STRIPE_SECRET_KEY.
// Ownership: only the company that owns the payout's invoice may release it.

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

    const { payout_id: payoutId } = await req.json().catch(() => ({}));
    if (!payoutId || typeof payoutId !== "string") {
      return json({ error: "No payout ID provided" }, 400);
    }

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (!profile) return json({ error: "Payout not found" }, 404);

    // Resolve the payout + owning company; non-owners get a 404 — no oracle.
    const { data: payout } = await supabaseAdmin
      .from("payouts")
      .select("id, worker_id, amount, currency, status, invoice:invoices(company_id, companies(created_by))")
      .eq("id", payoutId)
      .maybeSingle();
    if (!payout) return json({ error: "Payout not found" }, 404);

    const invoice = Array.isArray(payout.invoice) ? payout.invoice[0] : payout.invoice;
    const company = invoice && (Array.isArray(invoice.companies) ? invoice.companies[0] : invoice.companies);
    if (company?.created_by !== profile.id) {
      return json({ error: "Payout not found" }, 404);
    }

    if (payout.status === "paid") {
      return json({ status: "paid", already: true });
    }

    // The worker must have a Connect account with payouts enabled. These
    // columns are service-role-only (#47: worker_sensitive_guard_write), so
    // the stored account id is the one connect-onboard created — not a
    // self-written destination.
    const { data: sensitive } = await supabaseAdmin
      .from("worker_sensitive")
      .select("stripe_connect_account_id, payouts_enabled")
      .eq("worker_id", payout.worker_id)
      .maybeSingle();
    if (!sensitive?.stripe_connect_account_id) {
      return json({ error: "Worker has not connected a payout account" }, 409);
    }
    if (!sensitive.payouts_enabled) {
      return json({ error: "Worker's payout account is not fully onboarded" }, 409);
    }

    // #24: claim the row atomically BEFORE touching Stripe. A single UPDATE …
    // WHERE status IN (queued, failed | stale processing) RETURNING is the
    // lock: a concurrent release (or a double-click) gets zero rows and a 409.
    const { data: claimedRows, error: claimError } = await supabaseAdmin
      .rpc("claim_payout_for_release", { p_payout_id: payout.id });
    if (claimError) throw claimError;
    const claimed = Array.isArray(claimedRows) ? claimedRows[0] : claimedRows;
    if (!claimed) {
      return json({ error: `Payout is ${payout.status} — already being released` }, 409);
    }

    const invoiceId = payout.invoice && (Array.isArray(payout.invoice) ? payout.invoice[0]?.id ?? null : payout.invoice.id);
    const amountCents = Math.round(Number(claimed.amount) * 100);

    let transfer: Stripe.Transfer | undefined;

    // Re-claimed a stale 'processing' row: a previous attempt may have made
    // the transfer and died before recording it. Look it up by group +
    // metadata first — belt and braces beyond the 24h idempotency window.
    if (payout.status === "processing" && invoiceId) {
      const existing = await stripe.transfers.list({ transfer_group: invoiceId, limit: 100 });
      transfer = existing.data.find((t) => t.metadata?.payout_id === claimed.id);
    }

    if (!transfer) {
      try {
        // Idempotency key = payout id: if we crashed after Stripe created the
        // transfer but before the paid-update landed, the stale-processing
        // re-claim replays this exact call and Stripe returns the SAME
        // transfer instead of moving the money twice.
        transfer = await stripe.transfers.create(
          {
            amount: amountCents,
            currency: String(claimed.currency || "USD").toLowerCase(),
            destination: sensitive.stripe_connect_account_id,
            transfer_group: invoiceId ?? undefined,
            metadata: { payout_id: claimed.id },
          },
          { idempotencyKey: `payout:${claimed.id}` },
        );
      } catch (stripeError) {
        // Release the claim so the company can retry once the cause is fixed.
        const reason = stripeError instanceof Stripe.errors.StripeError ? stripeError.message : "Stripe transfer failed";
        await supabaseAdmin
          .from("payouts")
          .update({ status: "failed", failure_reason: reason.slice(0, 500) })
          .eq("id", claimed.id)
          .eq("status", "processing");
        throw stripeError;
      }
    }

    const { error: updateError } = await supabaseAdmin
      .from("payouts")
      .update({ status: "paid", stripe_transfer_id: transfer.id, paid_at: new Date().toISOString() })
      .eq("id", claimed.id);
    if (updateError) throw updateError;

    return json({ status: "paid", transfer_id: transfer.id });
  } catch (error) {
    console.error("release-payout error:", error);
    const message = error instanceof Stripe.errors.StripeError ? error.message : "Failed to release payout";
    return json({ error: message }, 500);
  }
});
