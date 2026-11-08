# Checkout sessions must be single-use per order

**Found:** 2026-12-17, Flexzora Market (`market-checkout` + `stripe-webhook`).

## The bug class

Stripe Checkout Sessions are cheap to create and each one is independently
payable. If "click Pay" creates a new session every time, a buyer who
abandons checkout and clicks again gets a **second payable session**. If
they somehow complete both, the buyer is charged twice while the order row
can only transition once — the second payment becomes an orphaned charge
that a naive webhook either errors on forever (Stripe retries → noise) or
silently ignores (money taken, nothing delivered).

## The fix pattern (both halves required)

1. **Reuse the open session.** Store `stripe_checkout_session_id` on the
   order at session-creation time. On the next Pay click, `sessions.retrieve`
   it: if `status === 'open'`, return the same URL; if expired, create a
   fresh one and overwrite. The write is `.is(null)`-guarded so racing
   requests can't clobber each other.
2. **Refund duplicates at the webhook.** When the mark-paid RPC rejects a
   session because the order already moved past `pending_payment`, check
   whether a `payment_intent` exists and `stripe.refunds.create` it, then
   acknowledge the event (don't throw — throwing makes Stripe retry a
   permanently-failing event forever).

## Adjacent rules that held up

- Client sends only the object id (`order_id`); amount, fee, and payout
  destination are all read server-side from the DB row.
- Payment state flips only via webhook (service role), never via a
  client-callable RPC — `mark_market_order_paid` is gated on
  `current_profile_id() IS NULL`.
- Verify `amount_total` + `currency` against the DB row before marking
  paid; metadata alone is not proof.
