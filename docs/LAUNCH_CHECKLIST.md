# Flexzora Launch Checklist

Last audited: 2026-10-17. Status legend: ✅ verified live · ⚠️ partial /
needs config · 🔧 blocked on human action.

## Verified live on the remote project (qgjtrosadftjrplubjaw)

- ✅ RLS enabled on all 77 user tables (only PostGIS `spatial_ref_sys`
  exempt — engine internal)
- ✅ Sensitive tables scoped by policy: `worker_sensitive`, `payments`,
  `payouts`, `invoices`, `fraud_signals`, `waiting_list` (admin read)
- ✅ `SECURITY DEFINER` functions: only 4 anon-callable
  (`waitlist_fill_crew_card`, `waitlist_referral_status`,
  `waitlist_public_stats`, `get_public_profile`) — all audited
- ✅ `anon` role: **zero table privileges** on user tables — privilege
  layer + RLS = defense in depth. Verified: direct REST read/insert on
  `waiting_list` → `42501 permission denied`
- ✅ Trigger-handler functions: EXECUTE revoked from all API roles (72
  fns; platform internals excluded). No API role can invoke them
- ✅ RPC rate limiter **burst-tested live**: calls 1–8 pass, 9+ rejected
- ✅ `waitlist_rpc_hits` self-cleans (10-min window delete in RPC)
- ✅ `waitlist_sanitize_anon_insert` trigger — direct inserts can't
  smuggle `status`/`verified_at`/`referral_count`/`profile_completeness`/
  `created_at`; `referral_code`+`verification_token` regenerated
  server-side. Attack-tested live.
- ✅ Public edge functions audited; repo hardened (deploy pending):
  `submit-waitlist` + `schedule-demo` get `_hp` honeypot + per-IP caps
  + dedup; `resend` enumeration-404 closed; `verify` writes `verified_at`
- ✅ `waitlist_fill_crew_card` — first-write-wins, 30-min claim window,
  8/min per-IP cap, server-side `signup_ip` capture
- ✅ `claim_waitlist_spot` RPC (20261206000000) — verified waitlist row →
  account claim on confirmed-email match only; idempotent, fills empty
  profile fields, claimant-only RLS read of own claimed row. Live-tested
  in rolled-back txn (claim + idempotent re-claim + prefill verified)
- ✅ All 51 function `search_path` warnings pinned (`public, pg_temp`)
- ✅ Form bot friction: honeypot + <2s submit gate, silent fake success
- ✅ `lookup-user` rejects email identifiers (no account enumeration)
- ✅ `.env.local` gitignored, untracked; no `VITE_`-prefixed secrets
- ✅ `tsc -b`, `eslint`, `vite build` clean; OG/Twitter/meta tags on
  flexzora.com; manifest + favicon fixed; debug params dev-gated
- ✅ Full E2E: edge-fn signup → RPC crew-card fill → all 54 columns
  persisted → overwrite rejected → cleanup

## Deployed 2026-10-16 (PAT rotated)

- ✅ `submit-waitlist` + `schedule-demo` + `resend-waitlist-verification`
  + `verify-waitlist-email` deployed — hardened versions live: honeypot,
  per-IP caps, dedup, no-code-leak duplicate path, `verified_at` stamp
- ✅ `WAITLIST_SKIP_EMAIL_VERIFICATION=false` — verification emails send
  through the shared provider chain: Resend primary on the verified
  flexzora.pro domain, AgentMail fallback. Production-triggered resend
  verified delivered from `Flexzora Crew <crew@flexzora.pro>`
- ✅ Internal mail sender locked down: `send-waitlist-verification`
  requires the service-role bearer, so public users cannot spend branded
  email quota; bearer verification links are no longer logged or returned
- ✅ Worker first-run checklist now exposes payout setup status with
  honest hints. Stripe `payoutsEnabled` completes only that step — it does
  not claim tax, agreement, or overall payment readiness
- ✅ `schema_migrations` synced — all four manually-applied versions
  recorded; `db push` won't re-run them

