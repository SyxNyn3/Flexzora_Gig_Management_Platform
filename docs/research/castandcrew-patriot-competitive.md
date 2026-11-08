# Competitive teardown: Cast & Crew + Patriot Software

Date: 2026-12-17. Sources: castandcrew.com product pages, Cast & Crew support
KB (Live Entertainment Onboarding FAQ, New Experience FAQ), patriotsoftware.com
payroll + Time & Attendance pages, help center articles. Every claim below is
from their public marketing/docs — feature *existence* is verified, depth is
not (we can't see inside the product).

## What these companies actually are

**Cast & Crew** is not a marketplace — it's the incumbent **employer-of-record
payroll + crew-ops layer** for film/TV/live events. Revenue comes from payroll
processing fees, not SaaS seats. Their moat is regulatory: they file taxes,
handle workers' comp, unemployment, union reporting, and W-2/1099 classification
liability so production companies never touch it. The crew app (MyCast&Crew)
is free to workers because the money is in payroll.

**Patriot Software** is a general SMB payroll + Time & Attendance product
(per-employee pricing, usage-based). Not live-event-specific, but its timecard,
per-diem, mileage, and reimbursement features map directly onto what crew
workers deal with — worth stealing the *patterns*, not the positioning.

## Feature matrix vs Flexzora today

| Capability | Cast & Crew | Patriot | Flexzora today |
|---|---|---|---|
| Shift/call marketplace | offers (Start+) | — | ✅ shifts, crew board, swaps, pools |
| GPS clock-in/out | ✅ | ✅ geotag | ✅ |
| Digital timecards | ✅ Hours+ (autofill, copy-day, batch approve) | ✅ | ⚠️ timesheets exist; no autofill/bulk |
| Approval chains | ✅ configurable multi-level | manager approve | ⚠️ single-step company approve |
| Union pay rules engine | ✅ automated calc | custom OT rules | ✅ overtime_rules + union packs |
| Per diem | ✅ native | ✅ nontaxable money type | ⚠️ manual ledger entry only |
| Mileage reimbursement | ✅ | ✅ | ⚠️ manual ledger entry only |
| Expense reimbursements | ✅ searchable, receipt attach | ✅ | ❌ no workflow (ledger notes only) |
| PTO / time-off balances | — | ✅ | ❌ |
| Multiple pay rates per worker | ✅ contract-based rate filtering | ✅ up to 25 rates | ⚠️ single rate context per gig |
| Digital onboarding packet | ✅ Start+ (e-signed offers, LOAs, union docs) | self-onboarding forms | ⚠️ checklist + vault, no e-sign/docs |
| Pay stubs / YTD pay | ✅ MyCast&Crew | ✅ My Patriot | ⚠️ earnings PDF/CSV, no pay-stub view |
| Tax docs (W-2, withholding) | ✅ | ✅ | ❌ deliberately (no SSN collection) |
| Employer-of-record payroll | ✅ core business | ✅ core business | ❌ deliberate — 1099-only, no custody |
| Secure file transfer | ✅ Studio+ | — | ❌ |
| Union signatory reporting | ✅ | — | ❌ |
| Loan-out (LOA) support | ✅ | — | ❌ |
| Business reporting/BI | ✅ Reporting+ (cost reports, Point Zero) | reports | ⚠️ exports only |
| Push/SMS notifications | ✅ | nudges | ✅ (just fixed dispatch) |
| Worker-owned portable record | ❌ portal-tied | ❌ | ✅ ledger + vault = the differentiator |
| Crew-to-crew marketplace | ❌ | ❌ | ✅ just shipped |
| Escrow-backed calls | ❌ | ❌ | ✅ funded deposits |

## The strategic read

Their advantages are **money-infrastructure advantages**: payroll filing,
workers comp, tax docs, e-signed union paperwork. Those require either being a
payroll company (licenses, bonds, liability) or integrating one. We will not
out-Cast&Crew at EOR payroll — and shouldn't try; it's a different business
with different risk.

Our wedge stays what the landscape doc already found: **worker-owned
portable records + crew-to-crew liquidity + honest pay transparency**. The
gaps below are ranked by (worker value × our architecture fit × effort).

## Backlog — what to build, in order

### Tier 1 — close the obvious holes (high value, fits existing schema)

1. **Timesheet autofill + bulk approve** (Hours+ pattern). Copy previous
   day's hours, bulk-approve a dept's sheets, "nudge" reminders for missing
   timecards. We have the timesheet/approval skeleton; this is UX + one RPC.
2. **Expense reimbursements with receipts.** Crew front cash for expendables
   (gels, batteries, parking) and get repaid. Ledger already tracks
   `expense_extra`; what's missing is receipt photo attach (compliance-docs
   bucket pattern exists) + company-side approve/deny + repayment flag on
   the invoice. Patriot's "Expense Reimburse" nontaxable money type is the
   model — reimbursement ≠ income.
