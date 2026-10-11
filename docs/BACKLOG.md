# Flexzora delivery backlog

Ordered queue for build sessions and scheduled automations. One item ≈ one session unless noted.

## Claims (lane coordination)

Two sessions work this repo in parallel. **Before starting any item, mark it**: append `(claimed: <name> — working on it)`. Check claims before picking up work; clear your claim when done (`done: <name>`) or released. Lane names: **Mark** = cloud/manager session (d713fbae), **Tom** = desktop session (89ab957d), **Devin** = desktop session (security pass, 2026-10-08).

- Repo privacy toggle (make repo private again) — **claimed: Tom — working on it** (gh token lacks permission; asked user to flip in Settings)
- Migration duplicate-DDL cleanup (blocks clean `supabase start` from repo files) — **done: Tom** (all migrations idempotent; verified via double clean replay)
- `handle_new_user` qualified-insert + search_path fix (new migration) — **done: Tom** (20261006180000)
- `gig_messages` table + live `GigCommunication` (currently 100% mock, no table exists) — **done: Tom**
- Live-wire `UnifiedSchedule` / `ConflictDetection` / `CompanyDashboard` (still mock-only) — **done: Tom** (+ `WorkerGigList` browse list)
- Honest empty states: replace mock-number fallbacks (dashboard 15420 etc.) with real zeros — **done: Tom**
- Weekly waitlist-metrics automation — **done: Mark** (automation created, pending user approval)
- `.github/workflows/ci.yml` — **claimed: Mark — working on it**
- PR #4 review-finding sweeps — **claimed: Mark — working on it**
- Security sweep: edge-function auth & search_path — **done: Devin**
  - `authkit-token` verified the raw Authorization string as identity — now calls `auth.getUser(jwt)` and mints AuthKit tokens as `user.id` only.
  - `create-checkout-session` took client `lineItems`/`successUrl`/`cancelUrl` — now takes only `escrow_deposit_id`, derives amount/items/redirects server-side, verifies caller owns the deposit's company.
  - `retrieve-payment-intent` returned the full Stripe object to anyone — now JWT + escrow-ownership check + minimal field projection (404 not 403, no oracle).
  - `create-payment-intent` — now verifies JWT, enforces amount bounds + currency allowlist, stamps `supabase_user_id` into metadata.
  - `lookup-user` — rejects email identifiers (usernames only); kills the account-enumeration oracle.
  - `send-waitlist-verification` — no longer returns `verification_link` in the response.
  - New migration `20261008000000` pins `search_path` on every public `SECURITY DEFINER` function lacking it (pg_temp shadowing risk — same class as the `handle_new_user` fix).
  - New `supabase/config.toml` pins `verify_jwt` per function so deploy-time auth policy is versioned, not flag-dependent.
  - `public/sw.js` — was cache-first-forever (stale builds pinned); now network-first for navigations, cache-first only for same-origin static assets, never caches API/auth traffic.
  - `schedule-demo` dropped every submission — now persists to new `demo_requests` table (`20261008010000`, service-role-only RLS).
  - Removed dead `stripe.ts` exports calling edge functions that were never deployed (`setup-payment-method`, `list-payment-methods`, `create-customer`, `create-payment-link`).
  - Still open: `.env` sits in git history with anon/publishable keys (low — public by design); stray scratch files `00`/`01` duplicate migration `20251006224047`; `send-waitlist-verification`/`resend` still only log the email — no real mail provider wired (needs e.g. Resend/SES key); sales-team notification for demo requests is a TODO in `schedule-demo`.
- **Builder lane — claimed: Builder — working on it** (overnight self-drive, started 2026-10-10)
- **Challenger lane — claimed: Devin-Challenger — working on it** (overnight red-team, started 2026-10-10; files issues labeled `challenger`)
- Everything below is unclaimed.

