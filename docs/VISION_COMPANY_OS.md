# Company OS — vision & spec

The company side of Flexzora replaces the spreadsheet-and-SMS stack a
production company actually runs on: an Excel crew sheet, a call-sheet PDF, a
group text, a paper timesheet clipboard, and a manager's inbox.

**Persona**: Dana, ops lead at a 40-person AV/production shop. She books
30–150 freelancers a week, has three internal coordinators, and her "system"
is `crew_master_FINAL_v9.xlsx` plus group texts. Every competitor asks her to
re-enter that data by hand before it does anything useful.


The killer onboarding promise: **"Upload everything you have — spreadsheets,
docs, tribal knowledge — and Flexzora builds your operation."** Flexzora wins
production companies by fixing what every incumbent gets wrong.

## Competitor findings (what they do, where they fall short)

| Product | What it does well | The gap we exploit |
|---|---|---|
| **Lasso** | Crew database + onboarding + payroll for big tours | Enterprise-priced, months of onboarding; no marketplace; import is a guided services engagement, not self-serve |
| **Rentman** | AV rental + crew scheduling, strong call sheets | Rental-first, crew feels bolted on; CSV import needs exact templates; no in-app delivery log for mass comms |
| **Rosterfy** | Volunteer workforce scheduling + comms at festival scale | Volunteers, not paid crew with rates/certs; no escrow or timesheets |
| **CrewCard / Live Force** | UK-style crew booking + availability | UK-market SMS workflows; no verified credentials; calendar export is a static file, not a feed |
| **Spreadsheets + SMS (the incumbent)** | Zero cost, infinite flexibility | No source of truth, no audit trail, version chaos, reminders live in Dana's head |

Common thread: **nobody eats the spreadsheet.** Every tool assumes you'll
re-type your crew into their schema. The Upload Wizard is the wedge — parse
whatever Dana already has, map it with an LLM, review once, import.
### User-level complaints (researched)

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


## Quality bar

Not the simplest version — the version Dana would pick over her spreadsheet.

- The upload wizard is *drag-drop smooth*: drop file → parse → columns
  auto-map → **one** review screen with inline edits → import. No second
  wizard steps, no "download our template first."
- The copilot *reads data safely* (parameterized RPCs, never raw SQL) and
  *previews every action* — nothing writes until Dana clicks confirm.
- Every feature ships flag-gated if it depends on an external provider.
- Match the existing design language (shadcn cards/tables/dialogs, muted
  palette, `money`/date formatting helpers) and seed demo rows so a fresh
  `supabase db reset` shows the feature working, not an empty state.



## The build queue

### 1. AI Upload Wizard — `feat/import-wizard`

`import_jobs` / `import_rows` + `/import` wizard.

- **Targets** (registry pattern — each target declares columns, validators,
  inserter): `venues`, `shifts` (call sheets into a chosen event),
  `preferred_rosters` contacts (match by email/username; unmatched → staff
  candidate), and `staff_members` once the staff layer lands.
- **Parse**: CSV client-side (quoted/multi-line aware), XLSX via `xlsx`,
  PDF via `pdfjs-dist` text extraction → line-based table guess. Both libs
  dynamic-imported inside the lazy wizard chunk.
- **Map**: LLM via OmniRoute `http://localhost:20128/v1` (OpenAI-compatible
  `chat/completions`, `VITE_OMNIROUTE_URL` override; absent/unreachable →
  heuristic fallback: header fuzzy-match + sample-value sniffing, e.g. a
  column of `$34.00` values maps to `hourly_rate`). Mapping persisted on the
  job so re-imports of the same file format are one-click.
- **Review**: one screen — spreadsheet grid, per-row status (ready/warning/
  error), inline cell edit, select-all/none, commit progress. Validation is
  server-side truth client-side-mirrored: required fields, FK resolution
  (skill names → `skills`, cert codes → `certification_types`), dup detection
  against existing rows.
- **Commit**: bulk insert in batches; per-row `entity_id` recorded; failed
  rows stay `error` with the DB message — exportable as a fix-and-retry CSV.
- Job history on `/import` so Dana sees "October riggers.csv → 38 venues,
  2 errors."

### 2. Company Copilot — `feat/company-copilot`

`company_docs` + copilot drawer/panel, flag `VITE_ENABLE_COPILOT`.

- `company_docs`: pasted notes/docs (rate cards, venue intel, union rules) —
  free-text with title/tags; this is the copilot's unstructured context.
- **Reads** are a fixed catalog of safe, parameterized queries
  (`unfilled_calls`, `crew_confirmed_for_shift`, `budget_status`,
  `cert_expiring`, `timesheets_pending`, `upcoming_events`) — each a service
  method returning typed rows, never free-form SQL. Intent routing: LLM when
  OmniRoute is up, keyword classifier fallback (same pattern as the wizard).
