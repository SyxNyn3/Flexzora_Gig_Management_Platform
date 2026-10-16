# Agent Knowledge Base

Collected, field-tested knowledge from real builds and security audits —
structured so it can later feed generated agent instruction files
(AGENTS.md, system prompts, skill packs, agent rule sets).

## Why this exists

Every vulnerability here was found on a real, production-bound system —
not from a checklist, but from auditing an actual Supabase + React +
Edge Functions app. Each entry captures:

- **What** the issue is
- **Why it happens** (the mechanism — the "nobody tells you this" part)
- **How to detect it** (queries / advisor lints / symptoms)
- **How it was fixed** (exact remediation applied)
- **Prevention rule** — the one-liner an agent should apply proactively

## Files

- `security-postgres-supabase.md` — Postgres/Supabase/RLS/PostgREST
  findings from the Flexzora launch audit
- `security-web-forms.md` — public form abuse defenses (honeypots,
  rate limits, first-write-wins)

## Format contract

Entries are written for machine consumption: predictable headings,
`Detection:` / `Fix:` / `Prevention:` fields, severity tags. When the
agent-instruction generator is built, each entry should map to a rule
in the generated AGENTS.md.