## Company OS — overnight sprint (see `docs/VISION_COMPANY_OS.md` — spec + competitor findings)
- [ ] AI Upload Wizard: `import_jobs`/`import_rows`, XLSX/CSV/PDF parse → LLM entity mapping (OmniRoute `localhost:20128/v1`, heuristic fallback) → review screen → bulk import
- [ ] Company Copilot: `company_docs` + copilot panel — ask-your-data queries + action previews (broadcast drafts, schedule lookups). Flag `VITE_ENABLE_COPILOT`
- [ ] Staff layer: `staff_members`/`staff_assignments` — PMs/coordinators on rosters, crew+staff unified show view
- [ ] Broadcast messaging: compose to crew AND staff (per-event/shift/all) + delivery log
- [ ] ICS calendar feed (subscribe links that actually update) + `events.timezone` multi-timezone display
- [ ] Ops kanban: `ops_tasks` + auto-created urgent cards for unfilled calls
- [ ] Tour-level export: full crew list + schedule per event range → CSV/PDF
- [ ] Auto-reminders: shift, cert-expiry, unfilled-call, timesheet-pending — one alerts inbox

## Crew OS — overnight sprint (see `docs/VISION_CREW_OS.md` for full spec + quality bar)
- [x] `crew_iou` ledger migration + settlement hook in `approve_timesheet` (gross − Σ open IOUs, 25% cap, void on shift cancel) — **done: Builder** (`20261010000000_crew_iou.sql`: enum'd ledger w/ append-only guard, RLS for worker/beneficiary/company, void-on-shift-cancel + void-on-shift-delete triggers; `approve_timesheet` settles committed payout-deduction IOUs oldest-first, whole rows, capped at 25% of gross, records deduction as an invoice line item, escrow draws net. Client: `src/lib/crew/iou.ts` + `iou.test.ts`; demo rows in `seed.sql`. Open v1 gap: deducted cents stay in event escrow — beneficiary transfer lands with Stripe Connect.)
- [x] CrewPool rides: `ride_offers`/`ride_requests`, need-ride/can-drive flags, gas-share IOU — **done: Builder** (`20261011000000_crew_rides.sql`: needs_ride/can_drive on shift_assignments; ride_offers + ride_requests w/ seat ledger kept by triggers; match mints a `crew_iou` gas share (beneficiary=driver, group=offer) — withdraw frees the seat + voids it; offer/shift cancel cascades. Guard exemption added to `guard_crew_iou_update` so definer internals can maintain rows. Client `src/lib/crew/rides.ts`.)
- [x] BunkUp lodging pools: `lodging_pools`/`pool_members`, venue overnight-parking fields — **done: Builder** (`20261012000000_crew_lodging.sql`: pools per shift (hotel/airbnb/house/camp/rv), host sets per-spot share_cents; join takes spots + mints lodging `crew_iou` (beneficiary=host); leave/remove/host-cancel/shift-cancel free spots + void IOUs. Venue overnight_parking/camping_allowed/parking_notes/parking_json for BunkUp + SmartAlerts. Client `src/lib/crew/lodging.ts`.)
- [x] CrewBoard: structured post categories — **done: Builder** (`20261013000000_crew_board.sql`: `crew_posts` on shift_id (gig_messages is creator-broadcast on legacy gigs — wrong anchor); category ride/lodging/food/borrow/announce/general + want/offer direction + optional amount_cents; resolve with fulfilled_by mints the `crew_iou` in the correct debt direction; zero-amount resolves as a favor. Client `src/lib/crew/board.ts`.)
- [x] GrubRun food pooling: `food_runs`/`food_run_orders` with cutoff times — **done: Builder** (`20261014000000_grubrun.sql`: runner posts restaurant + cutoff; workers place orders pre-cutoff (runner can add late); runner confirms with real price — THAT mints the food `crew_iou` (beneficiary=runner, group=order); cancel/run-cancel/shift-cancel void. One order per worker per run. Client `src/lib/crew/food.ts`.)
- [x] SmartAlerts: per-shift briefing — **done: Builder** (`20261015000000_crew_alerts.sql`: `cert_gear_items`+`base_gear_items` data-driven packing lists; `crew_alerts` feed with dedupe keys; confirm-trigger generates gear/parking/departure briefing — departure = worker_sensitive geo -> venue @ 55km/h + 20min buffer; ride-cancel alerts matched riders. Briefing card + unread badges on the crew page. Client `src/lib/crew/alerts.ts`.)
- [ ] ShiftSwap: `swap_requests`/`swap_claims`, cert-gated visibility, company approval via offer flow
- [x] Auth UX completion: check-email state post-signup, forgot-password flow, Google button behind `VITE_ENABLE_GOOGLE_AUTH` flag, error states matching design — **done: Builder, merged PR #6** (check-email view + resend w/ cooldown, `/reset-password` page, Google+Apple gated behind flags, friendly error map incl. email-not-confirmed resend, fixed `type=email` blocking username sign-in)

## P0 — ship blockers
- [x] Add `.github/workflows/ci.yml`: `npx eslint src`, `npx tsc --noEmit -p tsconfig.app.json`, `npx vitest run`, `npm run build` on every PR (free minutes). — **claimed: Mark — working on it**
- [ ] Merge #2 (waitlist funnel), retarget #4 to `main`, then land both.
- [ ] `supabase db push` to the live project; deploy edge functions (`submit-waitlist`, `verify-waitlist-email`, `resend-waitlist-verification`, `stripe-webhook` with `--no-verify-jwt`); set `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `VITE_STRIPE_PUBLISHABLE_KEY` when the Stripe account exists.

## P1 — Phase 1.2 marketplace completion
- [x] Twilio SMS on offer/application/status changes (edge function `notify-assignment`, called from service methods; needs `TWILIO_*` secrets). — **in PR #7: Builder** (`feat/notify-assignment`: edge fn resolves assignment server-side, caller must be a party, recipient+copy keyed by kind, graceful no-op without TWILIO_*; wired into applyToShift/directBook/respondToOffer/decideApplication via fire-and-forget `notifyAssignment`)
- [ ] Stripe Connect worker onboarding + real payout transfers (requires live Stripe account; `worker_sensitive.stripe_connect_account_id` is ready).
- [x] Seed/demo script: sample companies, venues, workers w/ certs, events+shifts for a click-through demo. — **done: Tom** (`supabase/seed.sql` — demo-company/demo-worker/demo-worker2 @flexzora.dev, pw `Demo1234!`; roster+public shifts, verified certs, accepted gig. Also fixed a notification-trigger FK bug blocking application writes.)
- [x] Worker availability calendar UI (blocked/available windows editor feeding `availability` rows). — **done: Tom** (`/availability` editor + worker-dashboard link; `deleteAvailability` service method)
- [x] Roster broadcast flow: send offers to trusted-roster tier first, public after N hours. — **done: Tom** (`promoteStaleRosterShifts` 24h sweep on event-page load; manual promote already existed in CandidatesPanel)

## P2 — marketplace depth
- [x] Post-shift reviews → `profiles.average_rating` / `review_count` rollup (table + approval trigger). — **done: Tom** (already shipped: `reviews` table + `update_profile_rating` insert/update/delete triggers in `20251006224050`; verified present in migrated DB)
- [x] Bulk payout run for production managers (approve-all + batch ACH). — **done: Tom** (`Approve all (ACH)` on Timesheets page: sequential approve of every submitted, clocked-out sheet with per-sheet failure reporting)
- [x] Tax export: end-of-year CSV/1099-ready earnings per worker. — **done: Tom** (worker `Export CSV` on Payouts page already shipped; added company `Contractor CSV` on Timesheets page — per-worker gross/fees/net rollup for the tax year)
- [x] Invoice PDF/email delivery to worker + company. — **done: Tom** (per-invoice PDF download on Payouts page via jspdf; email delivery still needs an email provider — not wired)
- [x] Worker portfolio import (public profile slug + share link). — **done: Tom** (`/u/<username>` public page via `get_public_profile` RPC — curated fields only, no email/phone; username field + Share button on Profile Settings)

## P3 — Phase 2 intelligence
- [x] Smart-matching analytics: fill-rate, time-to-fill, no-show rate per event. — **done: Tom** (stat cards on EventDetailPage — fill % vs headcount, avg broadcast→fill time, no-show %)
- [x] Drag-and-drop roster lanes in `RosterBuilder` (multi-lane schedule). — **done: Tom** (RosterBoard day lanes accept drop → `moveShift` keeps time-of-day, updates via `updateShift`)
- [ ] Push notifications (FCM/APNs) for clock-in reminders near call time.
- [x] Geofence auto-clock-out on fence exit + manager alert. — **done: Tom** (ClockCard watches GPS while clocked in; 90s sustained outside-fence auto clocks out, flags the timesheet `worker_notes` for the manager)

## Debt
- 21 `react-hooks/exhaustive-deps` + `react-refresh` eslint warnings — burn down ~4/PR, never silence wholesale.
- [x] `index` bundle split — **done: Tom** (route-level React.lazy in App.tsx + vendor manualChunks; index 2.2MB→303kB, no chunk >500kB)
