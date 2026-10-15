# Contributing to Flexzora

Thanks for your interest. This document covers the workflow we expect so
review stays fast.

## Ground rules

- **PRs under ~400 lines of diff** — split larger work into stacked PRs.
- **No secrets, ever.** `.env*` is gitignored and CI runs gitleaks.
  Config goes in `.env.example` (values stay empty).
- **Migrations are immutable.** To change shipped SQL, write a new
  migration — never edit a deployed one.
- **RLS is the security boundary.** Any new table needs a policy; any
  policy change needs a pgTAP test.

## Getting set up

```sh
npm install
cp .env.example .env.local   # fill in your own Supabase project keys
npm run dev
```

Local database (optional, needed for migration work):

```sh
supabase start               # local stack, replays migrations + seed
supabase test db             # pgTAP suite
```

## Before you push — the CI gate, locally

```sh
npm run lint                 # eslint
npx tsc --noEmit -p tsconfig.app.json   # typecheck
npm run test                 # vitest
npm run build                # tsc -b && vite build
supabase test db             # if you touched supabase/
```

## Branch & commit conventions

- Branches: `feat/<thing>`, `fix/<issue-or-thing>`, `docs/<thing>`.
- Commit style follows the repo history: `fix(scope): what and why`,
  `feat(scope): ...`, `docs: ...`, `chore: ...`. Imperative, one line
  headline, body explains *why* when it isn't obvious.
- Reference issues: `fix(#123): ...`.

## What makes a good PR

- One concern per PR.
- Tests for behavior changes — vitest for frontend/lib, pgTAP for
  anything touching RLS, triggers, or constraints.
- Update `.env.example` if you add an env var; update docs if you change
  a user-facing flow.

## Reporting bugs

Use the bug-report issue template — include repro steps, expected vs
actual, and which persona you were acting as (worker / company /
admin). For security issues see `SECURITY.md` — do **not** file
publicly.
