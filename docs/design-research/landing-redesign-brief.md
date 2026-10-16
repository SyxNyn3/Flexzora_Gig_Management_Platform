# Landing Redesign — Research Brief

Design intelligence gathered 2026-10-15. Feeds the homepage rebuild; nothing
here is implemented yet. Source of truth for WHY the page looks the way it
will — don't re-research, update this file instead.

## The verdict on the current page

User test of one (the homegirl): "too many words, too much stuff to read."
Correct. The page is 531 lines of feature cards, numbered steps, and badge
chips — a brochure. Copy research for trade audiences is unanimous: headline
under 12 words, one line of support, one CTA, imagery does the persuading.
Every word on the new page must pass the "would you say it out loud on the
deck" test.

## The real construction sequence (for the scroll animation)

Researched the actual systems the big shows fly — Stageco Super Roof / XXL
(Foo Fighters: 25m span, 40t of production, computer-controlled winches,
3-day builds), Prolyte MPT/CT towers, Liftket hoists, Tomcat ground support,
ProX F34 systems.

**Owner's spec (how we'll animate it — the dead-hang pattern):**

1. Deck + bases + outriggers set
2. Towers go ALL the way up — structure completes before anything hangs
3. Hoist/chain lines drop from the top of the structure down to the floor
4. Trusses appear at grade; lines connect; they pull up ~halfway
5. More lines drop; they connect to the next pieces; those pull up
6. LED wall: support truss raises in stages — clip a row, lift, clip the
   next row, lift, clip the last (confirmed real practice — EagerLED install
   docs: "raise the truss and install the next row")
7. Everything reaches trim; chains dressed; FOH + cable ramps land
8. Blueprint flips to full color — the build becomes the show

Real-world flavor details worth animating (they read as "true" to crew):
hoists get swapped for safeties at trim height; ballast on tower bases;
line arrays hang in slightly arced columns; speakers/LED/lighting each ride
their own chain points off the mother grid.

## Pain points the page must say out loud

These are the reasons a worker signs — and the product ALREADY solves every
one. The current page never mentions them:

| Pain (their words)          | Flexzora answer                        | Ships as |
|-----------------------------|----------------------------------------|----------|
| Calls scattered across texts | every company's calls in one feed      | crew board |
| Sleeping in cars out of state| split lodging with the crew, IOU-settle| crew_lodging + iou('lodging') |
| $25 a head every meal        | pooled food runs, split on payout      | grubrun + iou('food') |
| Tools walk off / get lent out| gear tracking                          | iou('gear') |
| Who's got the ride / parking | carpools, venue parking notes          | crew_rides |
| When's my call / traffic     | unified call sheet + travel notes      | call sheet |
| Chasing the check            | escrow funded before lift, paid on approval | escrow payouts |

Copy direction: write the PAIN first ("You know the part where…"), then the
one-line fix. Not feature names — lived moments.

## Imagery direction

Every role card gets a photographic background of the actual work (Pexels,
already licensed on the site):

- **A1 Audio** — FOH console mid-show, hands on faders
- **L2 Lighting** — techs focusing fixtures on a rack/truss, gel work
- **Video Wall Lead** — big LED wall, no people needed — scale carries it
- **Stagehand** — crew pushing road cases, decking going down
- **RF/Comms** — beltpacks, antenna distro backstage
- **Rigger** — up in the steel, harness on, shackles and spansets

Venue variety (kill "Convention Center Ballroom C" energy): arena concert,
outdoor festival roof, studio/soundstage, ballroom corporate, theater rig.
We work everywhere — the imagery should say that.

## Color & type (locked by research)

Backstage black `#0A0A0B` ground — already right, keep. Amber `#fbbf24` is
the ONLY action color (spotlight + hi-vis tape + call-sheet ink). Zinc for
text. Mono face for operational data (call times, gate numbers, rates).
Condensed bold display for headlines. Palette rule from production identity
research: "loud enough to notice, built to work in low light, never steals
the spotlight."

## Two-audience rule

Homepage belongs to CREW. Companies get one dark door-panel mid-page +
their own surface. Blended messaging is the #1 documented marketplace
homepage failure.

## Pain validation — real complaints found (2026-10-15 pass)

Verified against Reddit/forums/industry press. These are real, frequent, and
mostly unaddressed:

