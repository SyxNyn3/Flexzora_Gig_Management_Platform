# Flexzora — project rules

## What this is

Crew OS / Company OS for live-event production. React + TS + Vite +
Tailwind frontend (`src/`), Supabase backend (`supabase/`): Postgres +
RLS + PostgREST RPCs + Deno edge functions. Deploys to GitHub Pages via
`deploy-pages.yml` (main → flexzora-live → flexzora.com).

## Non-negotiables

- **No mock data.** Every production-facing path reads/writes live
  Supabase. Debug routes (`?cards`, `?pain`, `?frame`) stay dev-gated
  (`import.meta.env.DEV`).
- **Migrations are additive** and mirrored: anything applied to remote
  (project `qgjtrosadftjrplubjaw`) gets a file in
  `supabase/migrations/` in the same change.
- **Waitlist writes** go through `submit-waitlist` (edge fn) +
  `waitlist_fill_crew_card` (RPC) — never direct table inserts. The
  sanitize trigger owns server fields.
- **Anonymous surface is whitelisted**: 4 public RPCs +
  `verify_jwt=false` functions. Anything new needs explicit
  justification + abuse guards before shipping.
- **`docs/agent-knowledge/`** — the security lessons ledger. Add an
  entry when a new vulnerability class is found or fixed; the entries
  are source material for generated agent instruction files.
- **`docs/LAUNCH_CHECKLIST.md`** — the readiness ledger. Update it when
  verified/blocked status changes.

## Access notes

- Remote MCP (`supabase-remote`) is read-only; writes go through the
  session pooler (see `.diffui/pgprobe/run-sql.js`) with
  `SUPABASE_DB_PASSWORD`, or the Management API with a valid
  `SUPABASE_ACCESS_TOKEN` (PAT — expires, rotate in dashboard).
- `SUPABASE_ACCESS_TOKEN` must be a fresh `sbp_` PAT for
  `supabase functions deploy` / `db push`.

## Conventions

- `tsc -b`, `eslint`, `vite build` are the check trio — all must pass.
- Landing page: backstage-industrial crew-first design; pain-led copy,
  features revealed via expandable cards. Assets: `public/landing/`,
  collage sprites cropped via CSS `background-size`/`position`.
- Waitlist crew card: unlimited history lists (markets, employers,
  areas, businesses, vehicles); only top-3 favorite markets are capped
  — the UI says so.
- `.diffui/` is local scratch (gitignored): payloads, screenshots,
  probe scripts.
- `.devin/skills/` holds vendored skills (currently `unslop` — run it
  over commit messages and user-facing docs).