## Applied live 2026-11-08 (worker core pack, pending PR merge)

- ✅ `worker_ledger_entries` + `gig_onboarding` tables, RLS enabled,
  worker-owned write / company read-only policies
- ✅ 8 RPCs live: `ledger_add_entry`, `ledger_entries`, `ledger_summary`,
  `onboarding_get`, `onboarding_update_item`, `onboarding_companies`,
  `onboarding_item_keys`, `guard_onboarding_items` — all `SECURITY DEFINER`
  with `search_path` pinned, EXECUTE revoked from PUBLIC, granted to
  `authenticated` only
- ✅ Live smoke under real worker JWT: `ledger_summary` returns integer
  cents ($360 earned → 36000¢, fees separate), `onboarding_companies`
  returns invoice-linked company with null checklist status
- ✅ Guard trigger verified by pgTAP design: worker self-confirm reverts,
  company owner/admin confirm persists (CI db-tests pending on PR)
- ✅ `compliance_docs.doc_type` expanded (W-4, deal memo, state form, COI,
  union card, direct deposit, NDA, safety cert) — status tracking only
- ⚠️ pgTAP `102_worker_ledger.test.sql` not yet executed locally (no
  Docker on this machine) — first real run is CI on the PR

## Applied live 2026-12-17 (crew marketplace / Flexzora Market)

- ✅ `marketplace_listings` + `marketplace_orders` tables, RLS enabled;
  orders have NO direct write policies — all writes via guarded RPCs
- ✅ RPCs live + verified: `market_create_order` (server-side price + 5%
  fee snapshot, fulfillment + shipping-address validation),
  `mark_market_order_paid` (service-role only), `market_mark_shipped`,
  `market_mark_delivered`, `market_cancel_order`
- ✅ One-open-order-per-listing partial unique index live
  (`marketplace_orders_one_open_per_listing`)
- ✅ `market-photos` public bucket + folder-scoped storage policies
  (`{seller_profile_id}/…`)
- ✅ Edge functions deployed: `market-checkout` (destination charge,
  5% application fee, reuses open Stripe session per order) and updated
  `stripe-webhook` (market branch + duplicate-payment auto-refund)
- ✅ Unauthenticated `market-checkout` call returns 401 (JWT enforced)
- ✅ pgTAP `103_crew_marketplace.test.sql` written (19 asserts) — first
  real run is CI on the PR
- ⚠️ End-to-end Stripe purchase NOT yet exercised — needs a real listing,
  Connect-onboarded seller, and test-mode card. Blocked on a live smoke
  account, not code.
- ⚠️ Refunds for paid orders are manual (Stripe dashboard) — documented
  decision, no self-serve refund RPC in v1.

## Remaining human action

- 🔧 Dashboard → Auth: enable leaked-password protection (WARN lint)
- ✅ Domain secured: `flexzora.pro` (owned). Deploy target: Vercel —
  import `SyxNyn3/Flexzora_Gig_Management_Platform`, set the `VITE_*`
  vars for Production, add `flexzora.pro` + `www`, paste the two DNS
  records at the registrar. Replaces the flexzoraos.com plan and the
  Pages artifact workflow (private repo, no Pages on free tier).
- 🔧 Supabase dashboard → Auth → URL Configuration: Site URL =
  `https://flexzora.pro`, add redirect URLs for `https://flexzora.pro/**`
  (and `https://www.flexzora.pro/**` if www is served).
- 🔧 Stripe: confirm live vs test keys before real money moves
  (`VITE_STRIPE_PUBLISHABLE_KEY` build-time + function secrets).
- 🔧 OAuth providers (if enabled): Google/Apple redirect URLs must
  include `https://qgjtrosadftjrplubjaw.supabase.co/auth/v1/callback`
  — that part doesn't change with the domain; the app-side redirect
  does.

## Accepted risk (documented, intentional)

- ⚠️ Extensions in `public` schema (`vector`, `pg_trgm`, `postgis`) —
  moving is riskier than exposure
