# Flexzora

**Crew & shift operations platform for live-event production** — a
two-sided marketplace where staffing companies post shifts and freelance
crew claim, work, and get paid, with the platform carrying the
operational weight in between: scheduling, credentials, swaps, rides,
timesheets, expenses, deal memos, and payouts.

**Live:** [flexzora.pro](https://flexzora.pro) ·
**Stack:** React 18 · TypeScript · Vite · Tailwind · Supabase
(Postgres + RLS + Edge Functions) · Stripe Connect

[![CI](https://github.com/SyxNyn3/Flexzora_Gig_Management_Platform/actions/workflows/ci.yml/badge.svg)](https://github.com/SyxNyn3/Flexzora_Gig_Management_Platform/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6)](https://www.typescriptlang.org/)
[![Supabase](https://img.shields.io/badge/Supabase-Postgres%20%2B%20RLS-3ecf8e)](https://supabase.com/)
[![React](https://img.shields.io/badge/React-18%20%2B%20Vite-149eca)](https://react.dev/)

---

## What it does

| Side | Surface |
|---|---|
| **Crew (workers)** | Shift marketplace, year-round availability calendar, gig applications, deal memos with e-signature, invoices, expense/receipt tracking, tax playbook, ledger, Stripe Connect payouts, crew-to-crew gear marketplace |
| **Companies** | Self-serve onboarding, events → shifts → broadcast calls, roster management, timesheet approval, credential review, swap/ride coordination, escrowed payouts, CSV import, company copilot |
| **Platform** | Waitlist with email verification, closed-beta gating, notification fan-out (in-app + web push + email), iCal feeds, marketplace escrow |

## Problem → Solution

| Operational pain | What Flexzora does |
|---|---|
| Crew calls/texts scattered across channels | Shift marketplace + broadcast alerts in one surface |
| "Who's actually certified for this?" | Credential records + `cert_review` workflow + swap-cert preview |
| Double-bookings and swap chaos | Fulfil-accept gate, one-active-ride-per-shift, swap immutability — enforced in DB constraints, not convention |
| Timesheets ≠ pay disputes | Company-side timesheet approval → Stripe Connect payouts, with offer terms frozen at acceptance |
| Re-keying spreadsheets | CSV import pipeline with field mapping, validation, and staging |
| Trust between strangers | Reliability/compliance scoring, portfolio profiles, public company pages |
| Crew paid outside the platform still needs paperwork | Worker-owned invoices with sequential numbering, line items, PDF export, and draft→sent→paid lifecycle |

## Architecture

```
                        ┌─────────────────────────────────────────┐
                        │             Vite + React SPA            │
                        │  worker/ · company/ · admin surfaces    │
                        │  TanStack Query · shadcn/ui · Tailwind  │
                        └──────────────┬──────────────────────────┘
                                       │ supabase-js (anon key)
                                       ▼
              ┌───────────────────────────────────────────────────┐
              │                SUPABASE PROJECT                   │
              │ ┌─────────────────┐   ┌─────────────────────────┐ │
              │ │ Postgres + RLS  │   │   Edge Functions (24)   │ │
              │ │ 119 migrations  │   │ stripe-webhook · payout │ │
              │ │ 48 pgTAP tests  │   │ push · ical · mail      │ │
              │ └────────┬────────┘   └──────┬─────────┬────────┘ │
              └──────────┼───────────────────┼─────────┼──────────┘
                         ▼                   ▼         ▼
                  ┌────────────┐      ┌──────────┐  ┌───────────┐
                  │ RLS = auth │      │  Stripe  │  │ Web Push  │
                  │ boundary:  │      │ Connect/ │  │ + iCal/   │
                  │ per-tenant │      │ Payments │  │ ICS feeds │
                  └────────────┘      └──────────┘  └───────────┘
```

**Why this shape:** the security model lives in the database, not the
client. Workers, companies, and admins read through row-level security
policies — the anon key is publishable *by design*. Everything sensitive
(payout release, webhook intake, push sends, waitlist writes) runs
behind edge functions with service-role credentials that never touch
the browser. Invariants that protect money and schedules — frozen offer
terms, immutable swaps, single active rides, sanitized waitlist rows —
are enforced as Postgres constraints and triggers, covered by a pgTAP
regression suite that runs in CI against real Postgres.

Notable backend decisions:

- **`profiles.id` ≠ `auth.users.id`** — every worker/company foreign key
  uses the application profile PK; this distinction is a recurring
  source of RLS bugs and is documented in `docs/agent-knowledge/`.
- **Waitlist writes are RPC-only** — `submit-waitlist` edge function +
  `waitlist_fill_crew_card` RPC + sanitize trigger; direct table inserts
  are impossible by design.
- **Anonymous surface is whitelisted** — four public RPCs and
  `verify_jwt=false` functions, each with abuse guards.
- **Additive migrations only** — 119 ordered migrations mirror every
  remote-applied change; nothing destructive without approval.

## Repo layout

```
src/pages/worker/    Shift marketplace, payouts, ledger, invoices,
                     expenses, availability, deal memos, market, tax playbook
src/pages/company/   Events, roster, staff, timesheet approval,
                     broadcast, cert review, copilot, import/export
src/components/      Feature modules (calendar, finances, integrations,
                     landing, dashboard) built on shadcn/ui primitives
src/lib/             Domain modules: marketplace, dealMemos,
                     workerInvoices, payments, push, broadcast, copilot
supabase/migrations/ Ordered schema history (119 migrations)
supabase/functions/  Edge functions — payments, push, ical, mail,
supabase/tests/      pgTAP database regression suite (48 files)
docs/                Launch checklist, backlog, agent-knowledge ledger,
                     competitive research, runbooks
```

## Quick start

```sh
npm install
cp .env.example .env.local   # add your Supabase project URL + anon key
npm run dev
```

Full local stack with the real database:

```sh
supabase start        # spins up local Postgres, replays all migrations
supabase test db      # runs the pgTAP suite
```

## Quality gates (CI on every push/PR)

`eslint` → `tsc` → `vitest` + coverage → `vite build`
+ pgTAP suite on a live local Postgres
+ `gitleaks` over full history
+ `npm audit --audit-level=high`

## Engineering highlights

- **Money correctness:** Stripe Connect destination charges, signed
  webhook state machine, escrowed marketplace orders with server-priced
  totals, frozen offer terms, payout release as an edge function —
  client-trusted payment states were audited and removed.
- **Real-time + offline-capable worker tools:** year-round availability
  calendar with paint mode and federal-holiday presets, iCal import and
  subscription feeds, web-push dispatch with per-user subscriptions.
- **Privacy by design:** worker notes/receipts/identity documents are
  RLS-private; companies see only scoped aggregates; sensitive fields
  are kept out of AI prompts and client payloads.
- **Honest UX:** no mock data in production paths — audit passes
  removed fabricated integrations, fake notifications, and demo
  dashboards; every card reads live Supabase state.

## Maturity — honest status

Production-shaped, actively developed, in closed beta. Real payment
plumbing (Stripe Connect, webhook-signed events), real DB-enforced
invariants, real regression coverage, and a scripted 27-step live E2E
suite covering signup → waitlist claim → company setup → shift →
application → deal memo → marketplace checkout. Still pre-1.0: surfaces
are being iterated, third-party integrations (Google Calendar/Gmail via
One Connect) are in progress, and some features ship behind flags. See
`ROADMAP.md` and `docs/BACKLOG.md` for what's next and `TEST_PLAN.md`
for the verification approach.

## Contributing & security

See `CONTRIBUTING.md` for the workflow (small PRs, immutable
migrations, pgTAP for any RLS change). Report vulnerabilities privately
per `SECURITY.md` — this repo runs secret scanning in CI. Security
lessons from past audits are kept in `docs/agent-knowledge/`.

## Acknowledgments

- [Supabase](https://supabase.com/) — backend infrastructure
- [shadcn/ui](https://ui.shadcn.com/) — component system
- [Tailwind CSS](https://tailwindcss.com/)
- [Stripe](https://stripe.com/) — payments and Connect payouts
- [Resend](https://resend.com/) — transactional email
- [Pexels](https://www.pexels.com/) — stock imagery

## License

MIT — see `LICENSE`.
