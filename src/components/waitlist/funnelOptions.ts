export const CREW_ROLES = [
  'Stagehand',
  'Rigger (ETCP)',
  'Audio / A1-A2',
  'Lighting / LD-L2',
  'Video / LED',
  'Backline',
  'Carpenter / Scenic',
  'Forklift / Lift Operator',
  'Truck Loader',
  'Production Assistant',
  'Crew Chief / Lead',
] as const;

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
