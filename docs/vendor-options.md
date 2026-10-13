# Vendor Due Diligence — Options & Backups

Rule for every external dependency: **never adopt the first option.** Research
≥3 candidates, pick one, log the backup with the reason it loses. This file is
that log — every vendor decision and its runner-up lives here.

## Email delivery (verification, notifications, auth emails)

| Vendor | Free tier | Verdict |
|---|---|---|
| **Resend** ✅ chosen | 3,000/mo, 100/day | Code already targets `RESEND_API_KEY`; API + SMTP; instant sender `onboarding@resend.dev` works pre-domain |
| **Brevo** — backup | 300/day (~9,000/mo) | Best free quota; API + SMTP + marketing suite. Swap = change the `api.resend.com` call site |
| **SMTP2GO** — 2nd backup | 1,000/mo | Long log retention |
| Postmark | 100/mo | Too small |
| SendGrid | dead — free tier retired May 2025 | Ruled out |
| AWS SES | sandbox friction + AWS account | Only at scale |
| VPS self-hosted | free | Plan C — deliverability requires IP warm-up + PTR/SPF/DKIM/DMARC; Gmail/Yahoo spam risk high |

## SMS (dormant — push + email cover pilots)

| Vendor | Cost | Verdict |
|---|---|---|
| **Twilio** — parked | $15 trial credit, then ~$0.0083/SMS | Account created; trial blocks API verification calls. Keep dormant — secrets already set, wakes up if upgraded |
| **Telnyx** — chosen backup | ~$0.004/part + $1/number | Cheapest real carrier API; pick this if SMS gets funded |
| **textbee** | free 300/mo via own Android SIM | Ideal for us but needs an active SIM plan — not currently available |
| **TextLink** | $0.001/SMS via own SIM | Same SIM requirement |
| **Textbelt** | 1 free/day; cheap credits | Simplest API; usable for emergencies |

## Payments

| Vendor | Verdict |
|---|---|
| **Stripe** ✅ chosen | Account exists (recovery pending 2FA); Connect is the industry standard for marketplace payouts |
| PayPal/Braintree, Adyen, Lemon Squeezy | Considered — heavier compliance lift or wrong product shape for two-sided payouts |

## Hosting / infra (current, all free tier)

| Layer | Vendor | Backup |
|---|---|---|
| DB + auth + functions | Supabase | none needed now |
| Static hosting | GitHub Pages | Cloudflare Pages |
| Domain/DNS (soon) | Cloudflare | — |
| Ops/automation | VPS (owned) | n8n cloud free tier |

## Process

- New dependency? Add a table here with ≥3 researched rows before adopting
- Fallbacks are pre-logged so a provider failure = a swap, not a research sprint
