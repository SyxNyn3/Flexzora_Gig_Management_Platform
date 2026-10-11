# Flexzora Company OS — The Production-Company Side

Flexzora wins production companies by fixing what every incumbent gets wrong.
The killer onboarding promise: **"Upload everything you have — spreadsheets,
docs, tribal knowledge — and Flexzora builds your operation."**

## What the competition does wrong (researched, real complaints)

| Competitor complaint | Source | Flexzora answer |
|---|---|---|
| "Too many clicks to get one thing done" | LASSO users | Action-dense UI: every screen answers "what needs my decision NOW" |
| Heavy training just to get started | LASSO, most tools | AI import — no blank-canvas setup, no training week |
| Onboarding/data entry is tedious | LASSO, all | Upload wizard: Excel/CSV/docs → mapped → imported |
| No automatic reminders; craft emails per event | LASSO | SmartAlerts generate per-shift briefings automatically |
| No admin mobile app — browser only | LASSO | Mobile-responsive admin: approve timesheets from a phone |
| Can't export a whole tour's crew list | LASSO | One-click tour/event exports (CSV + PDF) |
| Calendar sync doesn't reliably update | LASSO | Real ICS feed + Google/Outlook subscribe links that stay current |
| Rate breakdowns inconsistent; timesheets need cleanup before ADP | LASSO | Clean structured rates; payroll-ready export per event/period |
| Can't mark worker unavailable when arranged off-platform | LASSO | Admin can set worker availability/notes on their behalf |
| No multi-timezone support | Deputy, Shiftboard | Venue-local timezone stored per event — touring crews span zones |
| GPS/timeclock errors → manual fixes | Deputy, Nowsta | Geofence + sustained-exit rules (already built); dispute flow |
| "Devalues skilled labor, treats techs as commodities" | LASSO freelancer | Crew OS layer — workers are people, not headcount (the brand) |
| Opaque/expensive pricing | Nowsta, LASSO | Free tier for small companies = wedge into the market |

## 1. AI Upload Wizard — "upload everything, AI sorts it"

`/company/import` — drag a folder of XLSX/CSV/PDF/docs → the wizard:
1. **Parse**: `xlsx`/CSV sheets, PDF tables, doc text.
2. **AI mapping**: LLM call (via local OmniRoute `localhost:20128/v1` — free
   models, no external key needed; falls back to OpenRouter when configured)
   maps each sheet/doc to domain entities: workers, skills, certs, rates,
   venues, staff, historical events.
3. **Review screen**: side-by-side preview — "we found 84 workers, 12 venues,
   3 pay-rate tables" — user confirms/edits column guesses.
4. **Import**: bulk insert + report (imported/skipped/conflicts).

Schema notes: `import_jobs(id, company_id, file_meta, status, summary jsonb)` +
`import_rows(job_id, entity, payload jsonb, status, error)` — resumable and
auditable. Never trust-import silently; the review screen IS the trust.

## 2. Company Knowledge Base + Copilot

- Uploads land in `company_docs(id, company_id, title, content_text, embedding)`
  — SOPs, handbooks, rate cards, venue notes, past crew sheets.
- **Copilot panel** on the company dashboard — two powers:
  - **Ask**: "Who's ETCP-certified and free Nov 12?" / "What did we pay
    riggers at the amphitheater last fall?" — RAG over `company_docs` +
    structured queries over tables (function-calling style: copilot emits
    query params, app executes safe read queries, LLM narrates).
  - **Do**: "Message everyone on Saturday's call that load-in moved to 7 AM"
    → drafts the broadcast → human hits send. Actions always preview-first.
- OmniRoute = the inference path; flag `VITE_ENABLE_COPILOT`.

## 3. Staff layer (not just worker roster)

`staff_members(id, company_id, user_or_placeholder, role, department, phone, pay_type)`
`staff_assignments(staff_id, event_id, role_on_event)`

PMs, coordinators, shop staff — the people who *run* events but never appear
in the worker roster. Same roster/alert/messaging surfaces as crew, different
lens. "Who's on this show" = crew + staff in one view (competitors silo them).

## 4. Parity features (table stakes — the checklist)

- **Broadcast messaging**: to crew AND staff, per-event/per-shift/all —
  one compose box, delivery log. (Messaging to *everyone*, not just workers.)
- **Real calendar sync**: `/.well-known/flexzora.ics?token=` per company +
  per-worker — subscribe link that actually updates (LASSO's #1 complaint).
- **Multi-timezone**: `events.timezone` — display venue-local, convert for the
  traveler's home zone ("6:00 AM venue time / 4:00 AM your time").
- **Automatic reminders**: shift reminders, cert-expiry warnings, unfilled-call
  alerts, timesheet-pending nudges — no manual crafting.
- **Tour-level exports**: one click → full crew list + schedule per event
  range (CSV/PDF) — the thing LASSO can't do.
- **Ops kanban / prioritization**: `ops_tasks(id, company_id, event_id, title,
  status, priority, assignee_staff_id)` — a board for the internal team:
  unfilled calls auto-create urgent cards.
- **Alerts inbox**: every warning lands in one feed — fill %, budget drift,
  certs expiring on booked workers, unanswered offers.

## Build order (tonight's lanes)

1. Import Wizard schema + parse/mapping service (copilot-safe fallback: column
   heuristics if LLM endpoint absent)
2. Company Copilot panel — read-side first (safe queries), action previews
3. `staff_members` + staff view on rosters + broadcast to staff
4. Broadcast messaging (crew+staff) + delivery log
5. ICS feed + timezone field on events
6. Ops kanban with auto-cards from unfilled shifts
7. Tour-level export (CSV)

## Quality bar

- **Flow must be smooth** — the wizard is the product's first impression:
  drag-drop, progress, plain-English results. If mapping needs a decision,
  ask ONE question, not five.
- Creativity beyond parity — adjacent wins like "auto-suggest crew from last
  year's same-event roster" are the things that make people switch. Build
  smart, note deeper ideas in BACKLOG.
- Every feature: migration + RLS (`company_id` scoping — companies only see
  their own data) + demo data + tests on logic.
