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
9. **No silent deletes or moves.** Other sessions read this repo — a file you delete or relocate may be something another lane just went looking for. Rules:
   - Before deleting/moving anything tracked, `grep` for references to it (imports, paths, doc links) and check `git log` for who touched it last.
   - Prefer `git mv` over delete; prefer an `attic/` folder (committed, one commit) over either when something might still be wanted.
   - **Announce it**: same-commit note in `docs/AGENT_LOG.md` — `moved/deleted <path> → <destination | attic | gone> because <reason>`. If another session's worktree contains a file you're tempted to delete (scratch output, WIP), leave it alone — it's not yours.
   - Shared coordination files (`AGENT_LOG.md`, `BACKLOG.md`) are append/tick-only — never rewrite another lane's entries; correct by appending.
   - Worktrees are personal space: never operate in `../flexzora-*-wt` you didn't create; never `git restore`/`clean` a tree that isn't yours.

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

---


## Conventions worth knowing

- **Migrations are idempotent**: `CREATE TABLE IF NOT EXISTS`,
  `DROP POLICY IF EXISTS` before `CREATE POLICY`, `CREATE OR REPLACE FUNCTION`,
  `DROP TRIGGER IF EXISTS` before `CREATE TRIGGER`, enum creation guarded by
  `pg_type` lookup. Verified by replaying `supabase db reset` twice.
- **RLS helpers** (from `20260928220000_marketplace_core.sql`):
  `current_profile_id()`, `owns_company(id)`, `owns_event(id)`,
  `owns_shift(id)`, `worker_can_see_shift(id)`, `is_party_to_shift(id)`.
  `profiles.id` ≠ `auth.uid()` — join via `profiles.user_id`.
- **Seed** lives in one `do $$` block, fixed UUID prefixes
  (`1111` users, `2222` company/venue/event, `3333` shifts, `4444` gigs,
  `5555` crew objects, `6666` company-OS objects), every insert
  `on conflict do nothing`.
- **Feature flags** via `import.meta.env.VITE_*` — new surface area that's
  incomplete or provider-dependent ships behind a flag
  (`VITE_ENABLE_COPILOT`, `VITE_ENABLE_GOOGLE_AUTH`, …).
- **Sweep-on-read** instead of cron: time-based promotions run as RPCs the
  page calls on load (`promoteStaleRosterShifts` pattern), so a quiet company
  never pays for a scheduler.
- **Dedupe keys** on generated rows (alerts, auto-tasks): generation is
  idempotent and re-running a sweep never double-creates.
- **Don't add deps lightly**. The wizard needs XLSX/PDF parsing
  (`xlsx`, `pdfjs-dist`) — lazy-load them inside the wizard chunk so the main
  bundle doesn't pay.
