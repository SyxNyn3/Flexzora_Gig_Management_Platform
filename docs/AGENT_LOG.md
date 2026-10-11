# Agent Log

Running ledger for the Flexzora overnight build. Newest entries first.
Each entry: lane, branch/PR, what shipped, verification status, notes.

---

## Builder-2 — Company OS sprint (overnight)

### feat/company-copilot → PR #55 — Company Copilot

- `company_docs` + `copilot_messages` + `copilot_query`: whitelisted
  SECURITY DEFINER read catalog (unfilled_calls, upcoming_events,
  cert_expiring, timesheets_pending, budget_status, crew_for_shift) that
  re-verifies owns_company and rejects unknown kinds.
- Intent routing: pure regex router (vitest-covered) answers instantly;
  OmniRoute LLM only disambiguates failures and only returns a catalog
  kind + ids resolved from context — the model never sees the database.
- Every action is a preview card: "remember that…" confirms into
  company_docs; "text the crew…" renders a broadcast draft (copy-out
  until the broadcast lane lands). Rows snapshot onto the message row.
- Flag-gated (VITE_ENABLE_COPILOT): nav item + /copilot route redirect.
- Shared OmniRoute client extracted to src/lib/llm.ts; import wizard
  refactored onto it. Seed: 3 demo company docs.

### feat/import-wizard → PR #53 — AI Upload Wizard

- `import_jobs`/`import_rows` + `commit_import_job` SECURITY DEFINER RPC:
  walks ready/warning rows, per-row exception capture, re-runnable.
- Targets via a client registry (fields/aliases/sniffers): venues, shifts
  into a chosen event (live events → roster wave, mirrors createShift),
  roster contacts matched by email/username. `staff` enum reserved.
- Parse: hand-rolled CSV (quotes/multiline/delimiter sniff), read-excel-file
  for XLSX, pdfjs-dist positional-text→table extraction for PDF call sheets.
  Both dynamic-imported in the lazy /import chunk.
- Map: OmniRoute LLM (VITE_OMNIROUTE_URL, 8s timeout) merged over a
  heuristic scorer (alias/substring/value-sniff); user edits always win.
- Review: one grid — inline edits, status pills, filters, include toggles,
  failed-rows CSV export, job history reopen.
- Schema fix along the way: venues.lat/lng nullable; `validate_clock_event`
  NULL-geo hole closed (was verifying punches with no GPS check).
- Seed: demo job in history (1 imported, 1 fixable error row).
- Verification: CI (no local Node/Deno).

### chore/builder2-claim → PR #17 — lane claim + missing spec docs

- Claimed the Company OS lane in BACKLOG; Company OS section added to main's
  backlog (it only existed on the Crew OS stack before).
- Wrote the two docs the backlog referenced but nobody had created:
  `docs/OVERNIGHT_OPS.md` (the lane loop + repo conventions) and
  `docs/VISION_COMPANY_OS.md` (persona, competitor findings, per-feature spec,
  quality bar, non-goals).
- Working from `../flexzora-builder2` worktree — another lane has uncommitted
  Connect-payouts work in the main checkout (`20261017` migration taken;
  Company OS uses `20261018`+).
- No local Node/Deno — CI verifies lint/typecheck/vitest/build per PR.

---
