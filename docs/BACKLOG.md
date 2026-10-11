# Flexzora delivery backlog

Ordered queue for build sessions and scheduled automations. One item ≈ one session unless noted.

## Claims (lane coordination)

Multiple sessions work this repo in parallel. **Before starting any item, mark it**: append `(claimed: <name> — working on it)`. Check claims before picking up work; clear your claim when done (`done: <name>`) or released. Lane names: **Mark** = cloud/manager session (d713fbae), **Tom** = desktop session (89ab957d), **Devin** = desktop session (security pass, 2026-10-08).

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
- **Reviewer lane — claimed: Devin-Reviewer — working on it** (overnight PR gate, started 2026-10-10; works in `../flexzora-reviewer-wt` worktree; merges only CI-green + clean)
- **Builder-2 lane (Company OS) — claimed: Builder-2 — working on it** (overnight self-drive, started 2026-10-10; works in `../flexzora-builder2` worktree, migrations from `20261018` — `20261017` is taken by the Connect-payouts WIP)
- **Lane B — Feature Builder — claimed: Lane B Builder — working on it** (started 2026-10-11; recovered-PRD top-down per MORNING ITINERARY: cert verification → shift templates → auto-backfill/no-show → standby pools → travel feasibility → W-9 vault → rate guidance → dispute queue → earnings PDF → rest; works in `../flexzora-laneb` worktree, migrations from `20261025`)
- **Lane A — Security Builder — claimed: Security Builder — working on it** (P0-RT top-down per MORNING ITINERARY: company-side HIGH batch #19/#20/#23/#51 first; one migration + regression test per issue; each fix on its own `fix/*` branch → PR)
- Everything below is unclaimed.

## MORNING ITINERARY — lane assignments (2026-10-11)

Overnight crew went quiet ~09:15 UTC after landing the full security core. Queue state: P0-RT has **4 HIGHs + 11 MEDs + 10 LOWs** left; 16 recovered-PRD features untouched; PR #81 (lockfile) awaits merge. Lane prompts below — each session claims its lane in Claims, then works top-down.

### Lane A — Security Builder (strong model preferred)
Work the remaining P0-RT items in this order — the top four are all the same class (company-side consent/mutability on money objects) and belong in ONE coherent migration:

1. **Company-side HIGH batch** — #19 (board-resolve mints IOU without worker consent → fulfil-accept gate), #20 (`crew_iou` column immutability for company branch), #23 (`offered_rate` freeze post-confirmation), #51 (debtor void requires beneficiary consent). One migration + pgTAP per issue.
2. **Ride-match MED batch** — #25 (`UNIQUE(rider, shift)`), #26 (company can't force-match), #27 (`seats_needed` frozen post-match) — same guard surface, one migration.
3. Singles: #52 (GrubRun price lock at claim), #30 (booking check on crew-table inserts), #29 (SMS kind gated on status), #21 (`break_minutes >= 0`), #31 (alert dead-code — move alert into the BEFORE path), #50 (distance/conflict oracles → shared-party only), #48 (per-worker dedupe keyspace).
4. LOWs in order: #54, #46, #42, #41, #40, #39, #35, #34, #33, #32.

### Lane B — Feature Builder
Recovered-PRD section, top-down: **Cert verification workflow** → **Shift templates** → **Auto-backfill cascade + no-show detection** → **Standby pools** → **Travel-time feasibility** → **W-9 vault** → **Rate guidance** → **Dispute queue** → **Earnings PDF** → rest as listed. Skip the two "design needed" items until the list is clear.

### Reviewer lane
- **Merge PR #81** (lockfile regen — fixes #67, restores `npm ci` deploys) once CI green.
- Gate every incoming fix PR: regression test must prove the exploit dead, not just compile.
- Sweep: verify each merged P0-RT fix against live `main` (re-run the exploit mentally/against code), file verification comments.

### Challenger lane
- **Regression pass on merged fixes**: on current `main`, re-attack #45, #28, #22, #24, #47, #49, #43, #38, #37, #44 — confirm each is actually dead, file issues if any fix is bypassable.
- Then fresh red-team on the *newest* surface (untouched so far): Copilot whitelist RPC, Import Wizard `commit_import_job`, ICS capability tokens, broadcast audience resolver, `ops_tasks`/`company_alerts` sweeps.

### Debt additions
- **npm audit dep-review** — 44 vulns (3 critical, mostly transitive) surfaced by the lockfile regen; needs deliberate triage, not `audit fix --force`.

## Company OS — overnight sprint (see `docs/VISION_COMPANY_OS.md` — spec + competitor findings)
- [x] AI Upload Wizard: `import_jobs`/`import_rows`, XLSX/CSV/PDF parse → LLM entity mapping (OmniRoute `localhost:20128/v1`, heuristic fallback) → review screen → bulk import — **in PR #53: Builder-2** (`feat/import-wizard` on `20261018000000_import_wizard.sql`: drop→map→ONE review screen→commit; `commit_import_job` RPC captures per-row errors, fix-and-retry CSV; targets venues/call-sheets→event/roster-contacts (staff reserved); LLM merged over heuristic mapper, user edits win; time-only calls inherit event date; imported shifts join the roster wave like `createShift`; venue lat/lng now optional + fixed a `validate_clock_event` NULL-geo hole that verified punches with no GPS check; `pdfjs-dist`+`read-excel-file` lazy in the `/import` chunk; vitest on parse/mapping)
- [x] Company Copilot: `company_docs` + copilot panel — ask-your-data queries + action previews (broadcast drafts, schedule lookups). Flag `VITE_ENABLE_COPILOT` — **in PR #55: Builder-2** (`feat/company-copilot` on `20261019000000_company_copilot.sql`: `copilot_query` whitelisted SECURITY DEFINER catalog re-checking owns_company; heuristic router first, OmniRoute only disambiguates kind+ids and never sees the DB; actions render as preview cards — save-doc confirms to `company_docs`, broadcast draft copies out until the broadcast lane lands; results snapshot onto `copilot_messages`; flag gates nav + `/copilot`)
- [x] Staff layer: `staff_members`/`staff_assignments` — PMs/coordinators on rosters, crew+staff unified show view — **in PR #56: Builder-2** (`feat/staff-layer` on `20261020000000_staff_layer.sql`: internal team beside marketplace crew — no worker account needed; `/staff` roster page + "Staff on this event" panel on event detail; per-event role label/call time/status; import 'staff' target live — upserts by email; seed: 3 staff, 2 on the demo event)
- [x] Broadcast messaging: compose to crew AND staff (per-event/shift/all) + delivery log — **in PR #58: Builder-2** (`feat/broadcast` on `20261021000000_broadcast.sql`: `resolve_broadcast_audience` shared by compose preview and `send_broadcast` so what you preview is what ships; workers + account-linked staff get in-app notifications, accountless staff queue as email recipients for the transport lane; `/broadcast` composer + history with per-recipient delivery log; copilot broadcast draft deep-links into the composer)
- [x] ICS calendar feed (subscribe links that actually update) + `events.timezone` multi-timezone display — **in PR #59: Builder-2** (`feat/ics-timezone` on `20261022000000_ics_timezone.sql`: `calendar_feeds` capability URLs scoped company/event/staff/worker, revocable, last-accessed tracked; `ics-feed` edge fn emits real VCALENDAR — events all-day, calls/staff/work timed UTC with the IANA zone named per entry; `events.timezone` + picker on the create form; FeedManager on /events — create/copy/revoke)
- [x] Ops kanban: `ops_tasks` + auto-created urgent cards for unfilled calls — **in PR #60: Builder-2** (`feat/ops-kanban` on `20261023000000_ops_kanban.sql`: `generate_unfilled_tasks` idempotent sweep — one urgent card per short-staffed call in 14 days, due 12h pre-call, auto-resolves when the call fills; `/ops` 3-column drag-drop board w/ priority/assignee/due/event links + auto badges)
- [x] Tour-level export: full crew list + schedule per event range → CSV/PDF — **in PR #61: Builder-2** (`feat/tour-exports`: `/exports` range picker + section checkboxes — crew list (one row/worker w/ contacts, roles, events), schedule (every call w/ booked names, unfilled flagged), staff sheet. Pure client-side: `toCsv` RFC-4180 + dependency-free `buildPdf` (multi-page Helvetica, footer stamps); reads through caller's own RLS — no migration needed)
- [x] Auto-reminders: shift, cert-expiry, unfilled-call, timesheet-pending — one alerts inbox — **in PR #62: Builder-2** (`feat/company-alerts` on `20261024000000_company_alerts.sql`: `generate_company_alerts` idempotent sweep — opens/escalates/auto-resolves alerts for unfilled calls (<48h → urgent), certs expiring ≤30d on booked crew, submitted timesheets >48h, locked calls <24h. Deduped per condition; dismissals stick. `/alerts` inbox — severity-ordered, entity links, open/resolved/dismissed tabs)

## Crew OS — overnight sprint (see `docs/VISION_CREW_OS.md` for full spec + quality bar)
- [x] `crew_iou` ledger migration + settlement hook in `approve_timesheet` (gross − Σ open IOUs, 25% cap, void on shift cancel) — **done: Builder** (`20261010000000_crew_iou.sql`: enum'd ledger w/ append-only guard, RLS for worker/beneficiary/company, void-on-shift-cancel + void-on-shift-delete triggers; `approve_timesheet` settles committed payout-deduction IOUs oldest-first, whole rows, capped at 25% of gross, records deduction as an invoice line item, escrow draws net. Client: `src/lib/crew/iou.ts` + `iou.test.ts`; demo rows in `seed.sql`. Open v1 gap: deducted cents stay in event escrow — beneficiary transfer lands with Stripe Connect.)
- [x] CrewPool rides: `ride_offers`/`ride_requests`, need-ride/can-drive flags, gas-share IOU — **done: Builder** (`20261011000000_crew_rides.sql`: needs_ride/can_drive on shift_assignments; ride_offers + ride_requests w/ seat ledger kept by triggers; match mints a `crew_iou` gas share (beneficiary=driver, group=offer) — withdraw frees the seat + voids it; offer/shift cancel cascades. Guard exemption added to `guard_crew_iou_update` so definer internals can maintain rows. Client `src/lib/crew/rides.ts`.)
- [x] BunkUp lodging pools: `lodging_pools`/`pool_members`, venue overnight-parking fields — **done: Builder** (`20261012000000_crew_lodging.sql`: pools per shift (hotel/airbnb/house/camp/rv), host sets per-spot share_cents; join takes spots + mints lodging `crew_iou` (beneficiary=host); leave/remove/host-cancel/shift-cancel free spots + void IOUs. Venue overnight_parking/camping_allowed/parking_notes/parking_json for BunkUp + SmartAlerts. Client `src/lib/crew/lodging.ts`.)
- [x] CrewBoard: structured post categories — **done: Builder** (`20261013000000_crew_board.sql`: `crew_posts` on shift_id (gig_messages is creator-broadcast on legacy gigs — wrong anchor); category ride/lodging/food/borrow/announce/general + want/offer direction + optional amount_cents; resolve with fulfilled_by mints the `crew_iou` in the correct debt direction; zero-amount resolves as a favor. Client `src/lib/crew/board.ts`.)
- [x] GrubRun food pooling: `food_runs`/`food_run_orders` with cutoff times — **done: Builder** (`20261014000000_grubrun.sql`: runner posts restaurant + cutoff; workers place orders pre-cutoff (runner can add late); runner confirms with real price — THAT mints the food `crew_iou` (beneficiary=runner, group=order); cancel/run-cancel/shift-cancel void. One order per worker per run. Client `src/lib/crew/food.ts`.)
- [x] SmartAlerts: per-shift briefing — **done: Builder** (`20261015000000_crew_alerts.sql`: `cert_gear_items`+`base_gear_items` data-driven packing lists; `crew_alerts` feed with dedupe keys; confirm-trigger generates gear/parking/departure briefing — departure = worker_sensitive geo -> venue @ 55km/h + 20min buffer; ride-cancel alerts matched riders. Briefing card + unread badges on the crew page. Client `src/lib/crew/alerts.ts`.)
- [x] ShiftSwap — **done: Builder** (`20261016000000_shift_swap.sql`: `swap_requests`/`swap_claims`; cert-gated visibility + claim gate via `worker_meets_shift_certs` (verified/active/not-expired for call date, mirrors matchScore); requester accepts claim -> claimer gets an 'offered' assignment in the normal offer flow (company notified via `notifications`, retains cancel levers); claimer confirms -> original goes 'withdrawn', swap completes, sweetener mints a manual `crew_iou` + alerts both parties; unwind on offer-death/cancel/shift-delete. Swap card on crew page: post/claim/accept/cancel one-tap. Client `src/lib/crew/swap.ts`.)
- [x] Auth UX completion: check-email state post-signup, forgot-password flow, Google button behind `VITE_ENABLE_GOOGLE_AUTH` flag, error states matching design — **in PR #6: Builder** (`feat/auth-ux`: check-email view + resend w/ cooldown, `/reset-password` page, Google+Apple gated behind flags, friendly error map incl. email-not-confirmed resend, fixed `type=email` blocking username sign-in)
- [ ] ShiftSwap: `swap_requests`/`swap_claims`, cert-gated visibility, company approval via offer flow — **PR #15 open, needs review**
- [x] Auth UX completion: check-email state post-signup, forgot-password flow, Google button behind `VITE_ENABLE_GOOGLE_AUTH` flag, error states matching design — **done: Builder, merged PR #6** (check-email view + resend w/ cooldown, `/reset-password` page, Google+Apple gated behind flags, friendly error map incl. email-not-confirmed resend, fixed `type=email` blocking username sign-in)

## P0-RT — RED-TEAM SWEEP (ship-blockers — work these before new features)

Challenger-lane findings (issues labeled `challenger`, plus #67 reviewer). Each fix = migration + RLS/trigger + a regression test that proves the exploit is dead. **#45 is CRITICAL — do first.**

- [x] **#45 CRITICAL — role self-assignment → admin/company takeover.** `handle_new_user` accepts `raw_user_meta_data.role`; `profiles` UPDATE lets a user flip their own role. Fix: allowlist metadata keys, deny role changes via RLS/trigger, role set only server-side.
- [x] **#47 HIGH — `worker_sensitive` self-writable payout fields.** Worker can set `stripe_connect_account_id`/`payouts_enabled` → payout redirection on session compromise. Fix: revoke UPDATE on those columns; service-role writes only.
- [x] **#49 HIGH — company DELETE cascades wipe timesheets/assignments.** Deleting a shift/event erases pay history + skips the 'cancelled' notification path. Fix: revoke DELETE; `status='cancelled'` transition only.
- [x] **#43 HIGH — live-shift terms editable after confirmation.** Company can change `hourly_rate`/`headcount`/certs with confirmed crew attached → silent pay changes. Fix: lock terms once first assignment is confirmed (trigger) or version the shift.
- [x] **#38 HIGH — worker self-flips application to 'accepted'.** RLS allows own-row status updates. Fix: transition guard — worker moves limited to apply/withdraw.
- [x] **#37 HIGH — reviews allow self-reviews/review-bombing**; `gig_id NULL` bypasses the unique constraint. Fix: participation trigger + `gig_id NOT NULL`.
- [x] **#44 HIGH — `lookup_user_by_username_or_email` anon-callable** via PostgREST → account enumeration bypassing the edge-function email guard. Fix: revoke anon EXECUTE / auth-only.
- [x] **#51 HIGH — debtor can void own auto-minted IOU** (board resolve, ride match, swap sweetener). Fix: void requires beneficiary consent or the shift-cancel path only. — **fixed: Security Builder** (`fix/lane-a-company-consent`: `20261103000000_p0rt_company_consent.sql` + pgTAP `019/020/023/051`)
- [x] **#19 HIGH — board-resolve mints payout-deduction IOU without worker consent** (verified live; PR #11 merged without the fix — highest-severity live item). Fix: resolve requires fulfiller confirmation, or IOU only mints on explicit accept. — **fixed: Security Builder** (`fix/lane-a-company-consent`: `20261103000000_p0rt_company_consent.sql` + pgTAP `019/020/023/051`)
- [x] **#20 HIGH — `crew_iou` UPDATE has no column immutability.** Company (owns_event) can rewrite `beneficiary_worker_id`/`amount_cents`/`status` on shift-anchored IOUs incl. payout-deductions (verified). Fix: trigger restricting mutable cols, or company read-only + service-writes. — **fixed: Security Builder** (`fix/lane-a-company-consent`: `20261103000000_p0rt_company_consent.sql` + pgTAP `019/020/023/051`)
- [x] **#23 HIGH — company can rewrite `offered_rate` post-confirmation.** `guard_assignment_update()` protects offer terms on the worker branch only; `approve_timesheet` pays `COALESCE(offered_rate, hourly_rate)` (verified). Fix: immutable once accepted/offered. — **fixed: Security Builder** (`fix/lane-a-company-consent`: `20261103000000_p0rt_company_consent.sql` + pgTAP `019/020/023/051`)
- [x] **#22 HIGH — ShiftSwap mutable fields repoint confirmed bookings.** — **fixed in PR #15, merged**
- [x] **#24 HIGH — payout-release TOCTOU/double-transfer + post-transfer-update failure retries.** — **fixed in PR #16, merged**
- [ ] #50 MED — `worker_distances`/`worker_conflicts` callable by any user on any worker → location triangulation + availability oracle. Restrict to parties sharing an assignment/event.
- [ ] #52 MED — GrubRun runner confirms at arbitrary price → inflated payout-deduction IOU. Fix: price locked at claim time + orderer confirm above a variance threshold.
- [ ] #48 MED — `crew_alerts.dedupe_key` globally unique + self-insertable → pre-squatting suppresses another worker's briefings. Fix: per-worker keyspace + service-insert only.
- [x] #26 MED — company can force-match any open `ride_requests` → `matched` (no transition limits on the company branch of the guard) → non-consensual gas-share IOU (verified). — **fixed: Security Builder** (`fix/lane-a-ride-match`: `20261104000000_p0rt_ride_match.sql` + pgTAP `025/026/027`)
- [x] #25 MED — `ride_requests` lacks `UNIQUE(rider_worker_id, shift_id)` → rider matches N requests to N offers → duplicate seats + duplicate IOUs (verified). — **fixed: Security Builder** (`fix/lane-a-ride-match`: `20261104000000_p0rt_ride_match.sql` + pgTAP `025/026/027`)
- [x] #27 MED — `seats_needed` mutable after match → free seats, minted IOU keeps stale amount (verified). — **fixed: Security Builder** (`fix/lane-a-ride-match`: `20261104000000_p0rt_ride_match.sql` + pgTAP `025/026/027`)
- [ ] #29 MED — `notify-assignment` `kind` not gated on assignment status → party can fire misleading SMS kinds (verified live since PR #7).
- [x] #21 MED — worker-editable `break_minutes` has no `>= 0` floor → negative breaks inflate payable hours (verified, pre-existing). — **fixed: Security Builder** (`fix/lane-a-break-minutes`: `20261105000000_p0rt_break_minutes_floor.sql` NOT VALID CHECK + pgTAP `021`)
- [ ] #30 MED — `ride_requests` INSERT only checks self-ownership → request squatting + phantom IOUs on shifts the worker isn't booked on (verified).
- [x] #28 MED — settle loop `EXIT WHEN` on first over-cap IOU **deadlocks the whole queue** (worse than filed: EXIT not skip; over-cap IOU is permanent) (verified).
- [ ] #31 MED — "Ride cancelled" alert is dead code: BEFORE cascade flips requests to 'open' before the AFTER alert trigger reads them (verified).
- [ ] #54 LOW — withdraw confirmed booking minutes before call, no consequence. Add late-cancel flag → reliability score.
- [ ] #46 LOW — `resend-waitlist-verification` unthrottled → email bomb. Add rate limit.
- [ ] #42 LOW — `gig_messages` read policy ignores `recipients` → targeted messages visible to all accepted workers.
- [ ] #41 LOW — new SECURITY DEFINER functions re-add `pg_temp` to search_path — inconsistent with the 20261008 hardening sweep.
- [ ] #40 LOW — `worker_reliability()` INVOKER-security → RLS filters counted rows, understated cross-company reliability.
- [ ] #39 LOW — clock-in opens 60min early and pay runs from clock-in → +1h unapproved paid time. Cap paid start at call time unless company approves early.
- [ ] #35 LOW — no temporal validation on crew tables (past cutoff, checkout<checkin, past departure).
- [ ] #34 LOW — OAuth `redirectTo` misses `BASE_URL` → dead-end on GitHub Pages deploy.
- [ ] #33 LOW — departure alert baked as `to_char(leave_by AT TIME ZONE 'UTC') || ' UTC'` — workers read raw UTC (verified). Fix via `events.timezone` (#59).
- [ ] #32 LOW — swap claimer can't re-claim after withdrawing — `UNIQUE(swap_request_id, claimer)` blocks re-entry. Lives on held feat/shift-swap.
- [ ] #67 — `package-lock.json` desynced (reviewer) — regenerate with `npm install`.

## Recovered from the original PRD — ideas not yet delegated

Roadmap "Next" items in `PRD.md §4` the sprints skipped. Rewritten as claimable work; each chains onto infrastructure that now exists.

- [x] **Cert verification workflow** — `certifications.document_url` upload → company/admin review queue → `verified_at` stamp. Without this, "verified credential" is a checkbox anyone can tick. Wire expiries into the alerts inbox (60/30/7-day reminders already exist). — **in PR #85: Lane B** (`feat/cert-verification` on `20261025000000_cert_verification.sql`: private `cert-docs` bucket (worker-folder write, related-company read) + `document_path`/`verification_status`/review fields; extended `guard_certification_verification` — review fields definer-only, status only moves none/rejected→pending, doc locked post-verify; `pending_cert_reviews` + `review_certification` RPCs gated on `worker_related_to_company` (roster/assignment/gig), reject requires a note, worker notified; `cert_review` alert kind on the sweep (>48h queue → warning, queue-clear resolves, dismiss sticks); worker ProfilePage = attach+submit/resubmit + real status badges (was: everything showed "Pending"); `/cert-reviews` queue page; pgTAP 060 covers self-stamp blocks + relationship gate + approve/reject/resubmit)
- [x] **Shift templates ("call packs")** — save a bundle: role + headcount + cert gates + rate + typical hours → "Arena load-in pack". One-tap multi-shift creation on new events. Natural partner: feed Import Wizard output into templates. — **in PR #87: Lane B** (`feat/shift-templates` on `20261026000000_shift_templates.sql`: `shift_templates` table + RLS; ShiftForm gains "Start from a call pack" picker (prefills everything but the clock, typical length moves wrap time) + "Save as a call pack" row on create; wizard gains `shift_templates` import target — a rate-card spreadsheet becomes packs (cert/skill names resolve like the shifts branch, upserts by company+name); seed: 3 packs on the demo company; vitest covers the new target)
- [x] **Auto-backfill cascade + no-show detection** — pg_cron: on decline, or no clock-in by call+15min → auto-offer to next-ranked eligible candidate → if pool exhausted, spawn urgent `ops_tasks` card + staff broadcast. All three pieces already exist (matchScore, offers flow, kanban) — this is the connective tissue. — **in PR #89: Lane B** (`feat/auto-backfill` on `20261103000000_auto_backfill.sql`: `next_backfill_candidate` ranks roster pool tier→reliability→rating with cert+skill gates; `auto_backfill_shift` gap-fills in one pass; trigger on decline/withdraw/no_show fires the cascade — declines chain until covered or pool runs dry → urgent `auto_backfill` ops card + owner notification; `detect_no_shows` sweep flips confirmed no-clock-in seats past call+15min (48h window, idempotent) → same cascade; OpsBoard + EventDetail run the sweep on load; pgTAP `070_auto_backfill` covers cascade/exhaustion/sweep/idempotence/non-roster exclusion; seed: in-progress call with a no-clock-in confirmed worker demos the loop)
- [ ] **Standby/on-call pools** — `preferred_rosters.tier` gains `standby`; standby crew gets first ping on backfill events + optional standby-rate field. Industry-real feature incumbents lack.
- [ ] **Travel-time feasibility** — replace the flat 8h-turnaround heuristic in `matchScore` availability with distance-aware feasibility (Haversine + buffer; Mapbox Matrix optional upgrade when a key exists).
- [ ] **Two-way calendar sync** — ICS subscribe ships (#59); add *inbound*: worker pastes personal iCal feed URL → busy blocks factor into availability scoring.
- [ ] **"What unlocks more calls" hints** — per-worker: aggregate `required_cert_codes` frequency across visible shifts vs. their certs → surface top credential gaps on their dashboard. Retention gold; data already exists.
- [ ] **Union/local rule packs** — meal penalties + turnaround pay as `overtime_rules` extensions (schema already supports per-event rule selection; add `meal_penalty_*`/`turnaround_min_hours` columns).
- [ ] **W-9/I-9 compliance vault** — doc upload + review gate before first payout release (also a real-world Stripe requirement).
- [ ] **Annual earnings statement PDF** — CSV exists; polish to a formatted year-end PDF statement (reuse the invoice PDF generator).
- [ ] **Rate guidance** — cleared-rate percentiles per role × market shown in `ShiftForm` from invoice history already collected. Anti-lowball signal for workers too.
- [ ] **Dispute mediation queue** — `timesheets.status='disputed'` exists; build the company/admin review UI + resolution flow.
- [ ] **Crew-chief "bring my team" bundles** — apply as a group under one chief's booking (matching v2; design needed).
- [ ] **Matching v2 learning** — per-company weight adjustments learned from confirm/decline history (design needed — start by logging outcomes).
- [ ] **pg_cron for roster→public auto-release** — currently client-triggered on page load (works only when someone visits); move to a scheduled job.
- [ ] Expo/React Native app — PRD 1.4. **Deferred by design** — revisit after P0-RT + recovered items land.

### Crew OS — deeper versions (noted during the sprint, not yet built)
- [ ] **Recurring ride buddies**: remember who drove/rode together across shifts; when a new shift confirms, suggest "same car as last time?" and pre-fill the offer/request.
- [ ] **Bail fairness**: late rider/member withdrawal (>X hours before call) keeps a % of the share committed instead of voiding fully — compensates the driver/host who can't refill the spot.
- [ ] **Pool suggestions by distance**: rank ride offers / lodging pools / food runs by distance to the worker's home geo vs. venue; surface "closest bunk" / "ride passing your exit".
- [ ] **GrubRun runner substitution + minimums**: runner can hand the run off; run-level minimum order count before the runner is committed; late-cancel fee shares the sunk cost.
- [ ] **IOU beneficiary transfer**: deducted cents currently stay in event escrow — push them to the beneficiary's Stripe Connect account (needs worker Connect onboarding).
- [ ] **Swap sweetener via payout deduction**: sweeteners are manual-settle today (requester has no payout on the swapped shift); settle against the requester's NEXT shift payout instead.
- [ ] **SmartAlerts transports**: feed is in-app only — push (FCM/APNs) and SMS digest behind feature flags; alert preferences per kind.
- [ ] **Company swap-approval UI**: swaps currently notify + rely on the normal offer levers; a dedicated approve/reject surface on the roster page would close the loop explicitly.
- [ ] **Cert-gated swap visibility is conservative**: workers who almost qualify see nothing; consider "ineligible" preview with the missing cert listed (drives cert uploads).

## P0 — ship blockers
- [x] Add `.github/workflows/ci.yml`: `npx eslint src`, `npx tsc --noEmit -p tsconfig.app.json`, `npx vitest run`, `npm run build` on every PR (free minutes). — **claimed: Mark — working on it**
- [x] Merge #2 (waitlist funnel), retarget #4 to `main`, then land both. — **done** (both merged)
- [ ] `supabase db push` to the live project; deploy edge functions (`submit-waitlist`, `verify-waitlist-email`, `resend-waitlist-verification`, `stripe-webhook` with `--no-verify-jwt`); set `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `VITE_STRIPE_PUBLISHABLE_KEY` when the Stripe account exists.

## P1 — Phase 1.2 marketplace completion
- [x] Twilio SMS on offer/application/status changes (edge function `notify-assignment`, called from service methods; needs `TWILIO_*` secrets). — **in PR #7: Builder** (`feat/notify-assignment`: edge fn resolves assignment server-side, caller must be a party, recipient+copy keyed by kind, graceful no-op without TWILIO_*; wired into applyToShift/directBook/respondToOffer/decideApplication via fire-and-forget `notifyAssignment`)
- [~] Stripe Connect worker onboarding + payout transfers — **in progress: Builder** (`feat/stripe-connect`: `connect-onboard`/`connect-status`/`release-payout` edge fns — worker gets/reuses an Express account + hosted onboarding link; status syncs `worker_sensitive.payouts_enabled`; company "Pay out" creates the transfer server-side after invoice-ownership check. All flag-gated `{available:false}` without STRIPE_SECRET_KEY. UI: connect card on worker Payouts page + release queue on Timesheets. Live blocker: Stripe account + secrets at deploy.)
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
- [x] Push notifications — **done (flag-gated): Builder** (`feat/push-alerts`: `push_subscriptions` table (self-RLS) + `save-push-subscription`/`send-push` edge fns; Web Push via VAPID — free keys, no paid service; `crew_alert_push` trigger dispatches through pg_net when `app.push_fn_url`/`app.push_internal_secret` DB settings exist, skips silently otherwise; sw.js push+click handlers deep-link to the crew page; "Alert this device" toggle on the briefing card. Live blocker: VAPID_* + PUSH_INTERNAL_SECRET secrets + DB settings; native FCM/APNs remains a deeper-version item.)
- [x] Geofence auto-clock-out on fence exit + manager alert. — **done: Tom** (ClockCard watches GPS while clocked in; 90s sustained outside-fence auto clocks out, flags the timesheet `worker_notes` for the manager)

## Debt
- 21 `react-hooks/exhaustive-deps` + `react-refresh` eslint warnings — burn down ~4/PR, never silence wholesale.
- [x] `index` bundle split — **done: Tom** (route-level React.lazy in App.tsx + vendor manualChunks; index 2.2MB→303kB, no chunk >500kB)
