# Flexzora Launch Runbook

Everything needed to operate the platform without an agent. Ordered by what
unblocks the most.

## The map

| Thing | Where |
|---|---|
| Live site | https://syxnyn3.github.io/flexzora-live/ |
| Source repo (private) | github.com/SyxNyn3/Flexzora_Gig_Management_Platform |
| Public compiled repo | github.com/SyxNyn3/flexzora-live |
| Database | Supabase project `qgjtrosadftjrplubjaw` → supabase.com/dashboard |
| Waitlist admin | Live site → `/admin/waitlist` (needs an admin-role login) |
| Edge functions | Supabase Dashboard → Edge Functions (12 deployed) |

## Deploy rule — one sentence

**Push to `main` on the private repo → GitHub Actions builds + publishes the site automatically.** No other deploy steps. Check Actions tab on GitHub if a change doesn't appear in ~3 min.

## Your action list (the only things requiring your hands)

### 1. Email — ✅ LIVE via AgentMail (2026-10-14); Resend = optional upgrade

Outbound email works now. `send-waitlist-verification` and `schedule-demo`
send through **AgentMail** (`AGENTMAIL_API_KEY` + `AGENTMAIL_INBOX`
=`syxnyn3@agentmail.to` secrets set). Demo-request notifications email the
agent inbox (`DEMO_NOTIFY_EMAIL=syxnyn3@agentmail.to`) — Devin reads it and
relays to you. Verified end-to-end: a real notify email landed in the inbox.

Limits: ~10 sends/day, ~300/mo free — fine for beta. If you outgrow it or want
a branded sender domain, do the Resend upgrade below — the functions already
fall back to it when `RESEND_API_KEY` exists (AgentMail wins if both set).

**Optional Resend upgrade (~10 min)**: sign up resend.com → set
`RESEND_API_KEY`, `RESEND_FROM_EMAIL`, change `DEMO_NOTIFY_EMAIL` to your
personal email → optionally verify your domain for deliverability.
**Supabase Auth's own emails** (password reset, magic links) are NOT covered
by AgentMail — they need SMTP in Dashboard → Authentication → SMTP Settings
(Resend SMTP: host `smtp.resend.com` port 465 user `resend` pass=api key), or
they ride Supabase's shared mailer (spam-folder territory).

### 2. Auth redirect URLs — ✅ DONE (set via Management API 2026-10-13)

Site URL `https://syxnyn3.github.io/flexzora-live/` + allowlist for prod and
localhost dev are configured. Nothing to do here.

### 3. VPS (whenever ready)

The `scripts/ops/` folder has `backup.sh` (nightly DB dump) and `uptime.sh`
(health pings). One-time setup commands are inside each file's header.
Everything else stays as-is if you never get to it — this is insurance, not a blocker.

### 4. Stripe (before real money only)

Demo/sandbox mode covers pilot demos. When you need real payouts: recover the
existing Stripe account via email/ID verification (support.stripe.com) — do NOT
create a second account. Once in: Dashboard → API keys → set
`STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` as function secrets and deploy
the 7 payment functions (list below).

## Operating the waitlist

- **View signups**: login as an admin-role user → `/admin/waitlist`. Two tabs: Waitlist + Demo requests (with a `(n new)` badge).
- **If someone says "no verification email"** (pre-Resend): verify them manually — Supabase Dashboard → **SQL Editor** →
  ```sql
  UPDATE waiting_list SET verified_at = now() WHERE email = 'their@email.com';
  ```
- **Demo requests**: same admin page, second tab. Update status as you contact people.

## Function inventory (what's live)

Deployed (12): `submit-waitlist`, `verify-waitlist-email`, `send-waitlist-verification`,
`resend-waitlist-verification`, `schedule-demo`, `lookup-user`, `save-push-subscription`,
`send-push`, `alert-digest`, `ical-sync`, `ics-feed`, `notify-assignment`

Dormant until keys exist:
- **Email**: verification sends + demo notify → `RESEND_API_KEY`
- **SMS**: notify-assignment texts + alert-digest → `TWILIO_*` (optional; push/email may cover pilots)
- **Push**: live now via VAPID (keys already set)

Needs Stripe (7): `connect-onboard`, `connect-status`, `create-checkout-session`,
`create-payment-intent`, `retrieve-payment-intent`, `release-payout`, `stripe-webhook`

Needs Pica (1): `authkit-token` (Gmail integration — optional)

## If the site breaks

| Symptom | Likely cause | Where to look |
|---|---|---|
| Blank/error page | Build regression | GitHub → Actions → last run |
| "Failed to send request to edge function" | Function down or CORS | Supabase Dashboard → Edge Functions → logs |
| Signup works, can't log in | Email unconfirmed | Check spam; confirm manually via SQL Editor: `UPDATE auth.users SET email_confirmed_at = now() WHERE email='x@y.com';` |
| Emails not arriving | Resend not configured | Action item 1 above |
| Push deploy broken | GitHub Actions red | Actions run log → revert the commit |

## Credentials — where they live

- `C:\dev\flexzora\.env.local` — Supabase URL, publishable key, DB password, access token, VAPID public key, push secret. **This file is the keys to the kingdom — never commit it, never paste it anywhere.**
- Function secrets: Supabase Dashboard → Edge Functions → Secrets
- GitHub repo secrets: repo → Settings → Secrets and variables → Actions
- Delete/rotate the `SUPABASE_ACCESS_TOKEN` in .env.local when deploys are done — it was a 24-hour token

## Demo content (the seeded marketplace)

4 demo production companies post 19 real, open shifts (Orlando/Tampa/Atlanta/Nashville):
Sunset Stage Productions, Gulf Coast Event Services, Peach State Production Group,
Riverbend Live. All marked `is_demo = true` — visible badge potential, one-query removal:

```sql
-- when real companies arrive and you want the demo content gone:
DELETE FROM companies WHERE is_demo;  -- cascades to their venues/events/shifts
```

Workers can genuinely apply/book/clock on these — they exercise the real pipeline.
Demo owner login: `demo-company@flexzora.dev` / `SmokeTest!234` (in .env.local scope).

## What not to touch

- Don't edit `supabase/migrations/` files that were already applied — create new ones
- Don't create a second Stripe account
- Don't make the private source repo public (the public one is `flexzora-live`, auto-managed)
