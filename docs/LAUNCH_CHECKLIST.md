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
- ✅ `waitlist_sanitize_anon_insert` trigger — direct inserts can't
  smuggle `status`/`verified_at`/`referral_count`/`profile_completeness`/
  `created_at`; `referral_code`+`verification_token` regenerated
  server-side. Attack-tested live.
- ✅ `waitlist_fill_crew_card` — first-write-wins, 30-min claim window,
  8/min per-IP cap, server-side `signup_ip` capture
- ✅ All 51 function `search_path` warnings pinned (`public, pg_temp`)
- ✅ Form bot friction: honeypot + <2s submit gate, silent fake success
- ✅ `lookup-user` rejects email identifiers (no account enumeration)
- ✅ `.env.local` gitignored, untracked; no `VITE_`-prefixed secrets
- ✅ `tsc -b`, `eslint`, `vite build` clean; OG/Twitter/meta tags on
  flexzora.com; manifest + favicon fixed; debug params dev-gated
- ✅ Full E2E: edge-fn signup → RPC crew-card fill → all 54 columns
  persisted → overwrite rejected → cleanup

## Needs human action (blocked — expired SUPABASE_ACCESS_TOKEN)

- 🔧 Rotate PAT in Supabase dashboard → Access Tokens
- 🔧 `supabase functions deploy submit-waitlist resend-waitlist-verification verify-waitlist-email`
  — deployed function is an older revision (inserts fine, drops crew
  fields; RPC covers it meanwhile)
- 🔧 Once deployed: set `WAITLIST_SKIP_EMAIL_VERIFICATION=false` —
  verification emails currently never send; fake emails can't be
  detected until this flips
- 🔧 Dashboard → Auth: enable leaked-password protection (WARN lint)

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
