// Role tiers follow industry call-sheets — an A1 mixes FOH, an A2
// patches stage; an LD designs, LX1 runs the dept, LX2 runs cable.
// Different positions, different rates — they are not interchangeable.
//
// Tiered departments group into cards for the two-level picker — the
// stored `value` stays the canonical full string, `label` is just the
// seat name shown inside the expanded card. `allLabel` adds a chip
// that toggles every seat in the group at once (rigging's "Both").
const AUDIO_SEATS = [
  { label: 'A1 — Lead Engineer / FOH-Monitors', value: 'Audio — A1 (Lead Engineer / FOH-Monitors)' },
  { label: 'A2 — Stage Patch / RF / Mics', value: 'Audio — A2 (Stage Patch / RF / Mics)' },
  { label: 'A3 — Systems / Comms / Playback', value: 'Audio — A3 (Systems / Comms / Playback)' },
  { label: 'Monitor Engineer', value: 'Audio — Monitor Engineer' },
  // RF is its own seat, not an A2 sub-skill — on any real show the wireless
  // coordinator owns freqs, packs and scans while the A2 owns the patch.
  { label: 'RF Tech — Wireless Coordinator', value: 'Audio — RF Tech (Wireless Coordinator)' },
] as const;

// Up vs down is the real rigging split: high riggers climb the grid,
// ground riggers work the deck — different certs AND different bodies
// of work. Plenty of ground riggers never go up, and vice versa.
const RIGGING_SEATS = [
  { label: 'Upstage / High (ETCP)', value: 'Rigger — Upstage / High (ETCP)' },
  { label: 'Downstage / Ground', value: 'Rigger — Downstage / Ground' },
] as const;

const LIGHTING_SEATS = [
  { label: 'LD — Designer / Programmer', value: 'Lighting — LD (Designer / Programmer)' },
  { label: 'LX1 — Master Electrician', value: 'Lighting — LX1 (Master Electrician)' },
  { label: 'LX2 — Electrician', value: 'Lighting — LX2 (Electrician)' },
  { label: 'Followspot Op', value: 'Lighting — Followspot Op' },
] as const;

const VIDEO_SEATS = [
  { label: 'V1 — Lead Engineer / Vision', value: 'Video — V1 (Lead Engineer / Vision)' },
  { label: 'V2 / LED Tech', value: 'Video — V2 / LED Tech' },
  { label: 'Camera Op', value: 'Video — Camera Op' },
] as const;

export const CREW_ROLE_GROUPS = [
  { label: 'Audio', seats: AUDIO_SEATS },
  { label: 'Rigging', allLabel: 'Both — Up + Down', seats: RIGGING_SEATS },
  { label: 'Lighting', seats: LIGHTING_SEATS },
  { label: 'Video', seats: VIDEO_SEATS },
] as const;

// Single-seat roles stay directly tappable — no second level to open.
export const CREW_ROLE_SINGLES = [
  'Stagehand',
  'Backline',
  'Carpenter / Scenic',
  'Forklift / Lift Operator',
  'Truck Loader',
  'Production Assistant',
  'Crew Chief / Lead',
] as const;

// Flat canonical list in the original order — derived from the groups so
// the strings can never drift between presentation and storage.
export const CREW_ROLES = [
  CREW_ROLE_SINGLES[0],
  ...RIGGING_SEATS.map((s) => s.value),
  ...AUDIO_SEATS.map((s) => s.value),
  ...LIGHTING_SEATS.map((s) => s.value),
  ...VIDEO_SEATS.map((s) => s.value),
  ...CREW_ROLE_SINGLES.slice(1),
];

export const COMPANY_TYPES = [
  'Concert promoter',
  'Corporate AV provider',
  'Labor broker / crewing company',
  'Staging & rigging vendor',
  'Venue / arena',
  'Festival producer',
  'Other',
] as const;

export const PAIN_POINTS = [
  { value: 'load_in', label: 'Load-in staffing & call times' },
  { value: 'show_call', label: 'Show call coverage' },
  { value: 'load_out', label: 'Load-out running long / OT' },
  { value: 'scheduling', label: 'Roster & availability chaos (Excel/SMS groups)' },
  { value: 'timesheets', label: 'Timesheets & clock-in verification' },
  { value: 'payouts', label: 'Payouts, invoices & 1099s' },
  { value: 'finding_crew', label: 'Finding vetted, certified crew' },
  { value: 'no_shows', label: 'No-call / no-shows' },
] as const;

export const WORKER_PAIN_POINTS = [
  { value: 'finding_gigs', label: 'Finding consistent gigs' },
  { value: 'getting_paid', label: 'Getting paid on time / chasing invoices' },
  { value: 'last_minute_changes', label: 'Last-minute schedule & call-time changes' },
  { value: 'transport_lodging', label: 'Rides, carpools & lodging coordination' },
  { value: 'lost_hours', label: 'Paper timesheets & lost hours' },
  { value: 'proving_certs', label: 'Re-proving certs & experience to every new company' },
  { value: 'out_of_loop', label: 'Being out of the loop on crew comms' },
  { value: 'iou_settling', label: 'Settling gas/food IOUs with crewmates' },
] as const;

export const CREW_SKILLS = [
  'ETCP Arena Rigger',
  'ETCP Theater Rigger',
  'CM chain hoist',
  'Forklift / Telehandler',
  'Aerial lift (boom/scissor)',
  'OSHA 10',
  'OSHA 30',
  'Fall protection',
  'IATSE member',
  "Driver's license",
  'CDL',
  'Passport-ready',
  'First aid / CPR',
  'Console programming',
  'Networking / DMX',
  'Owns tools',
  'Owns full PPE (hard hat / hi-vis / steel toe)',
] as const;

export const TRAVEL_OPTIONS = [
  'Local calls only',
  'Regional drive (2–4 hrs)',
  'Fly anywhere',
  'Tour-ready (weeks out)',
  'Overnights OK',
  'Weekends OK',
] as const;

export const EXPERIENCE_LEVELS = [
  'New to the industry',
  '1–3 years',
  '4–9 years',
  '10+ years',
] as const;

export const REGIONS = [
  'My home market',
  'Northeast',
  'Southeast',
  'Midwest',
  'Texas & Gulf',
  'Southwest',
  'Mountain West',
  'West Coast',
  'Pacific Northwest',
  'Canada',
  'UK / Europe',
  "Anywhere there's a call",
] as const;

export const VEHICLE_TYPES = [
  'Car / sedan',
  'SUV / pickup',
  'Cargo van',
  'Box truck',
  'Trailer rig',
  'Motorcycle',
] as const;

export const FARTHEST_TRAVEL = [
  'Stayed local (<50 mi)',
  '100–300 mi',
  '300–600 mi',
  '600+ mi',
  'Cross-country / flew for a call',
] as const;

export const DEPARTURE_NOTICE = [
  'Wheels up within days',
  'Need ~2 weeks to sort things',
  'Need a month+ of notice',
] as const;

export const CALL_RESPONSE = [
  'Same day — point me at it',
  'Next day',
  'A few days out',
  'A week+ of notice',
] as const;

export const BUSINESS_ARRANGEMENTS = [
  'I take calls under my own business (LLC/inc)',
  'Both — under my business and personally',
  'My business can bring its own crew',
  'Side business — I mostly crew for others',
] as const;

export const PAYMENT_TYPES = [
  '1099 contractor — no problem',
  'W2 preferred',
  'Either works',
] as const;

export const HEARD_FROM = [
  'Friend / coworker',
  'Production company',
  'Instagram / TikTok',
  'Facebook group',
  'LinkedIn',
  'Search',
  'Other',
] as const;
