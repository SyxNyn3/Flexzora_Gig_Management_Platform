// Import target registry — the wizard's extensibility point.
//
// Each target declares the fields it accepts, the header aliases used by the
// heuristic mapper, and the sample-value sniffer used when headers don't
// match. Adding a new target (e.g. staff when the staff layer lands) is a
// FieldDef list plus a branch in commit_import_job — the wizard picks it up
// automatically.
import { ImportTarget } from '@/lib/types';

export type FieldKind = 'text' | 'number' | 'integer' | 'money' | 'datetime' | 'date' | 'list' | 'email' | 'phone';

export interface FieldDef {
  /** Field name in import_rows.mapped (and in commit_import_job). */
  key: string;
  label: string;
  kind: FieldKind;
  required?: boolean;
  /** Header names the heuristic mapper recognizes, normalized (lowercase, alnum). */
  aliases: string[];
  /** What the mapper sniffs in sample values when no header matches. */
  sniff?: 'email' | 'phone' | 'money' | 'integer' | 'number' | 'datetime' | 'date' | 'name' | 'address';
  hint?: string;
}

export interface ImportTargetDef {
  key: ImportTarget;
  label: string;
  description: string;
  /** Column signature that auto-suggests this target after parsing. */
  signature: string[];
  fields: FieldDef[];
  /** True when the target imports into a chosen event (job.event_id). */
  needsEvent?: boolean;
  /** Hidden until its backend lands (staff ships with the staff layer). */
  comingSoon?: boolean;
}

