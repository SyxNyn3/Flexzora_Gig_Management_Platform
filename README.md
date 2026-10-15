# Flexzora — Crew & Shift Operations Platform

[![CI](https://github.com/SyxNyn3/Flexzora_Gig_Management_Platform/actions/workflows/ci.yml/badge.svg)](https://github.com/SyxNyn3/Flexzora_Gig_Management_Platform/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6)](https://www.typescriptlang.org/)
[![Supabase](https://img.shields.io/badge/Supabase-Postgres%20%2B%20RLS-3ecf8e)](https://supabase.com/)
[![React](https://img.shields.io/badge/React-18%20%2B%20Vite-149eca)](https://react.dev/)

Gig-marketplace infrastructure for event production: staffing companies
post shifts, freelance crew claim and work them, and the platform carries
the operational weight between the two — scheduling, credentials, swaps,
rides, timesheets, IOUs, and payouts — with Postgres RLS as the security
boundary.

## Problem → Solution

| Operational pain | What Flexzora does |
|---|---|
| Crew calls/texts scattered across channels | Shift marketplace + broadcast alerts in one surface |
| "Who's actually certified for this?" | Credential records + `cert_review` workflow + swap-cert preview |
| Double-bookings and swap chaos | Fulfil-accept gate, one-active-ride-per-shift, swap immutability — enforced in DB constraints, not convention |
| Timesheets ≠ pay disputes | Company-side timesheet approval → Stripe Connect payouts, with offer terms frozen at acceptance |
| Re-keying spreadsheets | CSV import pipeline with field mapping, validation, and staging |
| Trust between strangers | Reliability/compliance scoring, portfolio profiles, public company pages |

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
              │ │ Postgres + RLS  │   │   Edge Functions (20+)  │ │
              │ │ 86 migrations   │   │ stripe-webhook · payout │ │
              │ │ pgTAP tests(27) │   │ push notify · ical sync │ │
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
(payout release, webhook intake, push sends) runs behind edge functions
with service-role credentials that never touch the browser. Invariants
that protect money and schedules — frozen offer terms, immutable swaps,
single active rides — are enforced as Postgres constraints and covered
by pgTAP tests that run in CI against a real local Postgres.

## Repo layout

```
src/pages/worker/    Shift marketplace, payouts, crew board, alerts
src/pages/company/   Events, roster, staff, timesheet approval,
                     broadcast, cert review, copilot, import/export
src/lib/             Domain modules: marketplace, crew, certs,
                     compliance, payments, push, broadcast, copilot
supabase/migrations/ Ordered schema history (86 migrations)
supabase/functions/  Edge functions (payments, push, ical, waitlist)
supabase/tests/      pgTAP database regression suite
docs/                Ops runbooks, agent log, backlog
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

`eslint` → `tsc --noEmit` → `vitest` → coverage → `vite build`
+ pgTAP suite on a live local Postgres
+ `gitleaks` over full history
+ `npm audit --audit-level=high`

> **Note:** an industry-agnostic rebrand (ShiftZora / RosterFlux) is in
> progress — the scheduling, matching, and rostering core is already
> vertical-neutral; healthcare, retail, and security staffing are the
> expansion targets.

## Maturity — honest status

Production-shaped, actively developed. Real payment plumbing (Stripe
Connect, webhook-signed events), real DB-enforced invariants, real
regression coverage. Still pre-1.0: surfaces are being iterated, the
Company Copilot is early, and some integrations ship behind feature
flags. See `ROADMAP.md` and `docs/BACKLOG.md` for what's next and
`TEST_PLAN.md` for the verification approach.

## Contributing & security

See `CONTRIBUTING.md` for the workflow (small PRs, immutable
migrations, pgTAP for any RLS change). Report vulnerabilities privately
per `SECURITY.md` — this repo runs secret scanning in CI.

## Acknowledgments

- [Supabase](https://supabase.com/) — backend infrastructure
- [shadcn/ui](https://ui.shadcn.com/) — component system
- [Tailwind CSS](https://tailwindcss.com/)
- [Pexels](https://www.pexels.com/) — stock imagery

## License

MIT — see `LICENSE`.
