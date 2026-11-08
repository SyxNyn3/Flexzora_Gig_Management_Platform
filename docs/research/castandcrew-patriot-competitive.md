# Competitive teardown: Cast & Crew + Patriot Software + Found

Date: 2026-12-17 (Found added same day). Sources: castandcrew.com product pages, Cast & Crew support
KB (Live Entertainment Onboarding FAQ, New Experience FAQ), patriotsoftware.com
payroll + Time & Attendance pages, help center articles, found.com product
pages. Every claim below is
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

**Found (found.com)** is different again: it's a **fintech back-office for
1099 small-business owners** — business checking, bookkeeping, invoicing,
contractor payments, and tax tooling in one app. 750K+ users, 4.8★ app store.
Critically for us: its target customer is *exactly* our worker — the
independent contractor who gets 1099'd and has no employer handling taxes.
Where C&C sells to companies and Patriot sells to employers, Found sells to
the worker directly. That's the closest competitor to our worker-side wedge.

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
| Tax set-aside (auto reserve for quarterly taxes) | ❌ | ❌ | ❌ |
| Quarterly estimated-tax reminders/calculator | ❌ | ❌ | ❌ |
| 1099-NEC generation + e-file (payer side) | partial | ❌ | ❌ |
| W-9 collection | status tracking only | — | ⚠️ status tracking, no collection |
| Mileage tracking | ✅ | ✅ | ⚠️ manual ledger entry only |
| Receipt scanning → expense categorization | ✅ | — | ❌ |
| Business banking / bookkeeping | ❌ | payroll-adjacent | ❌ deliberately |
| AI finance assistant | ❌ | ❌ | ⚠️ copilot is company-side ops |

## The strategic read

Their advantages are **money-infrastructure advantages**: payroll filing,
workers comp, tax docs, e-signed union paperwork. Those require either being a
payroll company (licenses, bonds, liability) or integrating one. We will not
out-Cast&Crew at EOR payroll — and shouldn't try; it's a different business
with different risk.

Found is the mirror image: it owns the **worker's financial life** — banking,
bookkeeping, tax set-asides, 1099 paperwork. It has no concept of shifts,
crews, call times, or production. It can't tell a worker "you're owed $340
for Tuesday's call and the company hasn't paid" because it never sees the
work. **That gap is us.** Our ledger knows what crew are owed per job;
Found knows how to keep taxes set aside and paperwork filed. The two products
interlock more than they compete — but every quarter-tax feature we ship is
a feature Found already does well for generic 1099s, so we have to do it
*with production context* (per-diem rates by locality, union scale
anchors, per-job earnings) or not at all.

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

### Tier 4 — the Found gap: worker tax readiness (1099 crew's real pain)

Found's whole product is "the 1099 worker's back office." Crew are the
the purest 1099s — no employer, irregular income, per diem + mileage +
reimbursements all mixed together. What they do that we don't:

15. **Tax set-aside tracking.** Worker sets aside X% of each payment
    (Found auto-moves it to a "tax pocket"; we can't move money, but we CAN
    show the set-aside balance per payment — ledger entry type
    `tax_setaside`, auto-suggested rate, running balance). No custody,
    just visibility — fits our no-money rules.
16. **Quarterly estimated-tax reminders + safe-harbor calculator.**
    Jan/Apr/Jun/Sep deadlines, "you've earned $X YTD, set aside $Y,
    estimated payment ~$Z" using the 100%-of-prior-year / 90%-of-current
    safe harbor rules. Every figure cites IRS pub; this is the "teach
    workers what companies don't tell them" play at its best.
17. **1099-NEC payer-side data export.** Companies must file 1099-NEC for
    crew paid ≥$600. We hold the payment records — generate the CSV/PDF
    in the format their accountant or e-file provider wants. Doesn't file
    for them; hands them clean data. Big company-side value, cheap to build.
18. **W-9 collection decision.** Found collects actual W-9s. We currently
    track status only (deliberate — SSN custody risk). Middle path: let
    workers upload their own W-9 to the private compliance vault (they
    already can for other docs?) — worker-owned copy, company sees "W-9 on
    file" status only. Keeps custody with the worker, satisfies the
    company's need-to-know. Needs a product decision, not just code.
19. **Mileage + per diem auto-calc** (already Tier 1 #3/#4) — Found does
    generic mileage; ours should know IRS business rate AND GSA
    locality per diem AND union per-diem overrides. Production context is
    the differentiator.

### Explicitly NOT copying

- **Employer-of-record payroll / W-2 / tax filing** — different business,
  different liability. Our honest 1099 positioning is the differentiation;
  companies needing W-2 crews use C&C or a payroll provider and that's fine.
- **SSN/bank-account collection** — stays out (custody risk finding).
- **Union reporting submissions** — we export data; the local union's own
  portal or the signatory company files. Don't become a filing agent.
- **Business banking / bookkeeping** — Found's core. We're a ledger, not a
  bank; integrating with Found/QuickBooks exports beats building it.
- **Generic tax filing** — we calculate and remind; the worker's accountant
  or TurboTax files. Never give specific tax advice, always cite the IRS
  source and tell them to verify.

## Recommended next slice

#6 (digital deal memo + e-sign) is the highest-leverage item: it converts
our existing offer/terms machinery into the artifact companies actually
need before crew walks on set, it's worker-visible value (signed copy in
their vault), and it doesn't require payroll infrastructure. Pair it with
#1 (timesheet autofill/bulk) since both live on the same approval surfaces.

#2/#3/#4 are the "money the worker is owed" cluster — same theme as the
ledger, natural continuation.