export const IMPORT_TARGETS: ImportTargetDef[] = [
  {
    key: 'venues',
    label: 'Venues',
    description: 'Arenas, halls, lots — with addresses and optional geofence coords.',
    signature: ['address', 'city', 'venue'],
    fields: [
      { key: 'name', label: 'Venue name', kind: 'text', required: true, sniff: 'name', aliases: ['venue', 'venuename', 'name', 'location', 'site', 'hall', 'building'] },
      { key: 'address', label: 'Street address', kind: 'text', required: true, sniff: 'address', aliases: ['address', 'street', 'streetaddress', 'addr', 'address1', 'locationaddress'] },
      { key: 'city', label: 'City', kind: 'text', aliases: ['city', 'town', 'municipality'] },
      { key: 'region', label: 'State / region', kind: 'text', aliases: ['state', 'region', 'province', 'st'] },
      { key: 'country', label: 'Country', kind: 'text', aliases: ['country', 'countrycode'], hint: 'Defaults to US' },
      { key: 'latitude', label: 'Latitude', kind: 'number', sniff: 'number', aliases: ['lat', 'latitude', 'ycoord', 'geolat'] },
      { key: 'longitude', label: 'Longitude', kind: 'number', sniff: 'number', aliases: ['lng', 'lon', 'long', 'longitude', 'xcoord', 'geolng', 'geolon'] },
      { key: 'geofence_radius_m', label: 'Geofence radius (m)', kind: 'integer', sniff: 'integer', aliases: ['geofence', 'radius', 'geofenceradius', 'geofencem', 'fenceradius'], hint: 'Defaults to 250 m — needed for GPS clock-in' },
      { key: 'load_in_notes', label: 'Load-in notes', kind: 'text', aliases: ['loadin', 'loadinnotes', 'dock', 'docknotes', 'notes', 'accessnotes', 'marshal'] },
    ],
  },
  {
    key: 'shifts',
    label: 'Calls / shifts',
    description: 'Call sheets — role, headcount, times, rate, cert gates — into one event.',
    signature: ['headcount', 'rate', 'call'],
    needsEvent: true,
    fields: [
      { key: 'title', label: 'Call title', kind: 'text', sniff: 'name', aliases: ['title', 'call', 'calltitle', 'shift', 'shiftname', 'name', 'callname'], hint: 'Defaults to the role name' },
      { key: 'role_name', label: 'Role', kind: 'text', required: true, aliases: ['role', 'rolename', 'position', 'job', 'craft', 'department', 'gig'] },
      { key: 'skill', label: 'Skill', kind: 'text', aliases: ['skill', 'skillname', 'tradecategory'], hint: 'Must match a Flexzora skill name' },
      { key: 'required_cert_codes', label: 'Required certs', kind: 'list', aliases: ['certs', 'certifications', 'requiredcerts', 'certreqs', 'certification', 'requirements', 'certcodes'], hint: 'Codes or names — "ETCP_ARENA" or "ETCP Arena"' },
      { key: 'headcount', label: 'Headcount', kind: 'integer', required: true, sniff: 'integer', aliases: ['headcount', 'count', 'crew', 'crewnumber', 'qty', 'needed', 'numworkers', 'workers', 'slots', 'positions'] },
      { key: 'starts_at', label: 'Call time (start)', kind: 'datetime', required: true, sniff: 'datetime', aliases: ['start', 'starttime', 'calltime', 'callstart', 'startsat', 'startdatetime', 'begin', 'from'] },
      { key: 'ends_at', label: 'Wrap time (end)', kind: 'datetime', required: true, sniff: 'datetime', aliases: ['end', 'endtime', 'wrap', 'wraptime', 'endsat', 'enddatetime', 'finish', 'to', 'until'] },
      { key: 'hourly_rate', label: 'Hourly rate', kind: 'money', required: true, sniff: 'money', aliases: ['rate', 'hourlyrate', 'hourly', 'pay', 'wage', 'payrate', 'hrly', 'price', 'hr'] },
      { key: 'min_proficiency', label: 'Min skill tier (1–5)', kind: 'integer', sniff: 'integer', aliases: ['mintier', 'minproficiency', 'level', 'tier', 'minlevel', 'experience'] },
      { key: 'notes', label: 'Notes', kind: 'text', aliases: ['notes', 'note', 'comments', 'details', 'instructions'] },
    ],
  },
  {
    key: 'roster_contacts',
    label: 'Crew roster contacts',
    description: 'Your go-to freelancers — matched to Flexzora accounts by email/username.',
    signature: ['email', 'name'],
    fields: [
      { key: 'full_name', label: 'Full name', kind: 'text', required: true, sniff: 'name', aliases: ['name', 'fullname', 'worker', 'crewmember', 'contact', 'employee', 'crewname'] },
      { key: 'email', label: 'Email or username', kind: 'email', required: true, sniff: 'email', aliases: ['email', 'emailaddress', 'mail', 'username', 'handle', 'login'] },
      { key: 'phone', label: 'Phone', kind: 'phone', sniff: 'phone', aliases: ['phone', 'phonenumber', 'mobile', 'cell', 'tel', 'telephone'] },
      { key: 'tier', label: 'Roster tier', kind: 'text', aliases: ['tier', 'rostertier', 'level', 'rank'], hint: 'core | standby | preferred | blocked — defaults to preferred' },
      { key: 'notes', label: 'Notes', kind: 'text', aliases: ['notes', 'note', 'comments', 'about'] },
    ],
  },
  {
    key: 'staff',
    label: 'Staff members',
    description: 'Internal PMs, coordinators, crew leads — upserts by email so re-imports update.',
    signature: ['department', 'employment', 'dayrate', 'title'],
    fields: [
      { key: 'full_name', label: 'Full name', kind: 'text', required: true, sniff: 'name', aliases: ['name', 'fullname', 'staff', 'staffmember', 'employee', 'member', 'contact'] },
      { key: 'email', label: 'Email', kind: 'email', sniff: 'email', aliases: ['email', 'emailaddress', 'mail', 'workemail'], hint: 'Dedupe key — re-imports update the same person' },
      { key: 'phone', label: 'Phone', kind: 'phone', sniff: 'phone', aliases: ['phone', 'phonenumber', 'mobile', 'cell', 'tel', 'telephone'] },
      { key: 'title', label: 'Job title', kind: 'text', aliases: ['title', 'jobtitle', 'role', 'position', 'job', 'staffrole'], hint: 'Production Manager, Stage Manager, …' },
      { key: 'department', label: 'Department', kind: 'text', aliases: ['department', 'dept', 'team', 'division', 'crew'] },
      { key: 'employment_type', label: 'Employment type', kind: 'text', aliases: ['employmenttype', 'employment', 'type', 'paytype', 'contract'], hint: 'salaried | day_rate | hourly — defaults to day_rate' },
      { key: 'day_rate', label: 'Day rate', kind: 'money', sniff: 'money', aliases: ['dayrate', 'rate', 'dailyrate', 'daily', 'perday', 'salary', 'dailyrateusd'] },
      { key: 'notes', label: 'Notes', kind: 'text', aliases: ['notes', 'note', 'comments', 'about'] },
    ],
  },
  {
    key: 'shift_templates',
    label: 'Call packs (shift templates)',
    description: 'Your rate card — role, headcount, rate, cert gates, typical length — becomes one-tap call packs.',
    signature: ['duration', 'pack', 'template'],
    fields: [
      { key: 'name', label: 'Pack name', kind: 'text', sniff: 'name', aliases: ['name', 'pack', 'packname', 'template', 'templatename', 'callpack', 'preset'], hint: 'Defaults to the role name — dedupe key, re-imports update' },
      { key: 'role_name', label: 'Role', kind: 'text', required: true, aliases: ['role', 'rolename', 'position', 'job', 'craft', 'department', 'gig'] },
      { key: 'skill', label: 'Skill', kind: 'text', aliases: ['skill', 'skillname', 'tradecategory'], hint: 'Must match a Flexzora skill name' },
      { key: 'required_cert_codes', label: 'Required certs', kind: 'list', aliases: ['certs', 'certifications', 'requiredcerts', 'certreqs', 'certification', 'requirements', 'certcodes'], hint: 'Codes or names — "ETCP_ARENA" or "ETCP Arena"' },
      { key: 'headcount', label: 'Headcount', kind: 'integer', required: true, sniff: 'integer', aliases: ['headcount', 'count', 'crew', 'crewnumber', 'qty', 'needed', 'numworkers', 'workers', 'slots', 'positions'] },
      { key: 'hourly_rate', label: 'Hourly rate', kind: 'money', required: true, sniff: 'money', aliases: ['rate', 'hourlyrate', 'hourly', 'pay', 'wage', 'payrate', 'hrly', 'price', 'hr'] },
      { key: 'duration_minutes', label: 'Length (minutes)', kind: 'integer', sniff: 'integer', aliases: ['duration', 'minutes', 'durationminutes', 'length', 'calllength', 'hours'], hint: 'In minutes — 480 = an 8-hour call (defaults to 8h)' },
      { key: 'min_proficiency', label: 'Min skill tier (1–5)', kind: 'integer', sniff: 'integer', aliases: ['mintier', 'minproficiency', 'level', 'tier', 'minlevel', 'experience'] },
      { key: 'notes', label: 'Notes', kind: 'text', aliases: ['notes', 'note', 'comments', 'details', 'instructions'] },
    ],
  },
];

export const importTarget = (key: ImportTarget | string | undefined): ImportTargetDef | undefined =>
  IMPORT_TARGETS.find((t) => t.key === key);

/** Guess the likely target from parsed columns (first signature hit wins). */
export function suggestTarget(columns: string[]): ImportTargetDef | undefined {
  const norm = columns.map((c) => c.toLowerCase().replace(/[^a-z0-9]/g, ''));
  let best: { def: ImportTargetDef; hits: number } | undefined;
  for (const def of IMPORT_TARGETS) {
    if (def.comingSoon || def.signature.length === 0) continue;
    const hits = def.signature.filter((sig) => norm.some((c) => c.includes(sig))).length;
    if (hits > 0 && (!best || hits > best.hits)) best = { def, hits };
  }
  return best?.def;
}
