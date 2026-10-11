# Agent Activity Log

Shared journal — every session appends: date, lane, what shipped, what's next, blockers.
Newest entries on top.
- **2026-10-11 — Lane B — Swap sweetener via payout deduction** — `feat/swap-sweetener-deduction` → PR #119. One-word-severity fix in `swap_on_offer_response`: sweeteners mint `payout_deduction` instead of `manual` — the #28 carry-over collects them from the requester's next approved timesheet once the swapped shift ends (so the claimer has worked the handoff before money moves), and `iou_transfer` pays them out. Manual IOUs untouched. pgTAP `085` — 5 asserts w/ a manual-IOU negative control.

- **2026-10-11 — Lane B — IOU beneficiary transfer (+ union-pack repair)** — `feat/iou-transfers` → PR #118. Settled cents now leave escrow: `payouts` gains `kind`/`crew_iou_id`; the #28 settle loop queues an `iou_transfer` payout per collection (beneficiary = payee) which `release-payout` sends to their Connect account unchanged — queued until onboarded, W-9 hold applies. `UNIQUE(invoice_id)` narrowed to `kind=timesheet`; one transfer per (IOU, invoice) via partial index. REPAIR: `20261111` union rewrite had silently dropped the entire partial-settlement block + regressed the weekly-OT prior query — both restored, escrow now draws gross (net + deductions). Queue shows "Crew IOU → payee"; worker Payouts labels "Crew share settled". pgTAP `084` — 7 asserts.


- **2026-10-11 — Lane B — GrubRun v2** — `feat/grubrun-v2` → PR #115. Runner handoff: `pending_runner_worker_id` + offer/accept/decline RPCs — target must be confirmed crew, committed order IOUs re-point to whoever's collecting, notifications both ways, system-managed via the guard. `min_orders`: open→ordered raises until the run clears its count (card shows n/N, button explains the shortfall). `late_fee_cents`: orderer's own post-cutoff cancel mints a flat fee IOU to the current runner + `iou` alert; runner/company cancels still void. Form gains min-orders + fee inputs. pgTAP `083` — 11 asserts across the lifecycle.

- **2026-10-11 — Lane B — pool suggestions by distance** — `feat/pool-distances` → PR #104. Rides/bunks/food only had free-text areas — nothing could say "this pickup is on your way". Optional geo pins (departure_lat/lng, geo_lat/lng, pickup_lat/lng) + `crew_pool_distances` RPC: rides rank by DETOUR (home→pickup→venue vs. driving direct — ≤3km badges "On your way"), bunks/food rank by venue distance. Board sorts pinned offers first, badges carry km, lowest-km bunk marked "Closest bunk"; "Pin this spot" geolocation button in all three forms; my_last_ride_offer returns the pin so offer-again pre-fills it. pgTAP `082` (detour math, ordering, unpinned absence, no-home-geo fallback).

- **2026-10-11 — Lane B — bail fairness** — `feat/bail-fairness` → PR #102. A rider/bunkmate could walk minutes before call and the driver/host ate the unrefillable seat — IOU voided fully. Now: `platform_policies` (bail: 24h window / 50% keep, tunable) + `bail_kept_cents` in the ride/lodging sync triggers. Voluntary exits only — driver cancels, host removes, shift/pool cascades still void fully. Kept share stays committed with an audit note; beneficiary gets an `iou` alert; the board warns "Inside the 24h bail window — $X stays committed" under Bail out/Leave before the fact. vitest `bailKeptCents` + pgTAP `081` (7 asserts: kept share, alert, seat frees, outside-window void, kicked-member void, driver-cancel void).

- **2026-10-11 — Lane B — recurring ride buddies** — `feat/ride-buddies` → PR #101. Matched ride history was write-only; now it works for the crew. New `ride_buddy` alert kind: when the second of a pair who shared a car confirms, the briefing fires a "Same car as last time?" alert to BOTH sides (first confirmer would otherwise never hear it) with correct drove-you/rode-with-you direction. `worker_ride_buddies(shift)` feeds a buddy card atop the Rides tab — rides-together count, confirmation flag, and the buddy's open offer wired to one-tap Join. `my_last_ride_offer()` hydrates the offer form so "offer seats again" is pre-filled. pgTAP `080` covers timing, direction mirroring, RPC fields, pre-fill.

- **2026-10-11 — Lane B — scheduled sweeps (pg_cron)** — `feat/scheduled-sweeps` → PR #100. Every automated sweep fired only when somebody opened a page — overnight no-shows and stale roster holds waited for a visitor. `release_stale_roster_broadcasts()` (global roster-window release) + `run_company_sweeps()` orchestrator looping `generate_unfilled_tasks`/`detect_no_shows`/`generate_company_alerts` across companies, on pg_cron job `company-sweeps` every 15 min, exec revoked from client roles. Page-load calls stay as the prompt path. pgTAP `079` (stale releases / fresh holds / orchestrator / job exists).

- **2026-10-11 — Lane B — union/local rule packs** — `feat/union-packs` → PR #99. `meal_penalty_after_hours` existed on overtime_rules but nothing consumed it — now: stretch past the trigger without a real break (>=30min) → +1h straight-time premium, itemized on the invoice. New `turnaround_min_hours` rest floor: schedule inside the gap after the worker's prior call with your company → those early hours bill at double time (reg→DT move, audit column + invoice annotation). Both penalties land in `timesheets.meal_penalty_hours`/`turnaround_penalty_hours` (system-managed via the guard) and mirror in `splitHours`/`calculateShiftPay` for the approval preview. Seeded IATSE_LOCAL_16 (9h turnaround) + IATSE_STD 8h floor; demo event runs the Local 16 pack. Vitest meal/turnaround cases + pgTAP `078` (penalty, real-break clears, turnaround reg→dt math through real approve_timesheet).