| Pain | Evidence | We cover it? |
|---|---|---|
| Chasing pay | "75% of entertainers paid late or not at all in the past 12 months" (Chortle poll); 500 acts unpaid 5 months (Leicester festival); "tired of chasing paychecks… paid when they remember to process my timesheet" (Reddit); 71% of freelancers stiffed, avg owed $6k (Freelancers Union). LASSO itself markets "No invoices to chase. No net-30 waits." | Escrow funded at booking + auto-release on timesheet approval = our #1 message |
| Sleeping in cars / sketchy housing | Touring dissertation (U Toronto): "sleeping in vehicles, eating shelf-stable meals" is standard practice; Bright Star reviews: "hotels ok, other super sketchy and not safe" | crew_lodging + lodging IOU |
| Food costs w/o kitchen | "spend a lot of money on food because you have no fridge or kitchen" — touring worker review | grubrun pooled runs + food IOU |
| Call times change constantly | "The call time you published is already wrong… not an exception, the operating environment" (Teambridge); stale copy-paste call sheets send crew to wrong times | live call sheet + push alerts |
| Parking chaos | "Every venue has their parking own rules, few give us free parking"; crews circle 20min, risk towing (IATSE orientation docs) | venue intel on the call + crew_rides |
| Calls arrive by TEXT | IATSE Local 320 dispatch = literal text messages, 2-hr accept window | one feed replaces scattered texts |
| Rate opacity | "what's a normal day rate?" threads recur constantly | match scoring + visible rates |
| No contract = no leverage | Deadbeat-client stories: negotiated verbally, never paid | offer terms frozen at acceptance |
| Scattered work admin | "tracking auditions, rates, invoices — scattered across email, notes, and my head" | the whole worker inbox pitch |
| Exhausted drives | "4-5 shows a day then drive 6-7 hours exhausted" | schedule conflict detection + spacing signals |

New feature/copy ideas surfaced by complaints: rate benchmarking visibility,
venue parking/overnight intel per call, safety flags on companies (sketchy
housing reports), workers-comp/coverage gap messaging (LASSO sells W2
coverage — we should have an honest answer to that).

## Competitor read — LASSO is the elephant

LASSO = company-side crew management + a "Crew Marketplace" where workers
become **W2 employees of LASSO** itself, paid weekly. That's the fork:

- **LASSO's model:** you work FOR LASSO. Your companies rent you through
  them. Weekly payroll, workers comp, 401k after 1k hours — but the company
  relationship belongs to them.
- **Flexzora's model:** you work for YOUR companies. Calls from every
  company land in one feed, pay is escrow-protected, and the relationship +
  ratings + certs stay yours. Crew-first, not agency-first.

Positioning line that writes itself: *"LASSO wants to be your employer.
Flexzora wants to be your toolbox."*

## DiffUI strategy ($5 credit — user says 3 designs only, on their go)

DiffUI is a UI-PAGE designer (diffusion model) — NOT an image generator.
It takes screenshots → learns your style → generates design options,
outputs tokens + web components + a "build skill" for agents.

**Spend plan: 3 designs max, only when the owner calls it.** Before that,
we iterate the prompt + a pasted screenshot of the current page for free.

### Prompt v2 (ready to fire — refined after complaint research)

> "Landing page for a crew marketplace in live-event production — think
> touring stagehands, riggers, A1 audio engineers, lighting techs.
>
> AUDIENCE: proud technical tradespeople who sleep in cars between cities,
> chase checks, and live off texts from dispatchers. They don't read
> marketing copy. Design must work at glance-level.
>
> STYLE: backstage-industrial. Near-black #0A0A0B ground. ONE accent —
> amber #fbbf24, the color of hi-vis tape and spotlight gel. Condensed
> bold display type for headlines, monospace for operational details
> (call times, gate numbers, rates — like a real call sheet). Road cases,
> technical riders, gaffer tape energy. Zero corporate SaaS gradients.
>
> STRUCTURE: (1) cinematic full-viewport hero over a dark truss/rigging
> photo, headline under 8 words, single amber CTA. (2) a scroll moment
> where a stage roof structure assembles — blueprint linework, technical
> drawing style. (3) pain-point cards that lead with lived moments not
> features: 'every company's calls in one feed', 'stop sleeping in the
> car alone', 'one food run feeds the whole crew', 'pay is locked before
> you lift'. (4) role cards with photographic backgrounds — rigger in
> steel, FOH console, LED wall, stagehands pushing cases. (5) one dark
> door-panel for production companies. Close with 'Join the founding crew.'
>
> FEEL: less 'app marketing', more 'the card in your wallet that says
> you're one of us.'"

### Image sourcing (free, licensed — keep DiffUI credits for layout)

Pexels already in use; targets per role: rigger in steel w/ spansets,
FOH console hands-on-faders, techs focusing fixtures, LED wall at scale,
crew pushing road cases, combs/RF rack, arena + festival roof + studio +
ballroom variety.

## Proposed page skeleton (crew-first, glanceable)

1. Hero — cinematic, ≤8 words, one CTA
2. THE BUILD — scroll-scrubbed stage assembly (dead-hang sequence above),
   beat captions = the only marketing copy, 8 lines total
3. Pain strip — the lived-moments table rendered as cards ("the part where
   you're figuring out where to sleep…" → answer)
4. Role cards WITH photographic backgrounds
5. Proof strip — numbers only
6. Company door — 3 lines + demo CTA
7. Final CTA — join the founding crew

## Known issues with skeleton pass

- 520vh pinned scroll drags on mobile — plan: compress to ~300vh on
  viewports <768px or swap to a condensed beat list
- Build is side-elevation 2D — acceptable stylization for blueprint mode;
  if we want dimension, isometric hints or the "go live" photo dissolve
- Beat 08 needs real "crew finishing work" imagery layered in the color flip