- ⚠️ `rl_experiences`, `training_data` — empty, unreferenced, deny-all;
  drop candidates
- ⚠️ `authenticated` can still EXECUTE most SECURITY DEFINER functions —
  mitigated by internal `auth.uid()`/ownership checks in each body

## Load posture

- Write path = ~2 queries/signup via edge fn + RPC → Postgres handles
  orders of magnitude above a 1k/2min burst; RPC rate cap is per-IP so
  legit spikes don't self-throttle globally
- Frontend = static files (OG manifest + SW network-first navigations) —
  scales free
- ⚠️ Not yet: Cloudflare Turnstile (add when bot abuse materializes),
  real load test, email-provider throughput limits

## Signup data collected (crew card)

Roles · skills/certs · experience · union · day rate · Instagram ·
travel modes · vehicles[] · roster (current employers + past) · own
business · markets worked (unlimited) + top-3 favorites · preferred
regions + granular areas · farthest travel / willing farther · passport
→ overseas → wheels-up readiness · call-response time · 1099/W2 ·
crew-you-roll-with · pain points · SMS consent · completeness score

## Frontend verification pass — 2026-10-30 (screenshot-proven)

Verified live on flexzora.pro via Playwright (real sign-in as test
worker + company accounts, screenshots in `.diffui/screenshots/`):

- ✅ Auth boot + closed-beta gate: new accounts land on "you're on the
  list"; approved profiles pass through. Sign-in → dashboard ~1s
- ✅ 25 routes resolve to their own URLs — public
  (`/ /waitlist /pay-rules /schedule-demo /privacy /terms`), company
  (`/dashboard /feed /events /timesheets /broadcast /staff /ops
  /alerts /finances /roster /gigs`), worker (`/dashboard /feed /gigs
  /applications /schedule /payouts /profile /finances`)
- ✅ `/feed` (unified notification stream) live for both roles;
  `outbound_messages` table live + RLS'd; notify-assignment + send-push
  write send-proof rows
- ✅ Fixed this pass — deployed and re-verified:
  - `TS6133` unused `React` imports had failed 6 prod deploys; site was
    serving a stale bundle for ~a day
  - Session-restore timeout wiped valid auth → every deep link
    redirected to /dashboard (see
    `docs/agent-knowledge/auth-session-races.md`)
  - Dual-store refresh-token race → invalid_grant churn; removed the
    manual refresh path
  - `SetupChecklist` queried wrong columns/enums (400s); now queries
    real schema
- ⚠️ First load after idle can take >8s while the paused free-tier
  project wakes — app now survives it (no more bounce/spinner), but
  cold-start UX is just a spinner. Worth a "waking up…" state or a
  paid-tier project when traffic starts.
- ✅ Email sender verified: production-triggered waitlist mail delivered
  from `Flexzora Crew <crew@flexzora.pro>`; AgentMail is fallback only

## Dual-role company membership — 2026-12-03

- ✅ `company_members` table (RLS, SELECT-only for API roles) + backfill;
  `owns_company()` now resolves through membership, upgrading every
  company-gated policy/RPC. `create_company()` RPC is the only API creation
  path (direct INSERT closed); `my_company_memberships()` feeds the UI.
  Verified live via pooler as real users: worker creates company → owner
  member row + `owns_company`=true, `profiles.role` stays `worker`.
- ✅ Edge functions deployed 2026-11-06 and verified live (401 to
  anonymous callers): `release-payout` + `create-checkout-session`
  require owner/admin membership; `retrieve-payment-intent` +
  `notify-assignment` accept any member.

## Ops & onboarding automation — 2026-11-06

- ✅ Company-side notifications fan out to ALL `company_members`, not just
  `companies.created_by` (auto_backfill_shift, detect_no_shows,
  notify_on_application_status_change, open_timesheet_dispute,
  sync_swap_claim). `company_member_ids()` is definer-only so it can't be
  used as a membership oracle. Migration `20261204000000`, applied +
  recorded remotely.