- **Actions** render a preview card first — draft broadcast, add roster tier,
  create ops task — with the exact write it will perform. Confirm executes;
  the action log lives on the copilot message row.
- `copilot_messages` history per company so the panel survives reloads.

### 3. Staff layer — `feat/staff-layer`

`staff_members` / `staff_assignments`.

- `staff_members`: internal salaried people (PMs, coordinators, crew leads,
  office) — `company_id`, name, email, phone, `staff_role`, optional
  `profile_id` when they also have a platform account, `active`.
- `staff_assignments`: staff member × event (optional shift) + `duty`
  (show-caller, crew boss, deck PM…) — the non-paying positions on a call
  sheet.
- Unified show view: `EventDetailPage` gets a Staff column alongside crew so
  the whole call sheet reads in one place; staff count on event cards.
- The wizard gains a `staff` import target (the single most common
  spreadsheet a production company has).

### 4. Broadcast messaging — `feat/broadcast`

`broadcasts` + `broadcast_recipients` delivery log.

- Compose on a dedicated surface reachable from events/roster: audience =
  all crew | per-event | per-shift | roster tier | staff. Live recipient
  count while picking.
- Delivery = `notifications` row per recipient (rides the existing
  NotificationCenter + realtime) + `broadcast_recipients` log with
  per-recipient status (queued/delivered/failed/read) so "who actually saw
  the 6am call change" is answerable.
- Broadcast body supports `{name}` `{shift}` `{venue}` `{calltime}` merge
  fields; preview shows resolved text.

### 5. ICS feed + timezone — `feat/ics-timezone`

- `events.timezone` (IANA name, default `America/Los_Angeles`, editable in
  EventForm); all event/shift surfaces show local venue time + TZ abbrev.
- `calendar_feeds`: signed-token feeds — company-wide (all shifts) and
  per-worker (their confirmed calls). Token rotatable; revoking kills the
  URL.
- `ics-feed` edge function (`--no-verify-jwt`, token-bearer): emits
  `VCALENDAR`/`VEVENT` per shift — `DTSTART;TZID=`, venue address as
  `LOCATION`, role + confirm status in `DESCRIPTION`. Subscribe links
  (`webcal://` + copy URL) on events + worker schedule. It updates because
  it *is* the DB — add a call and every subscriber's calendar refreshes.

### 6. Ops kanban — `feat/ops-kanban`

`ops_tasks` + `/ops` board.

- Columns `todo | doing | done`; card = title, linked event/shift, assignee
  (staff member or company owner), `due_at`, `priority`, `source`
  (`manual` | `auto`).
- **Auto-cards**: sweep RPC `ensure_unfilled_call_tasks` (called on board
  load — sweep-on-read, no cron) creates an `urgent` card for every open
  call inside 72h with `confirmed < headcount`, dedupe-keyed per shift;
  auto-completes when the call fills.
- Drag between columns (HTML5 DnD, same feel as RosterBoard lanes),
  `@assignee` chips, per-event filter.

### 7. Tour exports — `feat/tour-exports`

- `/exports`: pick event range → generate full crew list + schedule →
  **CSV** (flat, Excel-ready: event, day, call, role, worker, rate, status,
  contact) and **PDF** (jspdf + autotable — per-event section, day-by-day
  call-sheet grid, staff + crew unified, footer with generated-at + company).
- This is the "print the packet for the truck" button — works on any date
  range, any subset of events.

### 8. Auto-reminders — `feat/company-reminders`

`company_alerts` + one alerts inbox on the company side.

- Kinds: `shift_call` (call inside 24h not fully staffed — from the same
  sweep as kanban), `cert_expiry` (roster crew cert expiring 30/14/7d),
  `unfilled_call`, `timesheet_pending` (submitted sheets awaiting approval —
  trigger on insert + daily escalation), `custom`.
- `company_alerts` mirrors the `crew_alerts` design: dedupe keys, `read_at`,
  no delete (audit trail), company-scoped RLS.
- Inbox: `/alerts` page + unread badge; deep links (`action_url`) into the
  shift/timesheet/event it concerns. Also fan out to `notifications` for the
  bell when a transport exists.

## Non-goals (this sprint)

- Real email/SMS transport — delivery = in-app `notifications` + log; Twilio/
  Resend land behind flags when keys exist.
- Multi-user company accounts / roles inside a company — `staff_members` are
  records, not logins (v2: invite → `profile_id` link + member RLS).
- Copilot free-form SQL / schema exploration — fixed safe catalog only.
- ICS two-way sync — the feed is publish-only; edits come back through the app.