- **2026-10-11 — Lane B — "what unlocks more calls" hints** — `feat/cert-gap-hints` → PR #98. The marketplace hides cert-gated shifts entirely, so under-credentialed workers see an empty feed with no explanation. `worker_cert_gaps` mirrors the exact pool+gate rules (open/future, public-or-roster, unblocked; cert must be active+verified+unexpired at that shift's start) and returns demand count + state per credential — distinguishing missing / pending / rejected / expired / unsubmitted so the hint says the right thing. Only the self-scoped RPC is granted (parameterized form revoked — cert lifecycle is worker-private). ShiftMarketplacePage renders "Unlock more calls" above the tabs with per-state CTAs → /profile. pgTAP `077` (5 asserts: aggregation, states, past calls excluded, roster-stage gating).

- **2026-10-11 — Lane B — two-way calendar sync** — `feat/calendar-sync` → PR #97. Inbound iCal: `calendar_imports` + `availability.import_id` — synced busy events land in the same `availability` table the matcher already reads (`is_available=false` = hard conflict), so scoring changes were zero. `sync_calendar_import` RPC replaces an import's blocks atomically and keeps last-known state on failure; `ical-sync` edge function runs on the caller's JWT (RLS + RPC both enforce ownership) with a real shared parser (`_shared/ics.ts`: unfold, DTSTART/DTEND/DURATION, RRULE daily/weekly/monthly+BYDAY, 180d horizon). AvailabilityEditor got the "Sync a calendar" card + Synced badges. Vitest parser suite (8 asserts) + pgTAP `076` (7 asserts incl. conflict-checker integration).

- **2026-10-11 — Lane B #9 — annual earnings statement PDF** — `feat/earnings-pdf` → PR #96. Worker-side year-end statement next to the CSV export: `src/lib/export/earnings.ts` pure builders (per-payer rollup = the 1099 view, invoice detail rows, totals), rendered with the same jsPDF/autoTable look as contractor invoices — payer summary table, then full invoice detail, "not a 1099" footnote. Vitest `earnings.test.ts` (5 asserts on rollup/sort/format). No migration — reads through the worker's RLS.

- **2026-10-11 — Lane B #8 — dispute mediation queue** — `feat/dispute-queue` → PR #95. `status='disputed'` existed with no way out — either side could flag a sheet into a dead end. Now: `voided` status + dispute/resolution fields join the system-managed guard (no self-resolve via PostgREST), `open_timesheet_dispute` for both parties (worker's "Flag a problem" inline on ClockCard, company dispute button — each notifies the other), `resolve_timesheet_dispute` mediates: accept as submitted, adjust the clock record (server rewrites times, sheet requeues for approval), or void. Timesheets page gains a dedicated Disputes tab with evidence row + radio resolution dialog; settled tab shows the resolution audit line. pgTAP `075` (10 asserts). Seed: worker-flagged sheet on the public shift.

- **2026-10-11 — Lane B #7 — rate guidance** — `feat/rate-guidance` → PR #94. `rate_guidance` RPC percentiles cleared rates per role family × 150km market — the ShiftForm rate field now shows \"Clears $45–$60 · median $52\" with a below-market flag under P25. Aggregate-only RPC keeps cross-company rate intel anonymous. pgTAP `074` (5 asserts).

- **2026-10-11 — Lane B #2 — shift templates ("call packs")** — `feat/shift-templates` → PR #87. `shift_templates` (role + headcount + cert gates + rate + typical length, upsert by company+name). ShiftForm: pack picker prefills the whole form (typical length re-times the wrap), "save as call pack" on create. Wizard `shift_templates` target: a rate-card sheet imports as packs — the backlog's "natural partner" note made real. Seed: Arena load-in / FOH audio / Strike crew packs.

- **2026-10-11 — Lane B #1 — cert verification workflow** — `feat/cert-verification` → PR #85. The guard already blocked self-verify (`verified` was platform-review-only); the review path itself was missing so nothing could ever verify. Built it: `document_path` in a private `cert-docs` bucket (worker writes own folder; companies read only when related via roster/booking/gig — `worker_related_to_company`), `verification_status` + review fields guarded definer-only, `pending_cert_reviews`/`review_certification` RPCs (reject needs a note, worker notified), `cert_review` alert kind on the sweep (queue >48h). Worker ProfilePage got the real status badges + attach-and-submit flow (previously every cert displayed "Pending"); company gets `/cert-reviews`. pgTAP 060: self-stamp blocks, relationship gate, approve/reject/resubmit.

- **2026-10-11 — Lane B (Feature Builder)** — Claimed the recovered-PRD lane per MORNING ITINERARY. Working top-down: cert verification workflow → shift templates → auto-backfill cascade + no-show detection → standby pools → travel-time feasibility → W-9 vault → rate guidance → dispute queue → earnings PDF → remaining listed items (skipping the two "design needed" until the list clears). Works from `../flexzora-laneb` worktree off `origin/main`; feature migrations from `20261025`. No local Node — CI (lint/typecheck/vitest/build + db-tests replay) verifies per PR.


- **2026-10-11 — Challenger (deep-sweep tail: certs, timesheets, waitlist, gig_messages)** — Finished the systematic pass over every remaining unauthenticated/definer surface on main. **Filed #117 LOW** — `gig_messages` SELECT policy (and confirmations) ignores `recipients[]`, so messages "targeted" at one worker are readable by every accepted worker on the gig; fix = recipients-array filter in the worker half of both policies. **Clean-verified, no issues filed:** `certifications_verification_guard` (INSERT forces `verified=false`, verified-col edits raise, substance edits on verified certs auto-unverify — ShiftSwap cert gate has no self-service bypass); `validate_clock_event`/`approve_timesheet` (assignment-derived worker identity, geofence + clock-window, `FOR UPDATE` lock, `submitted/disputed`-only, `companies.created_by` ownership, per-worker+company advisory lock serializing weekly-OT math — double-approve and OT-cap races are dead); `waitlist_public_stats`/`waitlist_referral_status` (deliberate anon grants, curated non-PII returns); `notifications` (no INSERT policy — direct client minting impossible; the only hole remains definer `create_notification` = #113); timesheet INSERT (no client path — auto-minted by clock events only, `ON CONFLICT` per assignment). **Main is now fully swept** — all 56 migrations + P0-RT fix chain regression-verified. Open challenger issues: ~35 filed, of which Lane-A batches killed ~20; standing verified-live: #105-#117 plus residuals noted on #23/#27/#37/#45.

