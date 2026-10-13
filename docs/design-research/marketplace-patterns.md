# Marketplace Design Patterns — What the Best Ones Share

Synthesized from published UX research (Shree Bhanderi's profile-page framework,
U1Core marketplace patterns, UX Stalwarts two-sided analysis) and teardown of
Airbnb / Upwork / Fiverr / Thumbtack / Instawork.

## The universal truth

A marketplace page exists to make one decision easy: **can I trust a stranger?**
Every layout choice either builds or spends trust. The patterns below are the
grammar that keeps appearing across every successful marketplace — order varies
by stakes, but the parts are stable.

## Page grammar (works for profiles, gigs, companies)

```
Hero        → who this is + why trust them + what happens next
Credibility → transaction count, response time, on-time rate, reviews
Story       → the entity becomes real people, not a row in results
Taxonomy    → skills/roles, location, rate, availability
Proof       → portfolio, verified bookings, rating *with shape* (count + specifics)
Logistics   → calendar, cancellation, payment, insurance, support
Objections  → FAQ, guarantees, "what happens if"
```

Stakes decide weighting: low-stakes (book a mover) → speed forward; high-stakes
(rig a 40k-lb roof) → proof and credentials forward. Flexzora is high-stakes.

## Pattern: listing card (where the click decision happens)

Research consensus: a listing card needs exactly five things —
**title, price, location, primary image/badge, ONE trust signal.**
Every extra element measurably reduces click-through. (U1Core)

Flexzora translation — the shift card:
`Role (A1 Audio) · Rate ($38/hr) · Venue + city · Date/call time · ONE signal (e.g. "92% rebook rate")`
Everything else belongs on the detail page.

## Pattern: trust signals that actually differentiate

Star ratings are commoditized (everyone is 4.7–4.9). Signals that carry weight:
- **Counts**: "47 shifts completed", "312 hrs worked"
- **Behavioral**: "responds in ~2 hrs", "98% on-time", "rebooked by 12 companies"
- **Verified claims**: certifications verified (we have cert-review flow!), reference checks (TourReady does 2)
- **Negative space**: Instawork publishes no-show intervention mechanics. Saying how you handle failure is a trust signal.

## Pattern: two-sided signup split

Every major marketplace forks at the entry: Business | Worker (Instawork modal,
our waitlist role select — already correct). Keep the fork *first* in every flow:
copy, questions, and destination all follow role. (We shipped this on the waitlist.)

## Pattern: comparison table vs the status quo

Instawork's highest-leverage block: a two-column table — "us vs traditional staffing
agencies" with numbers (<24h vs 7–10d, 98% vs 50–60% show rate).

Flexzora version: **"Flexzora vs the spreadsheet + group-text stack"**
| | Flexzora | Spreadsheet + texts |
|---|---|---|
| Fill a shift | Post → matched applicants | 40 texts, hours of chasing |
| Clock-in | GPS geofenced | "I think they showed up" |
| No-shows | Broadcast to backups in one tap | Start over at 11pm |
| Pay day | Escrow → invoice → release | Venmo receipts + 1099 scramble |

## Pattern: confirmation clarity

"Confirm" is lazy. The standard: **state every variable at the money moment.**
`"Approve 6.5 hrs — release $247.00 to Alex R. Platform fee $12.35. Funds already in escrow."`
Our escrow gate already enforces this logic; the UI copy should say it that plainly.

## Pattern: structured reviews

"Great crew!" is noise. Prompt for specifics: on-time? show-ready? would rebook?
Review prompts should map to the fields our matching can actually use.

## Pattern: fee transparency

#1 marketplace complaint = hidden fees. Rule: total cost visible before confirmation,
fees itemized, and the worker sees *their number* not the gross. Our invoices
(subtotal/platform_fee/total) already model this — surface it.

## Landing-page skeleton (what the top performers converge on)

1. Role-split hero (two CTAs: "Find crew" / "Find work")
2. One-line mechanism ("post → match → confirm — before load-in")
3. Comparison table vs status quo
4. Logo/credibility strip (or early numbers if small — honesty reads better than padding)
5. How-it-works in 3–4 steps, numbered
6. Feature blocks framed as *operational outcomes* (not icons + adjectives)
7. Case studies = 3 numbers each
8. FAQ covering the real objections (fees, no-shows, insurance, geography)
9. Final CTA repeating the role split

## Interior/ops-tool patterns (the other product)

The logged-in app is a **dispatch console**, closer to Linear/air-traffic-control
than to Airbnb. Patterns that matter there:

- **Boards over lists**: unfilled shifts, clock-ins pending, timesheets awaiting approval — kanban/glanceable (we have ops boards)
- **Now-next-later timeline**: crews live in call times; a time-axis view beats a calendar grid for show week
- **Empty states that teach**: first-run dashboards should show the workflow, not zeros
- **Density is a feature**: ops people want tables; pretty cards waste the screen
- **Dark theme is industry-standard**: production folks work in dark venues — our theme choice is *correct for the domain*, not just aesthetic
