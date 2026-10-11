# Overnight ops — how the build lanes run

Two+ autonomous lanes work this repo in parallel overnight. This doc is the
shared operating agreement so nobody has to guess what the other lane did.

## Lanes

| Lane | Scope | Worktree |
|---|---|---|
| **Builder** | Crew OS sprint (`docs/VISION_CREW_OS.md`) + carry-over items | main checkout |
| **Builder-2** | Company OS sprint (`docs/VISION_COMPANY_OS.md`) — own lane only | `../flexzora-builder2` worktree |
| **Mark** | Cloud/manager: CI, review sweeps, automations | remote |
| **Tom** | Desktop: misc done | desktop |

Builder-2 owns the Company OS queue end to end: AI Upload Wizard → Company
Copilot → staff layer → broadcast → ICS feed + timezone → ops kanban → tour
exports → auto-reminders. Never touch items claimed by another lane; never
commit to `main`.

## The loop (per item)

1. **Claim** — mark the item `(claimed: <lane> — working on it)` in
   `docs/BACKLOG.md` before starting. Claims merge with the feature PR, so
   check open branches for the freshest backlog, not just `main`.
2. **Branch** — `feat/<name>` stacked on the previous Company OS branch so PR
   diffs stay reviewable. Migration timestamps `20261018`+ (Crew OS used
   `20261010`–`20261016`; `20261017` is Connect-payouts WIP).
3. **Implement** — migration (idempotent DDL, RLS policies, SECURITY DEFINER
   RPCs with pinned `search_path`, triggers) + types in `src/lib/types.ts` +
   service module (`src/lib/<area>/*.ts`, `Result<T>`/`ok`/`fail` convention) +
   UI matching the existing design language + demo rows in `supabase/seed.sql`.
4. **Verify** — no local Node/Deno on this machine; CI runs
   `eslint src` + `tsc --noEmit -p tsconfig.app.json` + `vitest run` +
   `vite build` per PR. Write code that passes on the first run: pure logic in
   testable units (see `iouMath.ts`/`matchScore.ts` pattern), Supabase calls
   behind the service layer.
5. **PR** — target the parent branch; describe what shipped, what's flag-gated,
   and the merge order.
6. **Log** — `docs/AGENT_LOG.md` entry (newest first), `docs/BACKLOG.md` item
   marked done with the migration/PR reference.
7. **Next** — pull the next unclaimed item in your lane. Blocked? Log the
   blocker in AGENT_LOG and move to the next item; never stop the lane.

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