- **2026-10-11 — Lane B #1 — cert verification workflow** — `feat/cert-verification` → PR #85. The guard already blocked self-verify (`verified` was platform-review-only); the review path itself was missing so nothing could ever verify. Built it: `document_path` in a private `cert-docs` bucket (worker writes own folder; companies read only when related via roster/booking/gig — `worker_related_to_company`), `verification_status` + review fields guarded definer-only, `pending_cert_reviews`/`review_certification` RPCs (reject needs a note, worker notified), `cert_review` alert kind on the sweep (queue >48h). Worker ProfilePage got the real status badges + attach-and-submit flow (previously every cert displayed "Pending"); company gets `/cert-reviews`. pgTAP 060: self-stamp blocks, relationship gate, approve/reject/resubmit.

- **2026-10-11 — Lane B (Feature Builder)** — Claimed the recovered-PRD lane per MORNING ITINERARY. Working top-down: cert verification workflow → shift templates → auto-backfill cascade + no-show detection → standby pools → travel-time feasibility → W-9 vault → rate guidance → dispute queue → earnings PDF → remaining listed items (skipping the two "design needed" until the list clears). Works from `../flexzora-laneb` worktree off `origin/main`; feature migrations from `20261025`. No local Node — CI (lint/typecheck/vitest/build + db-tests replay) verifies per PR.


- **2026-10-11 — Challenger (P0-RT mid-session merge verification, cont.)** — Regression-verified the three fix PRs that landed while the Company OS sweep ran. **#86 (company consent batch, merged):** #19 consent-gated minting verified dead — `debtor_confirmed_at` stampable only by the debtor on a resolved post, mint trigger fires on consent; resolved posts freeze fulfiller/amount/direction; `workers post own` INSERT requires `debtor_confirmed_at IS NULL` so consent can't be pre-stamped. #20 dead (companies read-only on crew_iou; cancel/delete voids made definer). #23 mostly dead (terms frozen from `offered` onward). #51 dead (debtor read-only; beneficiary-only forgive, pre-settlement). **#88 (ride-match batch, merged):** #25 dead (partial unique index on active rider+shift); #26 dead (company cancel-only, offer_id immutable to them); #27 ride half dead (seats_needed frozen at match). **#91:** #21 dead (`timesheets_break_minutes_floor` CHECK NOT VALID — replay-safe, floors both worker and company-override writers). **New filing:** #116 MEDIUM — GrubRun `price_cents` rewritable on confirmed orders, minted IOU never re-syncs (display/debt divergence; closes when PR #103 merges — verified its lock + consent-mint logic on the branch). **Residual comments:** #23 — `applied→confirmed` can still carry an `offered_rate` the worker never saw (applied isn't in the frozen set); #27 — lodging `spots_needed` still editable on same-status `joined` updates (ride half only was fixed). Also verified open fix PR #103 (#52 grub price lock) — solid design, will close #52 + #116.

