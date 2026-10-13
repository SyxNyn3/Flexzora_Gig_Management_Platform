# Competitive Landscape — Crew/Gig Staffing Marketplaces

Teardown of the platforms Flexzora actually competes with. Sources noted per row.

## Direct niche: live-event / production crew

### Staff Me Up
- **Model:** Job board. Productions post openings; crew apply. Skews film/TV.
- **Pricing:** Crew pay **$19.99/mo or $149.99/yr** for unlimited applications — the worker pays.
- **Scale:** ~350k profiles, running since 2012. Deep in unscripted/network TV, esp. LA.
- **Weakness to exploit:** Charges the worker; it's a *job board* — no ops layer, no clock-in, no pay rails, no crew coordination. Slow for last-minute staffing.

### NeedaCrew
- **Model:** Marketplace where crew book work, rent gear, sign contracts, get paid — one login.
- **Pricing:** Crew free forever. **5% flat fee on the hirer**, only on successful booking. Stripe-held payments. $8/mo optional Pro for business tooling (instant payouts, taxes).
- **Positioning:** "Rebuilding the production stack from the worker's side" — launched 2026 after studio layoffs.
- **Weakness to exploit:** Film/TV-centric; ops features thin (no GPS clock, no transport/lodging coordination, no company OS).

### Booked AV
- **Model:** AV gig marketplace + an "Open Bid Market" where labor companies bid on whole crew calls.
- **Pricing:** $25/job post; $10/broker bid in the bid market.
- **Interesting pattern:** Split jobs by show phase (load-in / show / strike) — matches real event labor waves.
- **Weakness to exploit:** Transaction layer only; post-and-pray. No post-booking operations.

### TourReady
- **Model:** Crew search + job posts for tours/concerts/events. Industry filters + availability calendars.
- **Trust mechanic:** "Rockstar Plan" requires **two reference checks** to verify work history.
- **Weakness to exploit:** Directory + inbox model; company does all logistics elsewhere.

### StageCrew
- **Model:** Focused AV/stagehand/DJ job board. Pay-disclosed listings.
- **Pricing:** Free for workers; first 10 employer posts free.
- **Weakness to exploit:** Job board only — explicitly calls itself "review or apply" tooling.

### Crew Up
- **Model:** Entertainment-industry marketplace app — profiles, project notifications, booking, shared calendar.
- **Pricing:** $4.99/mo crew subscription.
- **Weakness to exploit:** Subscription-gated crew side again; community app, not an ops system.

### CrewGrid
- **Model:** Managed sourcing for commercial/corporate video — submit a brief, get matched vetted crew.
- **Weakness to exploit:** Service model, not a self-serve platform; narrow segment.

### Mertzcrew
- **Model:** AV staffing service — pick freelancers, they handle contract + insurance + payments + workers' comp.
- **Weakness to exploit:** Managed service, not software the company owns.

## Horizontal scale players (model to learn from, not fight)

### Instawork — the pattern-setter
Landing anatomy worth stealing:
- **Role-split signup modal**: "A Business / A Worker" before anything else (we already do this on the waitlist — good).
- **Comparison table vs status quo**: columns "Instawork vs Traditional staffing agencies" — time-to-fill <24h vs 7–10d, show rate 98% vs 50–60%. Numbers do the selling.
- **Logo wall + metric case studies**: every case study = 3 numbers (fill rate, positions, rating).
- **Feature claims are operational**: geofencing time tracking, predictive no-show intervention, backup-worker auto-deployment, pre-shift announcements. *They sell reliability mechanics, not vibes.*
- **Fee framing**: "all-inclusive hourly rate, no hidden fees" for business; "free, pay shown before you book" for workers.

### Qwick / Wonolo / Jitjatjo / Gigpro
- Hospitality shift marketplaces. Same grammar: post shift → matched workers → rated outcomes. Useful for shift-card and matching UX patterns.

## The gap — Flexzora's differentiator

Every competitor is a **discovery layer** (find/book people) or a **service layer**
(we staff it for you). **None own what happens after the booking is confirmed.**

Flexzora already ships, in code:
- GPS geofence clock-in/out + timesheets + approval gates
- Escrow funding → invoice → payout release (FLX-#### audit trail)
- Crew boards, broadcasts, ops kanban, certifications with review flow
- Transport/carpool, lodging, parking, food runs, gas IOUs
- Roster import, staff management, company knowledge/copilot

**Design implication:** our marketplace surface must feel as trustworthy as the best
competitor landing pages — but the differentiator to *show* is the ops loop:
"Booked is where they stop. Showtime is where we start."

## Copy hooks competitors use (swipe file)

- "Staffing reinvented: AI-powered, human vetted" — Instawork
- "You're never short staffed" — Instawork
- "The people with the budget pay our fee" — NeedaCrew
- "No spreadsheets of phone numbers. No chasing availability via group texts" — Booked AV
- "One profile, every event. Build your crew history" — BackstageCrew
- "From posting to showtime in four steps" — Booked AV

## Anti-patterns to avoid

- **Worker-pays subscriptions** (Staff Me Up, Crew Up) — breeds resentment, caps supply-side growth. Flexzora should keep worker side free; charge the budget side.
- **Pay-hidden listings** — StageCrew's "pay-disclosed" is a differentiator *because* most hide it. Always show the rate.
- **5-star inflation** — everyone is 4.8. Use specific signals: shifts completed, on-time rate, rebook rate, no-show count.
