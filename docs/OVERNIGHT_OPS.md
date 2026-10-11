# OVERNIGHT OPS — Multi-Session Autonomous Charter

Standing orders for the unsupervised overnight build cycle (until ~10:30 AM).
Every session in this repo MUST read this file + `docs/BACKLOG.md` + `docs/PRD.md` + `docs/VISION_CREW_OS.md` + `docs/VISION_COMPANY_OS.md` first.

## The three lanes

| Lane | Role | Writes | Job |
|---|---|---|---|
| **Builder** | implements | code, tests, migrations | Claim → build → verify → PR → next item. Never idle. |
| **Reviewer** | reviews | PR comments, approvals, merge | Poll open PRs; review every diff for correctness/security/tests; merge only when CI is green + clean. |
| **Challenger** | red-teams | GitHub issues only | Pull latest `main`, try to break it: edge cases, RLS gaps, bad inputs, UX dead-ends. Files issues labeled `challenger` with repro steps. Never writes app code. |

Claim your lane in `docs/BACKLOG.md` before anything else: `(claimed: <name> — working on it)`.

## Non-negotiable rules

1. **Never commit to `main` directly.** Every change rides a `feat/*` or `fix/*` branch → PR → CI.
2. **Every push to `main` deploys publicly** (GitHub Pages). A merge is a release — treat it that way.
3. **Verify before every PR**: `npm run build && npm run lint && npm run test` all green, or the PR says exactly why not.
4. **Supabase**: additive migrations only. Never drop/rename columns or tables that hold data. Every destructive-looking change needs a guard comment explaining why it's safe.
5. **No secrets in git.** `.env.local` is machine-local; if a feature needs a new env var, document it in `.env.example` and `docs/`, never paste a key.
6. **Log everything.** Append to `docs/AGENT_LOG.md` — date, lane, what you did, what's next. This is how the next session picks up where you left off.
7. **Blocked? Don't wait.** Note the blocker in BACKLOG/AGENT_LOG, move to the next unclaimed item. Things that legitimately need the user: paid API keys (Stripe live, Twilio, Resend), OAuth app credentials, production DNS.
8. **Homepage feel is sacred.** Extend the design language; don't redesign it.

## The self-drive loop (what "stay busy" means)

```
while time remains:
  pick highest-priority UNCLAIMED backlog/PRD-gap item
  claim it → branch → build → verify (build/lint/test) → PR → log
  if nothing unclaimed:
    - review open PRs for correctness (even if not your lane)
    - hunt test-coverage gaps → write tests
    - reconcile PRD.md "Implemented in" claims vs reality → fix or update docs
    - improve docs/JSDoc on non-obvious domain logic (escrow, geofence, matchScore)
```

## Stop conditions (only reasons to halt)

- Everything on BACKLOG done AND PRD fully reconciled
- Hard blocker requiring user secrets/accounts (log it, keep going on other items)
- 10:30 AM

## Known hazards

- **OneDrive file locks** on `.git/objects` — if a fetch/push fails with permission denied, retry; if it persists, note it in AGENT_LOG.
- **Stray files `00`/`01`** duplicate a migration — safe to remove (was in backlog).
- **Edge functions aren't deployed** — Stripe/auth flows requiring them degrade gracefully; don't pretend they work.
- **Email verification is ON** — unconfirmed accounts can't log in; test flows must handle the check-email state.
