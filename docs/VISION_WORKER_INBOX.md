# Vision: The Universal Work Inbox

## The reframe

Flexzora is not (only) a marketplace. The original vision: **the single inbox where a
gig worker's entire work life lands** — offers, confirmations, call times, schedule
changes, payroll — regardless of which company sent it or which channel it arrived on.

This solves cold-start from the worker side: a worker gets value from Flexzora
**on day one, even with zero companies on the platform**, because it organizes the
work they already get through scattered email/SMS/texts.

## The endgame (the flywheel)

1. Workers join for the inbox → bring their work communications with them
2. Every connected email/roster reveals the production companies that hire them →
   Flexzora builds the company database for free
3. Certifications, ratings, work history, reliability data accumulate per worker
4. Flexzora can then **staff directly** — "Flexzora Crews": a vetted worker fleet
   any company can book, any size, any market. The platform becomes the agency.

## What already exists (do not rebuild)

- `gig_messages` + `gig_message_confirmations` — on-platform messaging WITH
  approve/confirm semantics (migrations/20261006181000)
- `GmailIntegration.tsx` — full gig-inbox UI, currently mock data only
- `authkit-token` edge function — Pica OAuth for Gmail connect (deployed; needs
  `PICA_SECRET_KEY` — free tier signup)
- `src/lib/llm.ts` — LLM plumbing for parsing unstructured email → structured offers
- `notifications` + push (VAPID live) — the alert channel for new inbox items
- `cert_reviews`, rosters, timesheets, earnings — the worker-data flywheel, already collecting

## Staged build

### Stage 1 — work_items table + unified inbox surface
One table aggregating: on-platform offers (gig_messages), forwarded/parsed emails,
manual entries. One worker-facing page: "Work Inbox" — approve/decline/confirm in
place. Reuse the existing GmailIntegration UI shell against real rows.

### Stage 2 — email ingestion
- **Gmail connect (Pica)**: worker clicks Connect → OAuth → `inbox-sync` edge
  function polls for gig-pattern mail (call sheets, confirmations, rate sheets) →
  LLM parses → files into work_items.
- **Forward-anything path**: needs a custom domain. Cloudflare Email Routing
  (free) forwards `anything@crew.flexzora.app` → edge function webhook. Worker
  gets a personal alias to hand to coordinators.

### Stage 3 — SMS ingestion
Hard honestly: workers' texts live on their personal numbers. Realistic paths:
- **Flexzora-issued work number** (Telnyx ~$1/mo/number) — "give companies your
  work number" is a feature, not a workaround. Defer until revenue.
- On-platform company texts already route through our notification layer.
- Manual forward/screenshot-paste as a stopgap.

### Stage 4 — Flexzora Crews (staffing desk)
Query layer over roster + cert reviews + reliability scores → "book 12 vetted
stagehands in Atlanta Friday" as a first-class company action.

## Explicitly deferred

- Real Stripe payouts (demo escrow covers pilots)
- Per-worker SMS numbers (needs revenue)
- Custom domain (unblocks forward-path + professional email)