3. **GSA per diem rate lookup.** CONUS per diem tables are public JSON;
   cache monthly, auto-fill ledger entries by work location. Upgrades the
   manual per-diem entry into one-tap accuracy. (Already on the roadmap.)
4. **Mileage automatic calc.** OBD/manual mile entry × IRS rate, exported
   in a payroll-acceptable CSV. (Already on the roadmap.)
5. **PTO / time-off balance tracking.** Per-company accrued/scheduled time
   off. Union contracts and company policies grant PTO; workers currently
   have nowhere to see it. New small table + balance view — cheap, visible.

### Tier 2 — the paperwork moat (what companies actually pay C&C for)

6. **Digital offer letters / deal memos with e-signature.** Start+ is C&C's
   wedge: crew signs the offer digitally, rate/terms frozen (we already
   have `offer_terms_frozen` from Lane A!). Extend: generate a PDF deal
   memo from the shift/offer terms, capture signature (typed/canvas),
   store signed doc in compliance vault. This is the single biggest
   "they have it, we don't" gap that isn't payroll.
7. **Loan-out agreement (LOA) support.** Many 1099 crew work through their
   own LLC — the LOA is the document that makes it clean. Generate LOA
   template, track which workers are loaned-out, flag on invoices. Directly
   serves our 1099 positioning.
8. **Multi-level approval chains for timesheets.** Dept head → production
   → accounting. Currently single-step; configurable chain per company.
9. **Union signatory reporting export.** Union locals require work-call
   reports (who worked, what classification, hours). We have the data;
   generate the report in each local's format. High pain, real lock-in —
   but needs per-local format research (phase it: IATSE locals first).

### Tier 3 — portal polish + money visibility

10. **Pay stub / YTD earnings view.** Worker sees per-job stub (gross,
    fees, net, deductions) + YTD totals — the MyCast&Crew equivalent
    without touching tax docs. Builds on existing invoice/earnings data.
11. **Point Zero style "cost before payroll" report** for companies —
    projected labor cost per event before invoices cut. We have timesheets
    + rates; it's a rollup query + PDF.
12. **Secure file transfer (call sheets, scripts, deal docs).** Private
    bucket + per-event sharing + expiry. compliance-docs bucket is the
    pattern; needs event-scoped share links.
13. **Multiple pay rates per worker.** Rate card per worker (dolly vs.
    best boy vs. craft service) selected at booking. Schema change on
    assignments — medium effort, real accuracy win.
14. **Expense/reimbursement workflow** (see #2) and **receipt OCR** later
    via the Rust service the user wants — receipt → line items.

### Explicitly NOT copying

- **Employer-of-record payroll / W-2 / tax filing** — different business,
  different liability. Our honest 1099 positioning is the differentiation;
  companies needing W-2 crews use C&C or a payroll provider and that's fine.
- **SSN/bank-account collection** — stays out (custody risk finding).
- **Union reporting submissions** — we export data; the local union's own
  portal or the signatory company files. Don't become a filing agent.

## Recommended next slice

#6 (digital deal memo + e-sign) is the highest-leverage item: it converts
our existing offer/terms machinery into the artifact companies actually
need before crew walks on set, it's worker-visible value (signed copy in
their vault), and it doesn't require payroll infrastructure. Pair it with
#1 (timesheet autofill/bulk) since both live on the same approval surfaces.

#2/#3/#4 are the "money the worker is owed" cluster — same theme as the
ledger, natural continuation.
