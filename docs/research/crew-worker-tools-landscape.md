# Crew-Worker Free-Tool Landscape — Failure-Mode Research

Date: 2026-11-07. Two parallel deep-research passes over Reddit, app-store
reviews, BBB/Trustpilot, industry press, and postmortems. Purpose: design
the free worker toolset so it doesn't repeat the failures that killed or
crippled every adjacent product.

## Executive summary

- Every incumbent monetizes the **production company / payroll provider**,
  never the worker. Worker-side tools that exist (CallTime, TV Timecard,
  ScenePaper, 1099Ledger, Keltek, ReceGuard, odostrada) are all tiny/new —
  the worker-owned niche is unclaimed but unproven.
- The winning worker pattern is NOT "free app" — it is **zero-friction,
  link/SMS-first, no account required, offline-tolerant, never asks for
  SSN/bank data, and portable across employers**.
- The deepest pains (late pay, unpaid wages, misclassification) are
  **leverage problems software can't solve** — but a worker-owned ledger
  that documents hours/expenses/payments creates evidence and portability
  no payroll company can offer (they structurally can't span competitors).
- "Free" is now genuinely differentiated: Wave paywalled bank feeds +
  receipt OCR in June 2026; QBSE died and its successor costs more with
  data-loss complaints; every competitor's #1 complaint is billing.

## Failure modes to design against

1. **Employer-portal fatigue** — workers already juggle a new portal per
   production (SmartStart, GreenSlate, Wrapbook, Start+). Anything that
   feels like "another employer login" gets ignored or resented.
   GreenSlate crew reviews literally say workers delete the app after wrap.
   → Our wedge: worker-owned account, portable across ALL productions,
   never employer-controlled.

2. **Platform trust / custody risk** — Axium's 2008 collapse froze $28M
   in payroll and left crew with bounced checks; Synapse (2024) froze
   thousands of fintech accounts; Cast & Crew phishing incident harvested
   direct-deposit credentials; Steady/Gig Wage/DasherDirect shutdowns
   stranded balances. Workers are primed to distrust apps that touch money.
   → Never custody funds, never store SSNs/bank data we don't need,
   export everything, document "your data stays yours."

3. **Connectivity** — unit bases and rural locations have no signal;
   production internet is a paid specialty service. Real-time-dependent
   tools fail on the exact sets they target.
   → Offline-first PWA + SMS fallback.

4. **Silent data loss** — the angriest reviews in receipt apps are about
   scans "poofing" with no error. QBSE→Solopreneur migration lost receipts
   and history. → Never silently drop; show storage state; export early;
   on-device originals optional.

5. **Seasonal engagement** — tax tools see Jan–Apr usage only. Retention
   requires a weekly-value hook (invoicing, mileage, payment chasing),
   not just year-end records.

6. **Billing dark patterns** — Keeper's two-tier billing, Invoice Simple's
   cancel-maze, MileIQ's auto-renew, QBSE's price hikes generate the most
   complaints in the category. → "Free forever, no card" is a real
   differentiator if we hold the line.

7. **Mileage auto-tracking is a minefield** — every auto-tracker (MileIQ,
   Everlance, Motus) has accuracy complaints: missed legs, commute
   misclassification, silent stop after OS updates, lost trips unrecoverable.
   Workers' own workaround is odometer manual entry. IRS rate is now
   date-dependent (mid-year changes).
   → Manual/odometer-first with optional assist; audit-proof export.

8. **Per diem complexity** — GSA CONUS/locality rates, tax-home definition,
   itinerant-worker trap, accountable-plan substantiation. Most gig apps
   ignore it entirely; film/trades crew getting flat stipends face
   recharacterization risk on audit. Underserved niche.

9. **1099 threshold whiplash** — federal NEC rose to $2,000 (2026) while
   1099-K phases to $600 by 2027; states diverged ($600 CA/MA/OR/VT,
   $1,000 NJ). 73% of gig workers didn't know the threshold changed.
   → Threshold explainer/tracker has real search demand.

10. **1099 reconciliation unclaimed** — matching payer deposits vs.
    1099-NEC vs 1099-K, flagging mismatches before filing. Only
    1099Ledger attempts it.

## Competitor autopsy (selected)

| Product | Fate / lesson |
|---|---|
| QuickBooks Self-Employed | Killed Mar 2024 → Solopreneur ($20/mo, data-loss complaints). Opened the gap. |
| Wave | June 2026: paywalled bank feeds, reconciliation, receipt OCR → "Wave refugees." Proof free-with-bank-sync is dead; free manual-first is differentiated. |
| Axium | 2008 collapse — $28M payroll frozen, crew unpaid. Canonical custody-risk case study. |
| GreenSlate | Crew app 2.1/5 — document rejection loops, UI maze, workers flee after wrap. Onboarding-collection side is hostile UX. |
| Wrapbook | Worker-free but %-of-payroll pricing (0.75–1.5%), iOS-only app, crew UI confusion (kit fees, project selection), SVB collapse delayed payroll. |
| EP SmartStart | Well-built but feature-gated; workers must download docs before leaving project (no portability). Legacy portal complaints (Trustpilot). |
| StudioBinder | $249–$1,499/mo; features moved behind tiers; crew tracking gated. |
| Yamdu | Per-user-per-project pricing ($45+ per head per project) — punishes exactly the free-worker-tier model. |
| SetHero | Best call-sheet UX (SMS link, no account) but free tier caps people×days — producers ration who "deserves" the sheet. |
| CallTime / TV Timecard / ScenePaper | The closest worker-owned analogs — all tiny/solo-founder. Proof of pattern, unproven market. |
| HUSSLUP, KitSplit, Filmic Pro | Worker-facing creative/job tools die when founder exits or model shifts — retention/trust fragility. |

## Design principles derived

1. **Worker-owned, employer-agnostic ledger** — hours, expenses, mileage,
   per diem, invoices, payments across ALL productions. The one thing
   payroll companies structurally cannot offer.
2. **Link-first, account-optional** — crew interact via personalized
   links (call sheet → confirm → clock → expense) before ever needing an
   account. Account = power user, not gate.
3. **No bank connection required** — manual entry + receipt OCR; bank
   feed as optional later. Matches the privacy-first micro-trend
   (Keel, Keltek, ReceGuard, odostrada all marketing "no account,
   on-device").
4. **Offline-first PWA** — installable, IndexedDB storage, receipt
   originals on-device with WiFi-sync option. Storage cost is trivial
   (~$0.02/mo per 5k compressed receipts); bandwidth/SMS are the real
   costs → web push + email, never SMS at scale.
5. **Never custody money** — invoices track "who owes me" and export
   evidence; actual payment stays on existing rails (Stripe when
   companies fund escrow, direct worker↔company otherwise).
6. **Evidence-grade records** — every hour/expense/payment timestamped
   and exportable. The pitch: "if a production ghosts you, your ledger
   is your leverage" — IATSE locals actively pursue wage claims and
   need exactly this documentation.
7. **Tax-season hooks that recur weekly** — per-diem/mileage logging is
   weekly value; quarterly estimated-tax reminders (Apr/Jun/Sep/Jan);
   year-end packet (Schedule C summary + CSVs + PDF + receipts +
   1099 reconciliation). CPA packet = PDF + CSV bundle (de facto
   standard; TurboTax can't import Schedule C anyway).
8. **Delightful defaults** — IRS rate auto-fills by drive date
   (mid-year changes handled), GSA rate lookup by work location,
   per-diem tax-home setup wizard, state-form checklist per gig.

## Adjusted build order (post-research)

1. **Worker ledger core** — unified per-gig records: hours, expenses,
   mileage, per diem, expected vs. paid. Everything else hangs off it.
   This is the defensible asset.
2. **Start-pack checklist** — per-gig document tracker (deal memo, W-4
   status, I-9, state forms, union status). Track completion, don't
   collect SSNs — collection stays with payroll companies; we track
   "what's owed/received."
3. **Mileage + per diem** — manual/odometer-first, IRS date-rates,
   GSA lookup, audit-proof export.
4. **Invoice chasing / "who owes me"** — unpaid-invoice aging,
   payment reminders (worker→company), evidence export for disputes.
5. **Year-end tax packet** — Schedule C categories, 1099 reconciliation,
   quarterly reminders.
6. **PWA/offline** — installable, on-device receipt originals,
   background sync.

## Open strategic risks

- Worker-side willingness-to-pay is unproven; all analogs are tiny.
  Mitigation: we're not selling to workers — workers are free supply
  for the company-side monetization. The tools are customer-acquisition
  cost, not a product line.
- If a feature touches onboarding-doc *collection* (SSNs, I-9), we
  inherit the liability and distrust. Stay on the tracking side.
- Consolidation: Wrapbook just acquired Cinapse; GreenSlate acquired
  Circus. Onboarding/scheduling gets absorbed — our worker-owned
  cross-employer ledger is the niche they can't copy without
  cannibalizing their employer customers.
