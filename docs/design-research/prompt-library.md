# Design Prompt Library

Reusable prompts for AI-assisted design work. Each prompt encodes our brand,
our evidence base, and our constraints — so output comes back on-brand without
re-explaining context every time.

## Brand block (prepend to any visual-generation prompt)

```
Brand: Flexzora — the operating system for live-event crews.
Identity: near-black background #0A0A0B, faint white grid lines (56px, ~3% opacity),
amber accent (#F59E0B / hsl 38 95% 55%), zinc text scale, professional production-industry
feel — think backstage console, not consumer app. Dark theme is native.
Typeface: system sans, tight tracking, weight contrast for hierarchy.
Voice: direct, operational, zero hype. "Load-in. Show call. Load-out." energy.
Rule: every screen is judged on whether a production manager can act in <5 seconds.
```

## Prompt: competitor page teardown

```
Analyze [URL or pasted copy] as a marketplace landing page. Extract:
1. The page grammar (hero → credibility → story → proof → logistics → objections — map their sections to it)
2. Every trust signal used, ranked by specificity (counts > ratings > badges > claims)
3. The role-split mechanic (how do business vs worker paths fork?)
4. Pricing/fee framing — what's disclosed vs hidden
5. One structural idea worth borrowing, one mistake to avoid
Compare against docs/design-research/marketplace-patterns.md.
```

## Prompt: generate a component (21st.dev / v0 / any codegen)

```
[BRAND BLOCK]
Component: [shift card / crew roster row / timesheet approval panel / ...]
Constraints:
- Listing-card rule: max 5 elements on cards — title, rate, location, time, ONE trust signal
- Trust signals must be specific counts/rates ("47 shifts", "98% on-time"), never bare stars
- Data comes from Supabase types in src/lib/supabase.ts — use those field names
- Tailwind + our tokens (bg-card, border-border, text-zinc-*, amber-400 accents)
- shadcn/ui primitives where available
Output: single-file React component, no placeholders, no lorem ipsum.
```

## Prompt: redesign an existing page

```
[BRAND BLOCK]
Redesign [page file path]. Keep all functionality and data bindings identical.
Apply the page grammar from docs/design-research/marketplace-patterns.md:
[mapping: e.g. "this is a high-stakes detail page — proof and logistics forward"]
Constraints: mobile-first (crew uses phones backstage), thumb-reach CTA,
no new dependencies, preserve existing component APIs.
Show the diff, don't rewrite the file wholesale.
```

## Prompt: write landing copy in our voice

```
Write landing copy for Flexzora [section]. Rules from research:
- Sell operational mechanics, not adjectives ("GPS geofence clock-in" not "easy timekeeping")
- Numbers beat claims; if we lack the number, say the mechanic honestly
- Worker copy: pay shown upfront, free to join, build verified crew history
- Company copy: "booked is where they stop, showtime is where we start"
- Never: "revolutionary", "seamless", "all-in-one", exclamation marks
Competitor hooks to beat, not copy, are in competitive-landscape.md swipe file.
```

## Prompt: audit a screen for trust

```
[BRAND BLOCK]
Audit [screenshot/component] as a marketplace trust surface. For each element ask:
does this build or spend trust with a stranger? Flag: hidden fees, vague CTAs,
bare star ratings, missing counts, unclear next-steps. Suggest the single
highest-leverage trust improvement. Grammar ref: marketplace-patterns.md.
```

## Prompt ideas backlog (to expand later)

- "Generate 3 shift-card variants that differ only in which trust signal they lead with" — for A/B thinking
- "Design the empty state for a company's first day (no crew, no shifts) that teaches the workflow"
- "Redesign the worker profile as a trust document, not a resume"
- "Create the 'vs spreadsheet+texts' comparison table for the landing page"
- "Storyboard the 30-second mental model: post shift → crew confirms → GPS clock → escrow releases"
