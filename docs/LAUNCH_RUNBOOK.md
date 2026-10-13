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

### 1. Resend — unlocks ALL email (~10 min)

1. Sign up at **resend.com** (free tier: 100 emails/day)
2. Copy the API key
3. Supabase Dashboard → project → **Edge Functions → Secrets** → add:
   - `RESEND_API_KEY` = the key
   - `DEMO_NOTIFY_EMAIL` = your email (demo requests get emailed to you)
   - `RESEND_FROM_EMAIL` = `Flexzora <onboarding@resend.dev>` (works instantly; replace with your domain address after domain verification)
4. Done — verification emails + demo-request alerts go live with zero code changes (functions already check for the key)
5. **Later**: verify your domain in Resend (3 DNS records) → update `RESEND_FROM_EMAIL` to `name@yourdomain.com` for deliverability
6. **Bonus — route Supabase's own emails through Resend too**: Supabase Dashboard → Authentication → SMTP Settings: host `smtp.resend.com`, port `465`, user `resend`, password = your Resend API key, sender = your verified address. This fixes signup-confirmation/password-reset deliverability (otherwise they ride the shared Supabase mailer — spam-folder territory)

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

## What not to touch

- Don't edit `supabase/migrations/` files that were already applied — create new ones
- Don't create a second Stripe account
- Don't make the private source repo public (the public one is `flexzora-live`, auto-managed)
