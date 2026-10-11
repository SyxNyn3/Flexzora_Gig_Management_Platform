# Agent Log

Running ledger for the Flexzora overnight build. Newest entries first.
Each entry: lane, branch/PR, what shipped, verification status, notes.

---

## Builder — Crew OS sprint (overnight)

### feat/push-alerts — Web Push transport for the alert feed

- `push_subscriptions` (worker-self RLS, endpoint unique) +
  `save-push-subscription` (JWT'd upsert/unsubscribe) +
  `send-push` (internal shared-secret gate, `npm:web-push`, prunes
  dead endpoints).
- `crew_alert_push` trigger: pg_net POST to send-push — but only when
  `app.push_fn_url` + `app.push_internal_secret` DB settings exist;
  unset = silent skip, feed unaffected.
- `sw.js`: push → showNotification w/ crew-page deep link;
  notificationclick focuses/navigates the app.
- `src/lib/push.ts`: subscribe/unsubscribe/status; "Alert this
  device" toggle on the briefing card. Hidden without
  `VITE_VAPID_PUBLIC_KEY`.
- Live blockers: `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`/`VAPID_SUBJECT`,
  `PUSH_INTERNAL_SECRET`, DB settings for dispatch URL. VAPID keys are
  free (self-generated) — not a paid-service blocker.
- Stacked on `feat/stripe-connect`.

### feat/stripe-connect — Stripe Connect onboarding + payout release

- `connect-onboard`: worker gets/reuses a Stripe Express account,
  returns a hosted onboarding link (return/refresh URLs derive from
  APP_BASE_URL or the caller's Origin — used only for their redirect).
- `connect-status`: reports + syncs `worker_sensitive.payouts_enabled`
  and `stripe_connect_details_submitted` from the live account object.
- `release-payout`: company-side "send the money" — verifies the caller
  owns the payout's invoice company (404 oracle-free), checks the
  worker is onboarded + payouts-enabled, creates the transfer with
  `transfer_group=invoice_id`, marks the payout paid with the
  transfer id.
- All three flag-gated: `{available:false}` when STRIPE_SECRET_KEY is
  absent — the UI hides and no code path breaks.
- UI: "Get paid to your bank" connect card on the worker Payouts page
  (handles `?connect=return`), "Payouts to release" queue on the
  company Timesheets page via `useCompanyPayouts`.
- Live blocker: Stripe account + secrets at deploy time.
- Stacked on `feat/shift-swap`.

### feat/shift-swap → PR #15 — ShiftSwap

- `swap_requests`/`swap_claims`: confirmed booking -> open swap ->
  claims -> accept -> offered assignment -> confirm -> handoff.
- Cert gate: `worker_meets_shift_certs` (verified, active, covers call
  date — mirrors matchScore) gates both claims AND RLS visibility.
- Company approval rides the existing offer flow: claimer holds an
  'offered' assignment, company gets a `notifications` row, keeps all
  decline/cancel levers.
- Sweetener mints a manual `crew_iou` on completion; crew_alerts tell
  both parties. Unwinds on offer death, request cancel, shift delete.
- Guards INVOKER w/ current_user exemption; sync DEFINER — codebase
  pattern. Terminal assignment rows revive via ON CONFLICT.
- UI: swap card on the crew page. Seed: Alex's $50 sweetener swap.

### feat/smart-alerts → PR #14 — SmartAlerts briefing feed

- `crew_alerts` feed (worker-self RLS, dedupe keys, read_at — no delete,
  doubles as audit trail).
- Confirm trigger writes gear/parking/departure briefing:
  - gear = base_gear_items + cert_gear_items on required certs
    (data-driven, editable without redeploys)
  - parking = venue flags + notes + parking_json
  - departure = worker_sensitive geo -> venue, 55 km/h + 20 min buffer
- Ride-cancel trigger alerts matched riders.
- Briefing card on crew page: unread badge, mark-all-read, per-kind
  icons. `gearChecklist()` client helper for pre-booking use.
- Seed: venue parking intel, worker home coords, confirmed bookings.

### feat/crew-ui → PR #13 — Crew board UI

- `/shifts/:shiftId/crew` — phone-first crew page: commitments strip
  (shares committed vs. 25% deduction cap estimated from rate × call length),
  getting-there toggles, four tabs (Rides / Bunks / Grub / Board),
  collapsible post forms, briefing card for SmartAlerts.
- Entry point: "Crew" link on every booking card; lazy route.
- One-tap Join/Bail/Leave/Order everywhere; runner price-confirm mints IOU;
  author-resolve picker populated from everyone visible on the boards.
- Verification: no local Node/Deno on this machine — CI runs
  lint/typecheck/vitest/build per PR.
- Stacked on `feat/grubrun`. Merge order: #8 → #9 → #10 → #11 → #12 → #13.

### feat/grubrun → PR #12 — GrubRun food pooling

- `food_runs` (restaurant, menu link, order cutoff, delivery area) +
  `food_run_orders` (one per worker per run).
- Debt isn't real until it costs something: runner confirms each order
  with the actual price — THAT mints the food `crew_iou`
  (beneficiary=runner, group=order).
- Worker edits/cancels while 'placed'; runner/company cancels anytime;
  run/shift cancel closes orders and voids group IOUs.
- Seed: burrito run + a still-placed order.
- Stacked on `feat/crew-board`.

### feat/crew-board → PR #11 — CrewBoard structured posts

- `crew_posts` anchored on `shift_id` — gig_messages is creator-broadcast
  on legacy gigs, wrong anchor for worker-to-crew posts.
- Categories ride/lodging/food/borrow/announce/general + want/offer
  direction + optional amount.
- Resolve names the fulfiller; priced posts mint the `crew_iou` in the
  correct debt direction; zero-amount resolves as a favor.
- Seed: open glove borrow ($5) + spare-harness offer.

### feat/crew-lodging → PR #10 — BunkUp lodging pools

- `lodging_pools` (hotel/airbnb/house/camp/rv) + `pool_members` with
  spot accounting via sync triggers.
- Joined members get a lodging-share `crew_iou` against the host;
  leaving/pool-cancel/shift-cancel voids committed shares.
- Venue fields: `overnight_parking`, `camping_allowed`, `parking_notes`,
  `parking_json` (feeds SmartAlerts later).
- Seed: Airbnb pool near venue with one joined bunk.
- Stacked on `feat/crew-rides`.

### feat/crew-rides → PR #9 — CrewPool rides

- `needs_ride`/`can_drive` flags on `shift_assignments`.
- `ride_offers` + `ride_requests`; seat accounting in triggers;
  a matched request mints the gas-share IOU (beneficiary=driver,
  group=offer). Withdraw frees the seat and voids the IOU.
- Offer-change-while-matched handled (frees old seat, voids old IOU).
- `guard_crew_iou_update` gained the same `current_user` exemption used by
  the assignment guard so SECURITY DEFINER cascades stay legal.
- Seed: 3-seat offer from the hotel + matched rider (IOU auto-minted).
- Stacked on `feat/crew-iou`.

### feat/crew-iou → PR #8 — crew_iou ledger (foundation)

- Append-only `crew_iou` ledger: kind, amount, beneficiary (worker or
  free-text), status (committed/settled/void/failed), settle_via, group.
- `approve_timesheet` hook: settles committed payout-deduction IOUs
  oldest-first, capped at 25% of gross, as a negative invoice line; payout
  draws net from escrow.
- Shift cancel/delete voids committed IOUs; no DELETE — void instead.
- Guard trigger restricts transitions; definer exemption for cascades.
- Pure math split into `iouMath.ts` so Vitest runs without Supabase env
  (CI fix: `supabaseUrl is required`).
- v1 gap (noted in backlog): deducted funds stay in event escrow —
  beneficiary transfer lands with Stripe Connect.

### feat/notify-assignment → PR #7 — Twilio assignment SMS

- `notify-assignment` edge function: verifies caller is a party to the
  assignment, resolves worker/company phones server-side, sends via
  Twilio REST. No `TWILIO_*` → `{sent:false}` graceful degrade.
- `src/lib/notify.ts` fire-and-forget helper; wired into applyToShift,
  directBook, respondToOffer, decideApplication.
- `supabase/config.toml` verify_jwt entry added.
- Blocker for live SMS: needs `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`,
  `TWILIO_FROM` secrets.

### feat/auth-ux → PR #6 — Auth UX completion

- Check-email state after signup (email confirmation is ON — was routing
  to dashboard and bouncing users back).
- Forgot-password flow: forgot view + `/reset-password` page +
  `updateUser` handling.
- Google/Apple buttons gated behind `VITE_ENABLE_GOOGLE_AUTH` /
  `VITE_ENABLE_APPLE_AUTH` (don't render unconfigured OAuth).
- Friendly error map incl. email-not-confirmed → resend with cooldown.
- Fixed `type="email"` + email Zod schema blocking username sign-in.

## Earlier — security hardening (main, pre-lane split)

- `authkit-token`: JWT verified, identity = auth user id (was raw header).
- Checkout/payment-intent functions: JWT + ownership + server-side amounts.
- `lookup-user`: usernames only (email-enumeration oracle closed).
- Waitlist verify link no longer returned in responses.
- `20261008000000`: `search_path` pinned on all SECURITY DEFINER functions.
- `sw.js`: network-first navigation; `schedule-demo` persists demo_requests.