- **2026-10-11 — Challenger (P0-RT regression + new-surface red-team)** — Re-attacked all 10 merged P0-RT fixes on main, then swept the newly-merged Company OS stack (PRs #53-#62) and the notification/helper-grant surface. **Filed 10 issues labeled `challenger`: #105-#114.** Verification: #45/#47/#28/#22/#24/#38 confirmed dead (guard patterns solid — allowlist signup, immutable role/created_by/anchors, partial settlement with row locks, atomic payout claim + Stripe idempotency, per-role state machines). **Fix bypasses/regressions filed:** #105 (#44's `REVOKE FROM PUBLIC` also stripped service_role → `lookup-user` RPC now 500s → **username sign-in broken on main**), #106 (#49 guard covers company rows only — `DELETE` on shifts/events still cascades through assignments+timesheets), #107 (#43 froze shift cols but `events.overtime_rule_code` + `event_budgets.platform_fee_pct` still live-edit post-confirm → pay repriced). Residuals commented on #37 (pending-app satisfies participation) + #45 (`review_count` still self-editable). **New surface:** #108 send_broadcast no row lock + revertible status → double-send + replay notification spam; #109 staff `profile_id` unverified link → notify arbitrary users; #110 roster_contacts import = bulk worker-existence oracle; #113 `create_notification` PUBLIC-exec definer → spoofed notifications with attacker action_url on ANY user (highest-value new find); #114 PUBLIC-exec definer hygiene sweep (generate_shift_briefing, worker_meets_shift_certs, helpers); #111/#112 commit/sweep concurrency LOWs. Clean-passed: copilot_query (whitelist + owns_company re-checks), ICS feeds (unguessable tokens, company-filtered), staff/import/ops/alerts scoping, company_alerts dedupe.

- **2026-10-11 — Lane B #3 — auto-backfill cascade + no-show detection** — `feat/auto-backfill` → PR #89. Decline/withdraw/no-show trigger re-offers freed seats to the next-ranked roster candidate (tier → reliability → rating, cert+skill gated) — declines chain down the pool. Exhausted pool → urgent ops card + owner page. `detect_no_shows` sweep (call+15min, no clock-in, 48h window) runs on OpsBoard/EventDetail load. pgTAP `070_auto_backfill`: 12 asserts. Seed: in-progress call with a confirmed no-clock-in worker — first load demos the whole loop.

- **2026-10-11 — Lane B #2 — shift templates ("call packs")** — `feat/shift-templates` → PR #87. `shift_templates` (role + headcount + cert gates + rate + typical length, upsert by company+name). ShiftForm: pack picker prefills the whole form (typical length re-times the wrap), "save as call pack" on create. Wizard `shift_templates` target: a rate-card sheet imports as packs — the backlog's "natural partner" note made real. Seed: Arena load-in / FOH audio / Strike crew packs.

- **2026-10-11 — Lane B #1 — cert verification workflow** — `feat/cert-verification` → PR #85. The guard already blocked self-verify (`verified` was platform-review-only); the review path itself was missing so nothing could ever verify. Built it: `document_path` in a private `cert-docs` bucket (worker writes own folder; companies read only when related via roster/booking/gig — `worker_related_to_company`), `verification_status` + review fields guarded definer-only, `pending_cert_reviews`/`review_certification` RPCs (reject needs a note, worker notified), `cert_review` alert kind on the sweep (queue >48h). Worker ProfilePage got the real status badges + attach-and-submit flow (previously every cert displayed "Pending"); company gets `/cert-reviews`. pgTAP 060: self-stamp blocks, relationship gate, approve/reject/resubmit.

- **2026-10-11 — Lane B (Feature Builder)** — Claimed the recovered-PRD lane per MORNING ITINERARY. Working top-down: cert verification workflow → shift templates → auto-backfill cascade + no-show detection → standby pools → travel-time feasibility → W-9 vault → rate guidance → dispute queue → earnings PDF → remaining listed items (skipping the two "design needed" until the list clears). Works from `../flexzora-laneb` worktree off `origin/main`; feature migrations from `20261025`. No local Node — CI (lint/typecheck/vitest/build + db-tests replay) verifies per PR.
- **2026-10-11 — Security core (paid-quota window — P0-RT top of queue)** — Landed the entire ordered fix list. **#45 CRITICAL (PR #76, merged):** `handle_new_user` allowlists metadata (role='admin' self-claim coerced to worker), profiles UPDATE guard denies role changes by API role, companies.created_by non-transferable, +9-test pgTAP (`045_role_escalation.test.sql`) and a new `db-tests` CI job (migration replay + `supabase test db`). **#28 (PR #77, merged):** settle loop redesigned to partial settlement — `settled_cents` + `crew_iou_settlements` ledger, min(outstanding, remaining-cap) per IOU, carry-over from earlier ended shifts, per-collection invoice lines; TS mirror + pgTAP. **Held-PR blockers pushed to the SAME PRs:** #22 on feat/shift-swap — swap_requests/claims anchors immutable, sweetener locked once claims exist (`36982cc` + pgTAP 022); #24/#47 on feat/stripe-connect — `claim_payout_for_release()` atomic claim + Stripe idempotencyKey + stale-processing transfer lookup, Connect fields server-owned (`74e77c8` + pgTAP 047, `01dec7d`). **HIGH batch (PR #78, merged):** #49 company-with-history delete blocked; #43 shift terms freeze post-confirmation (headcount ≥ confirmed); #38 gig_applications state machine (worker: pending→withdrawn only; owner: pending→accepted/rejected); #37 reviews require real shared gig + distinct parties; #44 `lookup_user_by_username_or_email` revoked (incl. PUBLIC). Exposed + fixed along the way: migration replay blockers (orphan `follows` RLS, waitlist enum same-tx, PostGIS ownership, duplicated `LANGUAGE plpgsql`, stray INSERT), invoker calendar-sync triggers dead-on-RLS now SECURITY DEFINER. Main merged into both held branches; CI re-running — merge gate: green checks + db-tests.
- **2026-10-11 — Reviewer (cycle 4 — P0-RT queue completed)** — Reviewed #72 (docs: P0-RT red-team sweep + recovered PRD ideas + ops rule 9); found the queue covered only the second challenger sweep. Audited the excluded first-sweep range #19–#33 **against current main**: 10 verified live (#19, #20, #21, #23, #25, #26, #27, #29, #30, #31, #33) — incl. company-side `crew_iou` rewrite with no column immutability, `offered_rate` mutable on the company guard branch, ride-request force-match/duplicate-match/seat-editing, and the "Ride cancelled" alert confirmed dead code (BEFORE cascade runs before the AFTER alert trigger). #28 verified worse than filed (settle loop `EXIT`s on first over-cap IOU — whole queue deadlocks, no partial settle). Merged #72 (net-positive), filed #73, landed #74 completing the queue — all 33 open challenger findings now claimable P0-RT items, each verified. Deploy verified end-to-end earlier this cycle: https://syxnyn3.github.io/flexzora-live/ serves the real build. Queue: still only #15 (held #22) and #16 (held #24 + #47) — no fix commits.

- **2026-10-11 — Reviewer (cycle 3 — demo deploy is LIVE)** — Extracted the flexzora-live publish path out of held feat/stripe-connect (`27436f6`) into **PR #70, merged**: `deploy-pages.yml` now builds with `VITE_BASE_PATH=/flexzora-live/` and force-pushes `dist/` to the public `SyxNyn3/flexzora-live` `gh-pages` branch via `PAGES_DEPLOY_TOKEN` (artifacts only — no source); `vite.config.ts` `base` driven by `VITE_BASE_PATH` pairing with the existing `Router basename`. Verified end-to-end: deploy run 38109468283 success, artifact commit on flexzora-live gh-pages, Pages serving at **https://syxnyn3.github.io/flexzora-live/** — supersedes the cycle-2 addendum's "nothing publicly deployed" (that verdict was correct pre-#70; the plan-blocker applied only to the source-repo Pages path). #68 closed with resolution comment; #67 lockfile regen still open. Held queue unchanged: #15 (#22 repoint), #16 (#24 TOCTOU + #47) — no fix commits yet.

---
- **2026-10-11 — Reviewer (cycle-2 addendum — deploy root cause)** — The Pages failures were NOT a transient flake; peeled the real chain: (1) deploy workflow `permissions` lacked `contents:read` → checkout "Repository not found" (fixed #65); (2) `npm ci` hard-fails — `package.json` lists pdfjs-dist/read-excel-file/@napi-rs/canvas with no lockfile entry (no lane has local npm to regenerate — issue #67; deploy switched to `npm install` in #66); (3) **Pages is unreachable on this repo: POST /pages → 422 "plan does not support GitHub Pages" — private repo + free plan.** Nothing merged tonight is publicly deployed; the build itself is green. User decision needed: make repo public, upgrade plan, or retarget deploy to Cloudflare Pages/Vercel/Netlify — issue #68.

- **2026-10-11 — Reviewer (overnight PR gate, cycle 2)** — **Company OS stack fully landed: #53 import-wizard, #55 copilot, #56 staff, #58 broadcast, #59 ics-timezone, #60 ops-kanban, #61 tour-exports, #62 company-alerts all MERGED.** Reviewed every full diff (RLS/auth, migration additivity, tests, UI bar); posted verdict comments on each PR. **Security fix applied to unblock the critical path (#63, closed):** worker-scope ICS feeds filtered only on `worker_id` — a company-minted token exposed that worker's confirmed calls at ALL companies; edge fn now skips assignments outside the feed's company (bbe6e1f). Other unblockers: copilot intent regexes match plurals, Supabase embed casts normalize object-or-array shape (FeedManager + export service), export tests stub the client for env-free CI, dropped `};`/`}` restored in types.ts, misnumbered-sed damage rebuilt in ops-kanban App/Navbar, ActionCard/Navbar keep-both duplication deduped. **Deploy flake:** Pages deploy intermittently fails at checkout (`Repository not found`) — transient; CI green on same SHAs. **PR queue: only #15 (held, #22 repoint) and #16 (held, #24 TOCTOU + #47).** Live-on-main risks still open: #19 (IOU mint without consent), #29 (kind not status-gated), #52 (GrubRun price inflation).

- **2026-10-10 — Builder-2 (Company OS lane)** — Lane claimed in BACKLOG; Company OS sprint section added (it only existed on the Crew OS stack before). Wrote the two docs the backlog referenced: `docs/OVERNIGHT_OPS.md` conventions appendix (lane loop, repo conventions) and `docs/VISION_COMPANY_OS.md` (Dana persona, competitor findings, per-feature spec with branch names + schemas, quality bar, non-goals). Works from `../flexzora-builder2` worktree; Company OS migrations start at `20261018` (`20261017` taken by Connect-payouts WIP). No local Node/Deno — CI verifies per PR.

- **2026-10-10 — Reviewer (overnight PR gate, cycle 1)** — Lane claimed (PR #36). Setup: portable gh 2.102.0 in `$TEMP` authed via git credential manager; `../flexzora-reviewer-wt` worktree keeps the Builder's checkout untouched. **Merged #5** (ops docs + Pages base + migration replay fixes), **#6** auth-ux, **#7** notify-assignment, **#8** crew_iou, **#9** CrewPool rides, **#10** BunkUp lodging, **#12** GrubRun, **#13** crew board UI, **#14** SmartAlerts. Retargeted the whole stack to main after #8's base-branch deletion cascade; resolved 3 doc-conflict merges preserving both lanes' claims/marks. **HELD #11** (Challenger #19 verified: offer-direction resolve mints payout-deduction IOU on non-consenting worker — countersign or manual-settle fix needed), **HELD #15** (#22 verified + worse: `swap_requests` non-status columns mutable → repoint `assignment_id` withdraws a VICTIM's confirmed booking; lock columns + freeze sweetener post-accept), **HELD #16** (#24 verified: no atomic claim/idempotency on `transfers.create` → double-pay; fix = processing-status claim + `idempotencyKey: payout.id`; also #47 `worker_sensitive` self-write on the columns it trusts). Filed **#52** (reviewer-labeled): GrubRun runner sets price unilaterally at confirm — inflation vector on orderer's payout. Verified #48 in #14's merge comment. Awaiting Builder fix commits; then re-review.

### feat/company-alerts → PR #62 — automatic reminders inbox

- company_alerts + generate_company_alerts: idempotent sweep that opens
  alerts for live conditions, escalates severity as deadlines near, and
  auto-resolves conditions that cleared — the inbox mirrors reality like
  the ops board.
- Signal kinds: unfilled_call (warning → urgent inside 48h), cert_expiring
  (booked crew's cert lapses ≤30d; ≤7d urgent, deduped per cert×shift),
  timesheet_pending (submitted >48h), shift_tomorrow (locked call <24h).
- Dedupe via (company_id, dedupe_key) — re-sweeps never double-open, and
  dismissed alerts stay dismissed.
- /alerts inbox: severity-ordered cards, kind + severity badges, event
  links, open/resolved/dismissed tabs, "rescan" runs the sweep on demand.
- Seed: one resolved timesheet alert for the audit trail; live alerts
  self-generate. Verification: CI.

### feat/tour-exports → PR #61 — tour exports

- /exports: date range + section checkboxes (crew list / schedule / staff
  sheet), live preview counts, CSV + PDF downloads.
- Crew list collapses the same worker across calls — contacts, distinct
  roles, events, call count. Schedule emits one row per call with booked
  names flattened in and "(unfilled)" flagged; staff sheet lists internal
  team assignments.
- No migration/RLS needed: reads through the caller's own session.
- toCsv: RFC-4180 escaping + UTF-8 BOM for Excel. buildPdf:
  dependency-free multi-page Helvetica writer (title + page-number
  footers) — real .pdf file, not print dialog.
- Tests: row builders + CSV escaping (vitest). Verification: CI.

### feat/ops-kanban → PR #60 — ops board

- ops_tasks + generate_unfilled_tasks: idempotent sweep on board load —
  one urgent card per short-staffed call (14d window, due 12h pre-call),
  auto-completes cards whose call filled. The board mirrors reality.
- /ops: 3-column HTML5 drag-drop, priority/assignee/due/event links,
  auto badge, overdue highlight, done strikethrough.
- Seed: manual in-flight + done task; unfilled cards self-generate.

### feat/ics-timezone → PR #59 — calendar feeds + timezones

- calendar_feeds: capability URLs (unguessable token, scoped
  company/event/staff/worker, revocable, last_accessed tracked).
- ics-feed edge fn (verify_jwt=false — token is the auth): real
  VCALENDAR — events all-day across dates, timed calls/assignments in
  UTC with the event's IANA zone named in each DESCRIPTION.
- events.timezone + create-form picker + header display.
- FeedManager on /events: create scoped feeds, copy URL, revoke,
  last-fetch marker. Seed: company + PM feeds.

### feat/broadcast → PR #58 — broadcast messaging

- broadcasts + broadcast_recipients (per-person channel/status delivery
  log, deduped per broadcast+channel+person).
- resolve_broadcast_audience is the single resolver: compose previews
  with the same definer function send_broadcast executes.
- Delivery today: workers + account-linked staff → in-app notification;
  accountless staff → 'email' recipient rows queued for transports.
- /broadcast composer (audience/event/call pickers, staff toggle, live
  preview with names) + expandable history. Copilot draft → composer
  deep-link.

### feat/staff-layer → PR #56 — staff_members / staff_assignments

- Internal team (PMs, coordinators, crew leads) distinct from marketplace
  crew — no Flexzora worker account required; profile_id link reserved.
- staff_assignments: staff × event with role label, call time,
  assigned/confirmed/declined. Unique per (staff, event, role).
- /staff roster page (add/edit/active toggle); event detail gains a
  "Staff on this event" panel — one screen shows everybody working.
- Import 'staff' target live: commit_import_job upserts by email, so
  re-imported staff sheets update instead of duplicating.
- Seed: 3 staff members, 2 assigned to the demo event.

### feat/company-copilot → PR #55 — Company Copilot

- `company_docs` + `copilot_messages` + `copilot_query`: whitelisted
  SECURITY DEFINER read catalog (unfilled_calls, upcoming_events,
  cert_expiring, timesheets_pending, budget_status, crew_for_shift) that
  re-verifies owns_company and rejects unknown kinds.
- Intent routing: pure regex router (vitest-covered) answers instantly;
  OmniRoute LLM only disambiguates failures and only returns a catalog
  kind + ids resolved from context — the model never sees the database.
- Every action is a preview card: "remember that…" confirms into
  company_docs; "text the crew…" renders a broadcast draft (copy-out
  until the broadcast lane lands). Rows snapshot onto the message row.
- Flag-gated (VITE_ENABLE_COPILOT): nav item + /copilot route redirect.
- Shared OmniRoute client extracted to src/lib/llm.ts; import wizard
  refactored onto it. Seed: 3 demo company docs.

### feat/import-wizard → PR #53 — AI Upload Wizard
- **2026-10-11 — Builder-2 (Company OS lane)** — **PR #60 `feat/ops-kanban`: ops board.** ops_tasks — manual tasks + generated urgent cards for short-staffed calls. generate_unfilled_tasks() is idempotent both ways: creates one card per unfilled call (no open card already) and auto-completes cards whose call filled/cancelled/completed. owns_company FOR ALL; /ops board page.
- **2026-10-11 — Builder-2 (Company OS lane)** — **PR #59 `feat/ics-timezone`: calendar feeds + event timezones.** events.timezone (IANA wall-clock zone); shifts keep absolute timestamptz, ICS emits UTC instants with the zone named in description. calendar_feeds capability URLs — unguessable uuid token is the auth (verify_jwt=false; calendar clients cant hold JWTs), scoped company/event/staff/worker, revocable via is_active, service-role read-only. FeedManager UI + timezone picker on events.
- **2026-10-11 — Builder-2 (Company OS lane)** — **PR #58 `feat/broadcast`: broadcast messaging.** broadcasts + broadcast_recipients; one message to a resolved audience — a call's crew, an event's crew+staff, or the whole roster. resolve_broadcast_audience is the single source of truth (compose preview and send_broadcast share it); send_broadcast writes recipients server-side + in-app notifies. Accountless staff → 'email' recipient rows queued honestly until transports land. Dedupe unique index + ON CONFLICT for idempotency.
- **2026-10-11 — Builder-2 (Company OS lane)** — **PR #56 `feat/staff-layer`: staff_members / staff_assignments.** Internal team (PMs, coordinators, crew leads) distinct from marketplace crew — no Flexzora worker account required; profile_id link reserved. staff_assignments: staff × event with role label, call time, assigned/confirmed/declined; unique per (staff, event, role). /staff roster page (add/edit/active toggle); event detail gains a "Staff on this event" panel — one screen shows everybody working. Import "staff" target live: commit_import_job upserts by email so re-imports update instead of duplicating. Seed: 3 staff members, 2 on the demo event.
- **2026-10-11 — Builder-2 (Company OS lane)** — **PR #55 `feat/company-copilot`: Company Copilot.** `company_docs` + `copilot_messages` + `copilot_query` whitelisted SECURITY DEFINER read catalog (unfilled_calls, upcoming_events, cert_expiring, timesheets_pending, budget_status, crew_for_shift) re-verifying owns_company and rejecting unknown kinds. Intent routing: pure regex router (vitest-covered) answers instantly; OmniRoute LLM only disambiguates failures and returns catalog kind + ids resolved from context — model never sees the DB. Actions render as preview cards (save-doc → company_docs; broadcast draft copies out). Flag `VITE_ENABLE_COPILOT` gates nav + /copilot. Shared OmniRoute client extracted to src/lib/llm.ts. Seed: 3 demo company docs.
- **2026-10-11 — Builder-2 (Company OS lane)** — **PR #53 `feat/import-wizard`: AI Upload Wizard.** `import_jobs`/`import_rows` + `commit_import_job` SECURITY DEFINER RPC (walks ready/warning rows, per-row exception capture, re-runnable). Targets via client registry (fields/aliases/sniffers): venues, shifts into a chosen event (live events → roster wave, mirrors createShift), roster contacts matched by email/username; `staff` enum reserved. Parse: hand-rolled CSV (quotes/multiline/delimiter sniff), read-excel-file for XLSX, pdfjs-dist positional-text→table extraction for PDF call sheets — both dynamic-imported in the lazy /import chunk. Map: OmniRoute LLM (`VITE_OMNIROUTE_URL`, 8s timeout) merged over a heuristic scorer (alias/substring/value-sniff); user edits always win. Review: one grid — inline edits, status pills, filters, include toggles, failed-rows CSV export, job history reopen. Schema fix along the way: venues.lat/lng nullable; `validate_clock_event` NULL-geo hole closed (was verifying punches with no GPS check). Seed: demo job in history (1 imported, 1 fixable error row). Verification: CI (no local Node/Deno).

- **2026-10-10 — Challenger (overnight red-team, cycle 2)** — Regression pass on mainline flows + edge-function auth surface; **filed 16 more issues labeled `challenger`: #37-#51 + #54.** Highlights: **#45 CRITICAL** — `handle_new_user` honors `raw_user_meta_data->>'role'` AND profiles UPDATE has no WITH CHECK, so any user self-assigns `role='admin'/'company'`; 'company' un-scoped `companies` FOR-ALL policy lets them rewrite `created_by` → `owns_company()` → full takeover (escrow, timesheets, payouts). **#44** anon-callable `lookup_user_by_username_or_email` accepts emails → enumeration oracle bypassing the edge guard. **#47** `worker_sensitive` self-FOR-ALL lets workers set `stripe_connect_account_id`/`payouts_enabled` → payout redirection (release-payout trusts DB not Stripe). **#43** company can edit `hourly_rate`/headcount on live shifts — pay repriced post-booking. **#48** `crew_alerts.dedupe_key` globally unique + self-insertable → alert suppression on other workers. **#49** company can DELETE shifts/events — cascades wipe assignments+timesheets, bypass cancel-alerts + IOU voiding. **#50** `worker_distances`/`worker_conflicts` any-caller → worker location triangulation + availability oracle. **#51** debtor can void own committed IOU (incl. auto-minted) — debt erasure sans creditor consent. **#54** confirmed→withdrawn allowed right up to call time — no late-cancel flag or reliability hit. **#37** reviews: self-review/review-bomb (no gig-participant check). **#38** worker can flip own `gig_applications` status. Also verified-not-broken: cert gate on swap claims (`verified AND active AND unexpired`), escrow write-lock, timesheet guards, `send-push` secret gate, `connect-*` self-verification. **Regression note:** #34 verified FIXED on main post-PR #6 (origin-scoped redirectTo); #29 still live post-PR #7 merge. Supplements added as comments on #19/#22.

- **2026-10-10 — Challenger (overnight red-team)** — Lane claimed in BACKLOG. Cycle 1: reviewed origin/main + stacked Crew OS branches (PRs #6-#16), migrations `20261010000000`-`20261017000000`, edge functions (`release-payout`, `connect-*`, `notify-assignment`), auth-ux. **Filed 17 issues labeled `challenger`: #19-#35.** Highlights: #19 CRITICAL CrewBoard resolve mints payout-deduction IOUs on any worker without consent; #20 company can repoint IOU beneficiary/amount; #21 negative `break_minutes` inflates approved gross; #22 swap `shift_id` repoint bypasses cert gate; #23 company can rewrite `offered_rate` post-confirm; #24 `release-payout` TOCTOU double Stripe transfer; #25 duplicate matched ride_requests → dup seats + dup IOUs. No local Supabase/Node on this machine — findings verified by static trace of triggers/RLS/policies; GitHub REST used for issues (no gh CLI; MCP GitHub server unreachable). Next: regression-hunt mainline flows (waitlist, checkout/payment intents, gig legacy paths), re-check issue fixes as PRs land.

- **2026-10-10 — Builder (overnight)** — Lane claimed. Constraint: **no Node/npm on this machine** — `build`/`lint`/`test` can't run locally; verification is static review + CI. Local `main` pushed to origin (security + demo-request commits now published). Priority per charter: P0 → P1 → auth/signup UX → PRD gaps. `supabase db push`/edge-deploy + Stripe/Twilio/Resend keys are user-credential blockers — logged, not waiting.
  - PR #5 (`chore/ops-docs-and-wip`): tracked ops docs + VISION specs, committed pending deploy fixes (Pages base path, .env.local ignore, migration quoting), deleted stray `00`/`01`, marked stale P0 merge item (PRs #2/#4 already landed).
  - PR #6 (`feat/auth-ux`): check-email state post-signup w/ 60s resend cooldown, forgot-password flow + new `/reset-password` page, OAuth buttons behind `VITE_ENABLE_GOOGLE_AUTH`/`VITE_ENABLE_APPLE_AUTH` (both default off — providers not configured), friendly error copy incl. resend-verification on email-not-confirmed, fixed `type=email` bug blocking username sign-in, added `.env.example` + typed flags in `vite-env.d.ts`. Note: signup `?mode=signup` deep-link preserved; recovery page intentionally outside `PublicRoute`.

- **2026-10-09 — Setup (user session)** — Created `OVERNIGHT_OPS.md` charter + this log. Local `main` is 2 commits ahead of origin (security pass) — needs a push. OneDrive intermittently locks `.git` files; retry on failure.
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

## Lane A — Security Builder — single: #21 break_minutes floor

- Branch `fix/lane-a-break-minutes`. Migration `20261105000000_p0rt_break_minutes_floor.sql`:
  `CHECK (break_minutes >= 0) NOT VALID` on `timesheets`. A row CHECK covers every
  writer (worker edits and the company override in `approve_timesheet`).
  `NOT VALID` means existing rows aren't scanned, so `db push` can't be blocked by
  legacy data. A legacy negative row fails its next approval loudly.
- Test: pgTAP `021_break_minutes_floor` (3 assertions).
- Deeper item noted, not built: a break longer than the clock span can still make
  hours negative. A row CHECK against the clock span would close it, but needs a
  data-quality pass first (see #35 temporal validation).
## Lane A — Security Builder — P0-RT company-side consent batch (#19, #20, #23, #51)

- Branch `fix/lane-a-company-consent` (claim: PR #83 `chore/lane-a-claim`).
- Migration `20261103000000_p0rt_company_consent.sql` — one idempotent file:
  - **#19** `crew_posts.debtor_confirmed_at`. Minting moved out of the
    resolve trigger into an AFTER-UPDATE mint that fires only once the
    *debtor* has consented: the author when resolving a `want` (author owes),
    the fulfiller accepting an `offer`. Resolved posts can no longer change
    fulfiller or amount; a post cannot be fulfilled by its own author; a paid
    post must name a fulfiller before it resolves.
  - **#20** `guard_crew_iou_update`: companies are read-only on shift-anchored
    IOUs. Every legitimate write is definer (shift-cancel void, approve_timesheet
    settlement) and is exempt via `current_user`.
  - **#51** the debtor cannot change an IOU at all. The beneficiary can forgive
    (void) only while `settled_cents = 0`.
  - **#23** `guard_assignment_update`: `offered_rate`, `match_score`,
    `match_breakdown` are frozen from offered/confirmed/completed/no_show.
    Re-offering a declined/withdrawn row may set a new rate.
- Tests (pgTAP, run by the `db-tests` CI job): `019_board_consent`,
  `020_crew_iou_company_readonly`, `023_offer_terms_frozen`,
  `051_debtor_cannot_void`. 15 + 6 + 6 + 7 assertions; plans verified.
- Local verification (Node 24, same commands as CI): `tsc` clean except
  `pdfjs-dist` / `read-excel-file`, which are declared in package.json but
  absent from this machine's stale node_modules (installed `--no-save`, no
  manifest/lockfile change). `eslint src`: 0 errors / 17 pre-existing warnings.
  `vitest run`: 97/97. `vite build`: green. **pgTAP not run locally** — no
  Postgres/Supabase CLI on this machine; it is the verification gate in CI.

Judgment calls / things a reviewer should check:

- Grandfathered rows: offer-direction posts already resolved before this fix
  keep their minted IOUs (backfill stamps consent on any resolved post that
  already has one). These were minted without consent; they need a human review,
  not an automatic unwind.
- Bail/cancel voids (ride withdraw, lodging leave, food cancel, shift cancel)
  still void through definer cascades. That is the explicit seat/booking release,
  not a debtor bypass. The debtor's direct table write is what is now closed.
- `voidIou()` in `src/lib/crew/iou.ts` is exported but unused in the UI; it now
  fails for debtors as intended. Left in place; a beneficiary-only forgive
  helper can replace it when the UI needs one.
- New UI: the fulfiller sees "You owe $X — Accept" on unaccepted offer posts;
  the author sees "Waiting for <fulfiller> to accept".

Next in Lane A: ride-match MED batch (#25 unique rider/shift, #26 company
can't force-match, #27 seats_needed frozen after match).

- Addendum (CI found it): `void_ious_on_shift_cancel` / `_delete` were
  SECURITY INVOKER (my own PR #8 code). They only worked because companies
  were exempt from the IOU guard. The migration now makes them SECURITY DEFINER
  with a pinned search_path, so companies can be fully read-only. Audit of all
  other `crew_iou` writers: ride/lodging/food/swap cascades and approve_timesheet
  are already definer. Also fixed enum literal casts in the new pgTAP fixtures
  (INSERT ... SELECT needs explicit enum casts).
## Lane A — Security Builder — ride-match MED batch (#25, #26, #27)

- Branch `fix/lane-a-ride-match`.
- Migration `20261104000000_p0rt_ride_match.sql`:
  - **#25** partial unique index on active `(rider_worker_id, shift_id)` rows
    (`status IN ('open','matched')`). Closed requests don't count, so rejoining
    after a bail still works. Race-free, unlike a trigger.
  - **#26** `guard_ride_request_update`: the company may only move a request to
    `cancelled` and may not change its offer. Matching stays rider-consented.
  - **#27** `seats_needed` frozen once a request is `matched`.
- Tests: pgTAP `025_ride_one_active_per_shift` (5), `026_ride_company_cancel_only`
  (4), `027_ride_seats_frozen_when_matched` (3). Casts on every enum literal
  from the start (lesson from the #19 batch CI run).
- Migration-time caveat: if production already has two active requests from one
  rider on one shift, the index creation fails loudly. Resolving that means
  withdrawing the extra row, which is a human decision, so the migration does not
  do it.
- Left for later in Lane A: #30 (booking check on ride_requests inserts) is a
  separate single in the itinerary, not this batch.
- Addendum (CI found it): `check_ride_match` is SECURITY INVOKER, so it reads
  the offer through RLS. The 025/027 fixtures used a draft event and a
  non-broadcast shift, so the rider could not see the offer and the check failed
  with "Ride offer not found" before reaching the intended error. Fixed the
  fixtures (`published` event, `broadcast_stage='public'`). The product behaviour
  is intended: a rider can only touch an offer on a call they can see (fail
  closed). Lesson recorded for future pgTAP fixtures: model visibility
  (event status, broadcast stage) explicitly.
## Lane A — Security Builder — #52 GrubRun price lock

- Branch `fix/lane-a-grub-price`. Migration `20261106000000_p0rt_grub_price_lock.sql`:
  - A confirmed order's price and item are locked. Only a runner/company
    cancellation can change it afterwards.
  - Confirmed prices up to `food_auto_accept_cap_cents()` ($25) are consented
    at confirmation. Above it the orderer must accept (`price_accepted_at`), same
    pattern as #19. Only the orderer can set it; the runner cannot.
  - The debt mints when consent lands, not when the runner confirms.
  - Backfill grandfathers already-minted confirmed orders.
- UI: the orderer sees "Runner says $X — Accept" on unaccepted confirmed orders.
- Test: pgTAP `052_grub_price_lock` (8 assertions).
- Deeper item (BACKLOG): per-menu quotes so the threshold is relative to the menu
  price, not one flat $25 cap.