- ✅ Company setup checklist gained "Fund your first event escrow" —
  checks a real funded/partially_released `escrow_deposits` row so new
  companies learn payroll releases from escrow before the first
  timesheet approval hits "escrow is short".
- ✅ Daily onboarding nudge sweep (`send_onboarding_nudges`, pg_cron
  15:00 UTC): in-app reminders for workers >24h without crew-card skills
  and company owners/admins whose company has zero events. 72h dedup,
  3-nudge cap, staff not nagged. Verified live in a rolled-back
  transaction. Migration `20261206000000`.
- ✅ Member management, waitlist claim, and toolchain upgrades merged
  (PRs #159-#163).

## Worker tax & payout tooling — 2026-12-09

- ✅ Guided W-9 wizard (PR #166): 3-step form → facsimile Form W-9 PDF
  (jsPDF) → typed-name e-sign under Part II certification → same
  `compliance_docs` pending/review/approved flow. SSN/EIN exist only
  inside the PDF in the private bucket. Manual upload kept as fallback.
- ✅ Worker payouts page already had: invoice PDF, CSV export,
  year-end 1099-ready earnings statement. W-2s are NOT issuable —
  Flexzora is not the employer; workers are 1099 contractors and the
  payer (production company) issues 1099-NEC/W-2 as applicable.

## Self-hosted LLM path — 2026-12-09

- ✅ `llm-proxy` edge function (PR #165): authenticated, per-user
  60 calls/day cap (`llm_proxy_hits`), forwards to `LLM_BASE_URL`
  secret. `omniChat` now calls it by default; `VITE_OMNIROUTE_URL`
  remains a dev override.
- ✅ Upstream = self-hosted Ollama `qwen2.5:3b-instruct` on the Contabo
  VPS behind an nginx bearer-token gateway (`flexzora-llm-gw`,
  port 11435; raw Ollama has no auth and stays unpublished). Secrets
  set: `LLM_BASE_URL`, `LLM_MODEL`, `LLM_API_KEY`.
- ⚠️ Latency: CPU-only inference on 3 pinned cores ≈ 40-70s per call.
  Timeouts raised to match (PR #167: client 90s, upstream 120s).
  Works but slow — swap `LLM_BASE_URL`/`LLM_MODEL`/`LLM_API_KEY` to a
  hosted OpenAI-compatible provider (Groq/Gemini) for interactive
  speed; prompts carry only intent catalog + operational metadata,
  never PII, per the copilot_query design.
- 🔧 Authenticated end-to-end copilot query not yet smoke-tested
  (needs a real user session) — UPDATE 2026-12-10: verified live via
  pooler + REST; returns correct intent JSON through the full chain.

## PostGIS moved out of public — 2026-12-10

- ✅ Security Advisor PostGIS findings cleared: extension moved from
  `public` to `extensions` via backup → `DROP EXTENSION postgis
  CASCADE` → `CREATE EXTENSION postgis WITH SCHEMA extensions` in one
  transaction (Supabase KB path; the `postgres` role cannot run the
  relocatable `pg_extension` script — superuser-only).
- ✅ Prep: 5 functions with pinned `search_path` gained `extensions`
  (`nearby_shifts`, `sync_profile_geo`, `sync_venue_geo`,
  `worker_distances`, `worker_sensitive_sync_geo`) — migration
  `20261210000000`. All 155 public functions verified intact post-move.
- ✅ Restored: `venues.geo` + `worker_sensitive.geo`
  (`geography(Point,4326)`, trigger-derived — both tables were empty,
  zero data loss) + `venues_geo_idx` gist index — migration
  `20261211000000`.
- ✅ Verified: `extensions.spatial_ref_sys` (8500 rows restored),
  `ST_Distance` resolves, geo trigger populates on insert (rolled-back
  test), PostgREST schema reloaded, advisor re-run shows no PostGIS
  findings.
- ⚠️ Remaining advisor WARNs (separate, lower risk): `vector` and
  `pg_trgm` extensions also sit in `public` — no exposed tables, same
  drop/recreate fix applies if we want them gone too.
