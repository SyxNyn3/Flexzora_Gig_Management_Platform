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

export const HEARD_FROM = [
  'Friend / coworker',
  'Production company',
  'Instagram / TikTok',
  'Facebook group',
  'LinkedIn',
  'Search',
  'Other',
] as const;
