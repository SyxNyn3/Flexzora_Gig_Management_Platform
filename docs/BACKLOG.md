# Flexzora delivery backlog

Ordered queue for build sessions and scheduled automations. One item ≈ one session unless noted.

## Claims (lane coordination)

Two sessions work this repo in parallel. **Before starting any item, mark it**: append `(claimed: <name> — working on it)`. Check claims before picking up work; clear your claim when done (`done: <name>`) or released. Lane names: **Mark** = cloud/manager session (d713fbae), **Tom** = desktop session (89ab957d).

- Repo privacy toggle (make repo private again) — **claimed: Tom — working on it** (gh token lacks permission; asked user to flip in Settings)
- Migration duplicate-DDL cleanup (blocks clean `supabase start` from repo files) — **done: Tom** (all migrations idempotent; verified via double clean replay)
- `handle_new_user` qualified-insert + search_path fix (new migration) — **done: Tom** (20261006180000)
- `gig_messages` table + live `GigCommunication` (currently 100% mock, no table exists) — **done: Tom**
- Live-wire `UnifiedSchedule` / `ConflictDetection` / `CompanyDashboard` (still mock-only) — **done: Tom** (+ `WorkerGigList` browse list)
- Honest empty states: replace mock-number fallbacks (dashboard 15420 etc.) with real zeros — **done: Tom**
- Weekly waitlist-metrics automation — **done: Mark** (automation created, pending user approval)
- `.github/workflows/ci.yml` — **claimed: Mark — working on it**
- PR #4 review-finding sweeps — **claimed: Mark — working on it**
- Everything below is unclaimed.

## P0 — ship blockers
- [x] Add `.github/workflows/ci.yml`: `npx eslint src`, `npx tsc --noEmit -p tsconfig.app.json`, `npx vitest run`, `npm run build` on every PR (free minutes). — **claimed: Mark — working on it**
- [ ] Merge #2 (waitlist funnel), retarget #4 to `main`, then land both.
- [ ] `supabase db push` to the live project; deploy edge functions (`submit-waitlist`, `verify-waitlist-email`, `resend-waitlist-verification`, `stripe-webhook` with `--no-verify-jwt`); set `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `VITE_STRIPE_PUBLISHABLE_KEY` when the Stripe account exists.

## P1 — Phase 1.2 marketplace completion
- [ ] Twilio SMS on offer/application/status changes (edge function `notify-assignment`, called from service methods; needs `TWILIO_*` secrets).
- [ ] Stripe Connect worker onboarding + real payout transfers (requires live Stripe account; `worker_sensitive.stripe_connect_account_id` is ready).
- [ ] Seed/demo script: sample companies, venues, workers w/ certs, events+shifts for a click-through demo.
- [x] Worker availability calendar UI (blocked/available windows editor feeding `availability` rows). — **done: Tom** (`/availability` editor + worker-dashboard link; `deleteAvailability` service method)
- [x] Roster broadcast flow: send offers to trusted-roster tier first, public after N hours. — **done: Tom** (`promoteStaleRosterShifts` 24h sweep on event-page load; manual promote already existed in CandidatesPanel)

## P2 — marketplace depth
- [ ] Post-shift reviews → `profiles.average_rating` / `review_count` rollup (table + approval trigger).
- [ ] Bulk payout run for production managers (approve-all + batch ACH).
- [ ] Tax export: end-of-year CSV/1099-ready earnings per worker.
- [ ] Invoice PDF/email delivery to worker + company.
- [ ] Worker portfolio import (public profile slug + share link).

## P3 — Phase 2 intelligence
- [ ] Smart-matching analytics: fill-rate, time-to-fill, no-show rate per event.
- [ ] Drag-and-drop roster lanes in `RosterBuilder` (multi-lane schedule).
- [ ] Push notifications (FCM/APNs) for clock-in reminders near call time.
- [ ] Geofence auto-clock-out on fence exit + manager alert.

## Debt
- 21 `react-hooks/exhaustive-deps` + `react-refresh` eslint warnings — burn down ~4/PR, never silence wholesale.
- `index` bundle >500 kB — split marketplace/AI/integrations chunks via dynamic imports.
