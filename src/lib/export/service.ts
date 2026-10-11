// ExportService — gather company data for a date range and shape it into
// exportable rows. Row builders are pure so they're unit-testable.
import { supabase } from '@/lib/supabase';

export interface ExportShiftCrew {
  name: string;
  email?: string | null;
  phone?: string | null;
  status: string;
}

export interface ExportShift {
  event_name: string;
  event_id: string;
  timezone: string;
  shift_title: string;
  role_name: string;
  starts_at: string;
  ends_at: string;
  headcount: number;
  hourly_rate: number;
  crew: ExportShiftCrew[];
}

export interface ExportStaff {
  event_name: string;
  event_id: string;
  member_name: string;
  member_email?: string | null;
  member_phone?: string | null;
  role_label?: string | null;
  call_time?: string | null;
  status: string;
}

export interface ExportData {
  shifts: ExportShift[];
  staff: ExportStaff[];
  from: string;
  to: string;
}

// ---------------------------------------------------------------------------
// Pure row builders
// ---------------------------------------------------------------------------

const fmt = (iso: string | null | undefined, withTime = true) => {
  if (!iso) return '';
  const d = new Date(iso);
  return withTime
    ? d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};

/** One row per worker who worked (or is booked on) anything in the range. */
export function buildCrewListRows(data: ExportData): { headers: string[]; rows: (string | number)[][] } {
  const byWorker = new Map<string, { name: string; email: string; phone: string; calls: number; roles: Set<string>; events: Set<string> }>();
  for (const s of data.shifts) {
    for (const c of s.crew) {
      const key = c.email ?? c.name;
      const w = byWorker.get(key) ?? { name: c.name, email: c.email ?? '', phone: c.phone ?? '', calls: 0, roles: new Set(), events: new Set() };
      w.calls += 1;
      w.roles.add(s.role_name);
      w.events.add(s.event_name);
      byWorker.set(key, w);
    }
  }
  const rows = [...byWorker.values()]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((w) => [w.name, w.email, w.phone, w.calls, [...w.roles].join('; '), [...w.events].join('; ')]);
  return { headers: ['Name', 'Email', 'Phone', 'Calls', 'Roles', 'Events'], rows };
}

/** One row per call, confirmed names flattened in. */
export function buildScheduleRows(data: ExportData): { headers: string[]; rows: (string | number)[][] } {
  const rows: (string | number)[][] = data.shifts.map((s) => [
    s.event_name,
    fmt(s.starts_at),
    fmt(s.ends_at),
    `${s.shift_title} — ${s.role_name}`,
    s.crew.length,
    s.headcount,
    s.crew.filter((c) => c.status === 'confirmed' || c.status === 'completed').map((c) => c.name).join('; ') || '(unfilled)',
    s.hourly_rate,
    s.timezone,
  ]);
  for (const st of data.staff) {
    rows.push([st.event_name, fmt(st.call_time), '', `Staff — ${st.member_name}${st.role_label ? ` (${st.role_label})` : ''}`, 1, 1, st.member_name, '', '']);
  }
  return { headers: ['Event', 'Start', 'End', 'Call / Role', 'Booked', 'Needed', 'Crew', 'Rate', 'Zone'], rows };
}

/** One row per staff assignment — for the printable crew sheet. */
export function buildStaffRows(data: ExportData): { headers: string[]; rows: (string | number)[][] } {
  return {
    headers: ['Name', 'Event', 'Role', 'Call time', 'Status', 'Email', 'Phone'],
    rows: data.staff.map((s) => [s.member_name, s.event_name, s.role_label ?? '', fmt(s.call_time), s.status, s.member_email ?? '', s.member_phone ?? '']),
  };
}

// ---------------------------------------------------------------------------
// Data gathering — reads under the caller's own RLS session.
// ---------------------------------------------------------------------------

export async function gatherExportData(companyId: string, from: string, to: string): Promise<ExportData> {
  const fromIso = `${from}T00:00:00`;
  const toIso = `${to}T23:59:59.999`;

  const { data: events } = await supabase
    .from('events')
    .select('id, name, timezone, starts_on, ends_on')
    .eq('company_id', companyId)
    .gte('ends_on', from)
    .lte('starts_on', to);
  const eventMap = new Map((events ?? []).map((e) => [e.id, e]));
  const eventIds = [...eventMap.keys()];

  let shifts: ExportShift[] = [];
  let staff: ExportStaff[] = [];

  if (eventIds.length) {
    const { data: shiftRows } = await supabase
      .from('shifts')
      .select('id, event_id, title, role_name, starts_at, ends_at, headcount, hourly_rate')
      .in('event_id', eventIds)
      .gte('starts_at', fromIso)
      .lte('starts_at', toIso)
      .order('starts_at');
    const shiftIds = (shiftRows ?? []).map((s) => s.id);

    const { data: assignments } = shiftIds.length
      ? await supabase
          .from('shift_assignments')
          .select('shift_id, status, worker:profiles(full_name, email, phone)')
          .in('shift_id', shiftIds)
          .in('status', ['confirmed', 'completed', 'offered', 'applied'])
      : { data: [] };

    const crewByShift = new Map<string, ExportShiftCrew[]>();
    for (const a of (assignments ?? []) as { shift_id: string; status: string; worker?: { full_name: string; email?: string; phone?: string }[] | { full_name: string; email?: string; phone?: string } | null }[]) {
      const worker = Array.isArray(a.worker) ? a.worker[0] : a.worker;
      const list = crewByShift.get(a.shift_id) ?? [];
      list.push({ name: worker?.full_name ?? '—', email: worker?.email, phone: worker?.phone, status: a.status });
      crewByShift.set(a.shift_id, list);
    }

    shifts = (shiftRows ?? []).map((s) => ({
      event_name: eventMap.get(s.event_id)?.name ?? '',
      event_id: s.event_id,
      timezone: eventMap.get(s.event_id)?.timezone ?? 'America/Los_Angeles',
      shift_title: s.title,
      role_name: s.role_name,
      starts_at: s.starts_at,
      ends_at: s.ends_at,
      headcount: s.headcount,
      hourly_rate: s.hourly_rate,
      crew: crewByShift.get(s.id) ?? [],
    }));

    const { data: staffRows } = await supabase
      .from('staff_assignments')
      .select('event_id, role_label, call_time, status, member:staff_members(full_name, email, phone)')
      .in('event_id', eventIds);
    staff = ((staffRows ?? []) as { event_id: string; role_label?: string | null; call_time?: string | null; status: string; member?: { full_name: string; email?: string; phone?: string }[] | { full_name: string; email?: string; phone?: string } | null }[])
      .filter((s) => !s.call_time || (s.call_time >= fromIso && s.call_time <= toIso))
      .map((s) => {
        const member = Array.isArray(s.member) ? s.member[0] : s.member;
        return {
        event_name: eventMap.get(s.event_id)?.name ?? '',
        event_id: s.event_id,
        member_name: member?.full_name ?? '—',
        member_email: member?.email,
        member_phone: member?.phone,
        role_label: s.role_label,
        call_time: s.call_time,
        status: s.status,
        };
      });
  }

  return { shifts, staff, from, to };
}
