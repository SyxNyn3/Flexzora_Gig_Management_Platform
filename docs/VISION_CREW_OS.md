# Flexzora Crew OS — The Living-Gig Layer

Product vision beyond the marketplace. Flexzora already matches crew to calls;
**Crew OS keeps those workers alive and on-time through the gig.** Touring
stagehands sleep in cars, spend half a check on gas, and lose calls over
transportation. These features turn Flexzora from a job board into the
operating system for gig life.

Design intelligence: **everything below is powered by one engine.**

## 0. The IOU Engine (`crew_iou` — the crown jewel)

Workers are frequently broke *today* but have a payout landing after the gig.
An IOU ledger lets them commit to shared costs now and settle automatically
when their approved timesheet payout releases.

```sql
crew_iou
  id, worker_id, shift_id, kind ENUM('ride','lodging','food','gear','other'),
  amount_cents, beneficiary (driver/host/runner id or free text),
  status ENUM('committed','settled','void','failed'),
  settle_via ENUM('payout_deduction','instant_pay','manual'),
  created_at, settled_at, iou_group_id (links shares of one pool)
```

Rules:
- `approve_timesheet` already computes payout — IOU settlement hooks there:
  approved payout = gross − Σ open IOUs for that worker (per-shift cap, e.g. 25%,
  so nobody signs away the whole check).
- IOUs against *unearned* pay are soft commitments — voided cleanly if the
  shift is cancelled or payout never approves. Show workers their
  **"committed vs remaining"** total before they accept more shares.
- `instant_pay` = pay now via card (Stripe later); `manual` = cash settled
  off-platform, marked settled by the beneficiary.

Every feature below is just a UI flow that writes `crew_iou` rows + pool rows.

## 1. CrewPool — rides (gas shares)

`ride_offers(id, shift_id, driver_id, seats, pickup_point, departure_time, gas_split_cents_per_rider, notes)`
`ride_requests(id, shift_id, worker_id, pickup_area, seats_needed)`

- Worker marks **"need a ride"** or **"I can drive — N seats"** on any shift
  they're assigned to.
- Drivers post pickup points (Walmart lot, transit hub — never home addresses
  by default; privacy rule).
- Rider accepts → `crew_iou(kind:'ride')` for their gas share — settle via
  payout deduction *or* pay instantly if they have it.
- Same shift cancellation cascades: shift cancelled → ride commitments void.

## 2. BunkUp — lodging pools (motel / Airbnb / camp shares)

`lodging_pools(id, event_id, host_worker_id, kind ENUM('motel','airbnb','campsite','lot'), location, total_cost_cents, spots, nightly_cost_pp_cents, dates)`
`pool_members(pool_id, worker_id, nights, share_cents, iou_id)`

- Workers split motels/Airbnbs (4 stagehands ÷ $140/night = $35 each — the math
  IS the pitch). Camp/lot pools are usually free-split (gear/fee shares only).
- **Venue parking-lot camping**: extend `venues` with
  `overnight_parking_allowed`, `overnight_notes`, `lot_lat/lng` — "The stadium
  lets crew camp in Lot C" becomes first-class data shown on the event page.
- Host collects shares via the IOU engine; event page shows nearby pools
  sorted by distance.

## 3. CrewBoard — the coordination layer

`gig_messages` exists — extend into a structured **board per event** with
post categories: `ride`, `lodging`, `food`, `borrow` (lend a harness / hard hat /
tool), `general`. Structured cards (not raw chat) so needs are visible at a
glance: "Need 2 seats Sat AM" / "Have spare tent" / "Pizza run — 6 spots left".

## 4. GrubRun — pooled food orders

`food_runs(id, shift_id, runner_id, restaurant, order_cutoff_at, serve_at)`
`food_run_orders(run_id, worker_id, items_text, cost_cents, iou_id)`

- On a crew call, one person volunteers a food run; others post orders before
  the cutoff — nobody wastes break time driving.
- Same IOU settle mechanic; runner marks "delivered".

## 5. SmartAlerts — the "super intelligence" layer

`worker_shift_checklist(shift_id, worker_id, items jsonb, sent_at)`
`notification_prefs(worker_id, channels jsonb, lead_times jsonb)`

For each upcoming shift the worker gets a generated **briefing**:
- **Departure alert**: "Leave by 6:40 AM" — computed from venue geofence +
  worker's home coords + typical traffic for that start time + weather.
  (v1: estimate from distance + buffer; v2: traffic/weather APIs.)
- **Gas-up reminder** if drive > threshold.
- **Gear checklist auto-derived from the shift**: `required_cert_codes` →
  implied PPE (harness, hard hat, steel-toes); `shift.dress_code`,
  `tools_required` fields → bring-list. "This call needs ETCP + fall-arrest
  cert — bring your harness."
- **Parking intel**: `venues.parking_json` — lot name/address, cost, validation
  ("validated — free" vs "$25/day, card only"), overnight rules.
- Channels: in-app feed + email now; SMS via Twilio later (needs key).

## 6. ShiftSwap — coverage requests

`swap_requests(id, assignment_id, requester_id, reason_category, reason_text, status)`
`swap_claims(swap_id, claimant_id)`

- Worker can't make a call → posts it for swap/coverage with a reason
  (sick, transport, family, other gig).
- Only **cert-eligible, match-score-positive** workers see it (reuses
  `matchScore` gating — the engine already knows who's qualified).
- Claimant accepts → routes to company for approval (reuses the
  offer/accept assignment status machine — `offered` → `confirmed`).

## Build order (smartest-first)

1. `crew_iou` ledger + settlement hook on `approve_timesheet` ← everything depends on it
2. CrewPool rides (gas shares) ← the headline feature
3. BunkUp lodging pools + venue camping flags
4. CrewBoard structured categories
5. GrubRun
6. SmartAlerts briefing generator (checklist + parking + departure estimate)
7. ShiftSwap

## Quality bar for implementation

- These are **living-gig features** — the UI should feel like a crew app, not
  an admin panel: big cards, one-tap actions, readable at arm's length on a
  phone in a parking lot.
- Elaborate thoughtfully: every flow above has obvious adjacent ideas
  (recurring ride buddies, preferred-pool crew from `preferred_rosters`,
  share-split fairness when someone bails). Build the smart version, note the
  deeper version in `docs/BACKLOG.md` if it's too big for tonight.
- Every feature gets: migration, RLS (workers see their own pools/IOUs,
  companies see aggregate), seed demo data, and tests where logic lives.
