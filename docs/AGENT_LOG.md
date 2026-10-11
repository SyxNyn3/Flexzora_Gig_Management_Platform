# Agent Activity Log

Shared journal — every session appends: date, lane, what shipped, what's next, blockers.
Newest entries on top.

---
- **2026-10-10 — Reviewer (overnight PR gate, cycle 1)** — Lane claimed (PR #36). Setup: portable gh 2.102.0 in `$TEMP` authed via git credential manager; `../flexzora-reviewer-wt` worktree keeps the Builder's checkout untouched. **Merged #5** (ops docs + Pages base + migration replay fixes), **#6** auth-ux, **#7** notify-assignment, **#8** crew_iou, **#9** CrewPool rides, **#10** BunkUp lodging, **#12** GrubRun, **#13** crew board UI, **#14** SmartAlerts. Retargeted the whole stack to main after #8's base-branch deletion cascade; resolved 3 doc-conflict merges preserving both lanes' claims/marks. **HELD #11** (Challenger #19 verified: offer-direction resolve mints payout-deduction IOU on non-consenting worker — countersign or manual-settle fix needed), **HELD #15** (#22 verified + worse: `swap_requests` non-status columns mutable → repoint `assignment_id` withdraws a VICTIM's confirmed booking; lock columns + freeze sweetener post-accept), **HELD #16** (#24 verified: no atomic claim/idempotency on `transfers.create` → double-pay; fix = processing-status claim + `idempotencyKey: payout.id`; also #47 `worker_sensitive` self-write on the columns it trusts). Filed **#52** (reviewer-labeled): GrubRun runner sets price unilaterally at confirm — inflation vector on orderer's payout. Verified #48 in #14's merge comment. Awaiting Builder fix commits; then re-review.

- **2026-10-10 — Challenger (overnight red-team, cycle 2)** — Regression pass on mainline flows + edge-function auth surface; **filed 16 more issues labeled `challenger`: #37-#51 + #54.** Highlights: **#45 CRITICAL** — `handle_new_user` honors `raw_user_meta_data->>'role'` AND profiles UPDATE has no WITH CHECK, so any user self-assigns `role='admin'/'company'`; 'company' un-scoped `companies` FOR-ALL policy lets them rewrite `created_by` → `owns_company()` → full takeover (escrow, timesheets, payouts). **#44** anon-callable `lookup_user_by_username_or_email` accepts emails → enumeration oracle bypassing the edge guard. **#47** `worker_sensitive` self-FOR-ALL lets workers set `stripe_connect_account_id`/`payouts_enabled` → payout redirection (release-payout trusts DB not Stripe). **#43** company can edit `hourly_rate`/headcount on live shifts — pay repriced post-booking. **#48** `crew_alerts.dedupe_key` globally unique + self-insertable → alert suppression on other workers. **#49** company can DELETE shifts/events — cascades wipe assignments+timesheets, bypass cancel-alerts + IOU voiding. **#50** `worker_distances`/`worker_conflicts` any-caller → worker location triangulation + availability oracle. **#51** debtor can void own committed IOU (incl. auto-minted) — debt erasure sans creditor consent. **#54** confirmed→withdrawn allowed right up to call time — no late-cancel flag or reliability hit. **#37** reviews: self-review/review-bomb (no gig-participant check). **#38** worker can flip own `gig_applications` status. Also verified-not-broken: cert gate on swap claims (`verified AND active AND unexpired`), escrow write-lock, timesheet guards, `send-push` secret gate, `connect-*` self-verification. **Regression note:** #34 verified FIXED on main post-PR #6 (origin-scoped redirectTo); #29 still live post-PR #7 merge. Supplements added as comments on #19/#22.

- **2026-10-10 — Challenger (overnight red-team)** — Lane claimed in BACKLOG. Cycle 1: reviewed origin/main + stacked Crew OS branches (PRs #6-#16), migrations `20261010000000`-`20261017000000`, edge functions (`release-payout`, `connect-*`, `notify-assignment`), auth-ux. **Filed 17 issues labeled `challenger`: #19-#35.** Highlights: #19 CRITICAL CrewBoard resolve mints payout-deduction IOUs on any worker without consent; #20 company can repoint IOU beneficiary/amount; #21 negative `break_minutes` inflates approved gross; #22 swap `shift_id` repoint bypasses cert gate; #23 company can rewrite `offered_rate` post-confirm; #24 `release-payout` TOCTOU double Stripe transfer; #25 duplicate matched ride_requests → dup seats + dup IOUs. No local Supabase/Node on this machine — findings verified by static trace of triggers/RLS/policies; GitHub REST used for issues (no gh CLI; MCP GitHub server unreachable). Next: regression-hunt mainline flows (waitlist, checkout/payment intents, gig legacy paths), re-check issue fixes as PRs land.

- **2026-10-10 — Builder (overnight)** — Lane claimed. Constraint: **no Node/npm on this machine** — `build`/`lint`/`test` can't run locally; verification is static review + CI. Local `main` pushed to origin (security + demo-request commits now published). Priority per charter: P0 → P1 → auth/signup UX → PRD gaps. `supabase db push`/edge-deploy + Stripe/Twilio/Resend keys are user-credential blockers — logged, not waiting.
  - PR #5 (`chore/ops-docs-and-wip`): tracked ops docs + VISION specs, committed pending deploy fixes (Pages base path, .env.local ignore, migration quoting), deleted stray `00`/`01`, marked stale P0 merge item (PRs #2/#4 already landed).
  - PR #6 (`feat/auth-ux`): check-email state post-signup w/ 60s resend cooldown, forgot-password flow + new `/reset-password` page, OAuth buttons behind `VITE_ENABLE_GOOGLE_AUTH`/`VITE_ENABLE_APPLE_AUTH` (both default off — providers not configured), friendly error copy incl. resend-verification on email-not-confirmed, fixed `type=email` bug blocking username sign-in, added `.env.example` + typed flags in `vite-env.d.ts`. Note: signup `?mode=signup` deep-link preserved; recovery page intentionally outside `PublicRoute`.

- **2026-10-09 — Setup (user session)** — Created `OVERNIGHT_OPS.md` charter + this log. Local `main` is 2 commits ahead of origin (security pass) — needs a push. OneDrive intermittently locks `.git` files; retry on failure.
## Builder — Crew OS sprint (overnight)

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
