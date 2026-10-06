import { supabase } from '@/lib/supabase';
import { createCheckoutSession, isStripeDemoMode } from '@/lib/stripe';
import {
  AssignmentStatus,
  BroadcastStage,
  Certification,
  CertificationType,
  EscrowDeposit,
  EventFormData,
  Invoice,
  OvertimeRule,
  Payout,
  PayoutMethod,
  PreferredRosterEntry,
  ProductionEvent,
  Profile,
  RosterTier,
  Shift,
  ShiftAssignment,
  ShiftFormData,
  Timesheet,
  Venue,
  VenueFormData,
  WorkerSkill,
} from '@/lib/types';
import { BookedWindow, MatchResult, MatchWorkerInput, rankWorkersForShift } from './matchScore';
import { projectedShiftCost, FLSA_DEFAULT, OvertimePolicy } from './overtime';

type Result<T> = { data: T; error: string | null };

const ok = <T>(data: T): Result<T> => ({ data, error: null });
const fail = <T>(fallback: T, error: unknown): Result<T> => ({
  data: fallback,
  error:
    error instanceof Error
      ? error.message
      : error && typeof error === 'object' && 'message' in error && typeof error.message === 'string'
        ? error.message
        : String(error),
});

const SHIFT_WITH_CONTEXT = `
  *,
  skill:skills(*),
  event:events(*, venue:venues(*), company:companies(*)),
  assignments:shift_assignments(*, worker:profiles(*))
`;

export interface EventBudgetSummary {
  projectedLabor: number;
  approvedLabor: number;
  escrowFunded: number;
  escrowReleased: number;
  budgetCap: number | null;
  shiftsTotal: number;
  shiftsFilled: number;
  headcountRequired: number;
  headcountConfirmed: number;
}

const DEFAULT_PLATFORM_FEE_PCT = 12;
/** Assignment states a company may re-offer over; anything live (applied/offered/confirmed…) is left alone. */
const REOFFERABLE = new Set<AssignmentStatus>(['declined', 'withdrawn', 'rejected']);

type EventRow = ProductionEvent & { budget?: { budget_cap: number | null; platform_fee_pct: number } | null };

/** event_budgets is owner-only; surface it on the event when the caller could read it. */
function flattenBudget(row: EventRow): ProductionEvent {
  const { budget, ...event } = row;
  return { ...event, budget_cap: budget?.budget_cap ?? undefined, platform_fee_pct: budget?.platform_fee_pct ?? undefined };
}

export class MarketplaceService {
  // ---------------------------------------------------------------- reference data
  static async getCertificationTypes(): Promise<Result<CertificationType[]>> {
    try {
      const { data, error } = await supabase.from('certification_types').select('*').order('category').order('name');
      if (error) throw error;
      return ok(data ?? []);
    } catch (e) {
      return fail([], e);
    }
  }

  static async getOvertimeRules(): Promise<Result<OvertimeRule[]>> {
    try {
      const { data, error } = await supabase.from('overtime_rules').select('*').order('name');
      if (error) throw error;
      return ok(data ?? []);
    } catch (e) {
      return fail([], e);
    }
  }

  // ---------------------------------------------------------------- venues
  static async getVenues(companyId: string): Promise<Result<Venue[]>> {
    try {
      const { data, error } = await supabase.from('venues').select('*').eq('company_id', companyId).order('name');
      if (error) throw error;
      return ok(data ?? []);
    } catch (e) {
      return fail([], e);
    }
  }

  static async createVenue(companyId: string, form: VenueFormData): Promise<Result<Venue | null>> {
    try {
      const { data, error } = await supabase
        .from('venues')
        .insert({ ...form, company_id: companyId })
        .select()
        .single();
      if (error) throw error;
      return ok(data);
    } catch (e) {
      return fail(null, e);
    }
  }

  // ---------------------------------------------------------------- events
  static async getEvents(companyId: string): Promise<Result<ProductionEvent[]>> {
    try {
      const { data, error } = await supabase
        .from('events')
        .select('*, budget:event_budgets(budget_cap, platform_fee_pct), venue:venues(*), shifts:shifts(*, assignments:shift_assignments(id, status))')
        .eq('company_id', companyId)
        .order('starts_on', { ascending: true });
      if (error) throw error;
      return ok(((data ?? []) as ProductionEvent[]).map(flattenBudget));
    } catch (e) {
      return fail([], e);
    }
  }

  static async getEvent(eventId: string): Promise<Result<ProductionEvent | null>> {
    try {
      const { data, error } = await supabase
        .from('events')
        .select(`*, budget:event_budgets(budget_cap, platform_fee_pct), venue:venues(*), company:companies(*), shifts:shifts(*, skill:skills(*), assignments:shift_assignments(*, worker:profiles(*)))`)
        .eq('id', eventId)
        .single();
      if (error) throw error;
      const event = flattenBudget(data as ProductionEvent);
      event.shifts = (event.shifts ?? []).sort((a, b) => a.starts_at.localeCompare(b.starts_at));
      return ok(event);
    } catch (e) {
      return fail(null, e);
    }
  }

  static async createEvent(companyId: string, createdBy: string, form: EventFormData): Promise<Result<ProductionEvent | null>> {
    try {
      const { budget_cap, ...eventFields } = form;
      const { data, error } = await supabase
        .from('events')
        .insert({
          ...eventFields,
          venue_id: form.venue_id || undefined,
          company_id: companyId,
          created_by: createdBy,
          status: 'draft',
          color: '#3B82F6',
        })
        .select()
        .single();
      if (error) throw error;
      const { error: budgetErr } = await supabase
        .from('event_budgets')
        .insert({ event_id: data.id, budget_cap: budget_cap ?? null, platform_fee_pct: DEFAULT_PLATFORM_FEE_PCT });
      if (budgetErr) throw budgetErr;
      return ok({ ...data, budget_cap, platform_fee_pct: DEFAULT_PLATFORM_FEE_PCT });
    } catch (e) {
      return fail(null, e);
    }
  }

  static async updateEvent(eventId: string, updates: Partial<ProductionEvent>): Promise<Result<ProductionEvent | null>> {
    try {
      const { data, error } = await supabase.from('events').update(updates).eq('id', eventId).select().single();
      if (error) throw error;
      return ok(data);
    } catch (e) {
      return fail(null, e);
    }
  }

  /** Publishes the event and opens all draft shifts to the roster broadcast stage. */
  static async publishEvent(eventId: string): Promise<Result<boolean>> {
    try {
      const { error: evErr } = await supabase.from('events').update({ status: 'published' }).eq('id', eventId);
      if (evErr) throw evErr;
      const { error: shErr } = await supabase
        .from('shifts')
        .update({ status: 'open', broadcast_stage: 'roster', roster_broadcast_at: new Date().toISOString() })
        .eq('event_id', eventId)
        .eq('status', 'draft');
      if (shErr) throw shErr;
      return ok(true);
    } catch (e) {
      return fail(false, e);
    }
  }

  // ---------------------------------------------------------------- shifts
  /** Calls added to an already-published event go straight to the roster wave; drafts wait for publish. */
  static async createShift(event: Pick<ProductionEvent, 'id' | 'status'>, form: ShiftFormData): Promise<Result<Shift | null>> {
    try {
      const live = event.status !== 'draft';
      const { data, error } = await supabase
        .from('shifts')
        .insert({
          ...form,
          skill_id: form.skill_id || undefined,
          event_id: event.id,
          status: live ? 'open' : 'draft',
          broadcast_stage: live ? 'roster' : 'none',
          roster_broadcast_at: live ? new Date().toISOString() : undefined,
        })
        .select()
        .single();
      if (error) throw error;
      return ok(data);
    } catch (e) {
      return fail(null, e);
    }
  }

  static async updateShift(shiftId: string, updates: Partial<ShiftFormData> & Partial<Pick<Shift, 'status'>>): Promise<Result<Shift | null>> {
    try {
      const { data, error } = await supabase.from('shifts').update(updates).eq('id', shiftId).select().single();
      if (error) throw error;
      return ok(data);
    } catch (e) {
      return fail(null, e);
    }
  }

  static async deleteShift(shiftId: string): Promise<Result<boolean>> {
    try {
      const { error } = await supabase.from('shifts').delete().eq('id', shiftId);
      if (error) throw error;
      return ok(true);
    } catch (e) {
      return fail(false, e);
    }
  }

  /** Moves a shift through the broadcast waterfall: roster first, then the public marketplace. */
  static async broadcastShift(shiftId: string, stage: Exclude<BroadcastStage, 'none'>): Promise<Result<Shift | null>> {
    const now = new Date().toISOString();
    const updates =
      stage === 'roster'
        ? { status: 'open' as const, broadcast_stage: 'roster' as const, roster_broadcast_at: now }
        : { status: 'open' as const, broadcast_stage: 'public' as const, public_broadcast_at: now };
    try {
      const { data, error } = await supabase.from('shifts').update(updates).eq('id', shiftId).select().single();
      if (error) throw error;
      return ok(data);
    } catch (e) {
      return fail(null, e);
    }
  }

  static async getShift(shiftId: string): Promise<Result<Shift | null>> {
    try {
      const { data, error } = await supabase.from('shifts').select(SHIFT_WITH_CONTEXT).eq('id', shiftId).single();
      if (error) throw error;
      return ok(data as Shift);
    } catch (e) {
      return fail(null, e);
    }
  }

  /**
   * Shifts a worker can see on the marketplace: open, in the future, and either
   * publicly broadcast or roster-broadcast by a company whose roster includes the worker.
   */
  static async getMarketplaceShifts(workerId: string): Promise<Result<Shift[]>> {
    try {
      const [{ data: roster, error: rosterErr }, { data: shifts, error: shiftErr }] = await Promise.all([
        supabase.from('preferred_rosters').select('company_id, tier').eq('worker_id', workerId),
        supabase
          .from('shifts')
          .select(SHIFT_WITH_CONTEXT)
          .eq('status', 'open')
          .in('broadcast_stage', ['roster', 'public'])
          .gt('starts_at', new Date().toISOString())
          .order('starts_at'),
      ]);
      if (rosterErr) throw rosterErr;
      if (shiftErr) throw shiftErr;
      const rosterCompanies = new Set((roster ?? []).filter((r) => r.tier !== 'blocked').map((r) => r.company_id));
      const blocked = new Set((roster ?? []).filter((r) => r.tier === 'blocked').map((r) => r.company_id));
      const visible = ((shifts ?? []) as Shift[]).filter((s) => {
        const companyId = s.event?.company_id;
        if (companyId && blocked.has(companyId)) return false;
        return s.broadcast_stage === 'public' || (companyId != null && rosterCompanies.has(companyId));
      });
      return ok(visible);
    } catch (e) {
      return fail([], e);
    }
  }

  static async getNearbyShiftIds(lat: number, lng: number, radiusM: number): Promise<Result<{ shift_id: string; distance_m: number }[]>> {
    try {
      const { data, error } = await supabase.rpc('nearby_shifts', { p_lat: lat, p_lng: lng, p_radius_m: radiusM });
      if (error) throw error;
      return ok(data ?? []);
    } catch (e) {
      return fail([], e);
    }
  }

  // ---------------------------------------------------------------- assignments
  static async getWorkerAssignments(workerId: string, statuses?: AssignmentStatus[]): Promise<Result<ShiftAssignment[]>> {
    try {
      let q = supabase
        .from('shift_assignments')
        .select('*, shift:shifts(*, event:events(*, venue:venues(*), company:companies(*))), timesheet:timesheets(*)')
        .eq('worker_id', workerId)
        .order('created_at', { ascending: false });
      if (statuses?.length) q = q.in('status', statuses);
      const { data, error } = await q;
      if (error) throw error;
      const rows = (data ?? []).map((row) => ({
        ...row,
        timesheet: Array.isArray(row.timesheet) ? row.timesheet[0] : row.timesheet,
      })) as ShiftAssignment[];
      return ok(rows);
    } catch (e) {
      return fail([], e);
    }
  }

  static async applyToShift(shift: Pick<Shift, 'id' | 'broadcast_stage'>, workerId: string, match?: MatchResult): Promise<Result<ShiftAssignment | null>> {
    try {
      const { data, error } = await supabase
        .from('shift_assignments')
        .insert({
          shift_id: shift.id,
          worker_id: workerId,
          status: 'applied',
          source: shift.broadcast_stage === 'roster' ? 'roster_broadcast' : 'public_marketplace',
          match_score: match?.score,
          match_breakdown: match?.breakdown,
        })
        .select()
        .single();
      if (error) throw error;
      return ok(data);
    } catch (e) {
      return fail(null, e);
    }
  }

  static async directBook(shiftId: string, workerId: string, match: MatchResult, offeredRate?: number): Promise<Result<ShiftAssignment | null>> {
    try {
      const { data: existing, error: existingError } = await supabase
        .from('shift_assignments')
        .select('id, status')
        .eq('shift_id', shiftId)
        .eq('worker_id', workerId)
        .maybeSingle();
      if (existingError) throw existingError;

      const terms = { status: 'offered' as const, match_score: match.score, match_breakdown: match.breakdown, offered_rate: offeredRate };
      if (!existing) {
        const { data, error } = await supabase
          .from('shift_assignments')
          .insert({
            shift_id: shiftId,
            worker_id: workerId,
            source: match.breakdown.roster > 0 ? 'roster_broadcast' : 'direct_book',
            ...terms,
          })
          .select()
          .single();
        if (error) throw error;
        return ok(data);
      }
      if (!REOFFERABLE.has(existing.status as AssignmentStatus)) {
        return fail(null, new Error(`Worker already has a ${existing.status} assignment on this call`));
      }
      const { data, error } = await supabase.from('shift_assignments').update(terms).eq('id', existing.id).select().single();
      if (error) throw error;
      return ok(data);
    } catch (e) {
      return fail(null, e);
    }
  }

  /** Worker accepts/declines a direct-book offer, or withdraws from a confirmed booking. */
  static async respondToOffer(assignmentId: string, response: 'confirmed' | 'declined' | 'withdrawn'): Promise<Result<ShiftAssignment | null>> {
    try {
      const now = new Date().toISOString();
      const { data, error } = await supabase
        .from('shift_assignments')
        .update({ status: response, responded_at: now, confirmed_at: response === 'confirmed' ? now : undefined })
        .eq('id', assignmentId)
        .select()
        .single();
      if (error) throw error;
      return ok(data);
    } catch (e) {
      return fail(null, e);
    }
  }

  /** Company confirms or rejects a marketplace application, or flags a no-show. */
  static async decideApplication(assignmentId: string, decision: 'confirmed' | 'rejected' | 'no_show'): Promise<Result<ShiftAssignment | null>> {
    try {
      const now = new Date().toISOString();
      const { data, error } = await supabase
        .from('shift_assignments')
        .update({ status: decision, responded_at: now, confirmed_at: decision === 'confirmed' ? now : undefined })
        .eq('id', assignmentId)
        .select()
        .single();
      if (error) throw error;
      return ok(data);
    } catch (e) {
      return fail(null, e);
    }
  }

  // ---------------------------------------------------------------- roster
  static async getRoster(companyId: string): Promise<Result<PreferredRosterEntry[]>> {
    try {
      const { data, error } = await supabase
        .from('preferred_rosters')
        .select('*, worker:profiles!preferred_rosters_worker_id_fkey(*)')
        .eq('company_id', companyId)
        .order('tier');
      if (error) throw error;
      return ok(data ?? []);
    } catch (e) {
      return fail([], e);
    }
  }

  static async setRosterTier(companyId: string, workerId: string, tier: RosterTier, addedBy: string): Promise<Result<PreferredRosterEntry | null>> {
    try {
      const { data, error } = await supabase
        .from('preferred_rosters')
        .upsert({ company_id: companyId, worker_id: workerId, tier, added_by: addedBy }, { onConflict: 'company_id,worker_id' })
        .select()
        .single();
      if (error) throw error;
      return ok(data);
    } catch (e) {
      return fail(null, e);
    }
  }

  static async removeFromRoster(companyId: string, workerId: string): Promise<Result<boolean>> {
    try {
      const { error } = await supabase.from('preferred_rosters').delete().eq('company_id', companyId).eq('worker_id', workerId);
      if (error) throw error;
      return ok(true);
    } catch (e) {
      return fail(false, e);
    }
  }

  // ---------------------------------------------------------------- matching
  /** Builds match inputs for every available worker and ranks them for the given shift. */
  static async rankCandidates(shift: Shift, companyId: string): Promise<Result<(MatchResult & { worker: Profile })[]>> {
    try {
      const [workersRes, certsRes, skillsRes, historyRes, rosterRes] = await Promise.all([
        supabase.from('profiles').select('*').eq('role', 'worker').eq('is_available', true),
        supabase.from('certifications').select('worker_id, cert_type_code, is_active, expiration_date, verified').eq('is_active', true),
        supabase.from('worker_skills').select('worker_id, skill_id, proficiency_level'),
        supabase.from('shift_assignments').select('worker_id, status').in('status', ['completed', 'no_show', 'withdrawn']),
        supabase.from('preferred_rosters').select('worker_id, tier').eq('company_id', companyId),
      ]);
      for (const r of [workersRes, certsRes, skillsRes, historyRes, rosterRes]) {
        if (r.error) throw r.error;
      }

      const workers = (workersRes.data ?? []) as Profile[];
      const workerIds = workers.map((w) => w.id);

      // Proximity and conflict checks go through SECURITY DEFINER functions so
      // raw coordinates and other companies' bookings never leave the database.
      const venue = shift.event?.venue;
      const [distancesRes, conflictsRes] = await Promise.all([
        venue
          ? supabase.rpc('worker_distances', { p_worker_ids: workerIds, p_lat: venue.latitude, p_lng: venue.longitude })
          : Promise.resolve({ data: [] as { worker_id: string; distance_km: number | null }[], error: null }),
        supabase.rpc('worker_conflicts', {
          p_worker_ids: workerIds,
          p_start: shift.starts_at,
          p_end: shift.ends_at,
          p_buffer_minutes: 60,
        }),
      ]);
      if (distancesRes.error) throw distancesRes.error;
      if (conflictsRes.error) throw conflictsRes.error;
      const distanceByWorker = new Map(
        ((distancesRes.data ?? []) as { worker_id: string; distance_km: number | null }[]).map((d) => [d.worker_id, d.distance_km]),
      );
      const conflictsByWorker = new Map(
        ((conflictsRes.data ?? []) as { worker_id: string; hard_conflict: boolean; buffer_conflict: boolean }[]).map((c) => [
          c.worker_id,
          { hard: c.hard_conflict, buffer: c.buffer_conflict },
        ]),
      );

      const certsByWorker = groupBy(certsRes.data ?? [], (c) => c.worker_id as string);
      const skillsByWorker = groupBy(skillsRes.data ?? [], (s) => s.worker_id as string);
      const historyByWorker = groupBy(historyRes.data ?? [], (h) => h.worker_id as string);
      const rosterByWorker = new Map((rosterRes.data ?? []).map((r) => [r.worker_id as string, r.tier as RosterTier]));

      const inputs: MatchWorkerInput[] = workers.map((w) => {
        const history = historyByWorker.get(w.id) ?? [];
        const completed = history.filter((h) => h.status === 'completed').length;
        const bad = history.length - completed;
        return {
          id: w.id,
          location: null,
          distanceKm: distanceByWorker.get(w.id) ?? null,
          travelRadiusKm: w.travel_radius_km ?? 80,
          certifications: (certsByWorker.get(w.id) ?? []) as Pick<Certification, 'cert_type_code' | 'is_active' | 'expiration_date' | 'verified'>[],
          skills: (skillsByWorker.get(w.id) ?? []) as Pick<WorkerSkill, 'skill_id' | 'proficiency_level'>[],
          bookedWindows: [],
          conflicts: conflictsByWorker.get(w.id) ?? { hard: false, buffer: false },
          avgRating: w.average_rating ?? null,
          reliabilityRate: history.length ? completed / (completed + bad) : null,
          completedShifts: completed,
          rosterTier: rosterByWorker.get(w.id) ?? null,
        };
      });

      const ranked = rankWorkersForShift(inputs, {
        id: shift.id,
        starts_at: shift.starts_at,
        ends_at: shift.ends_at,
        required_cert_codes: shift.required_cert_codes ?? [],
        skill_id: shift.skill_id,
        min_proficiency: shift.min_proficiency,
        venueLocation: venue ? { lat: venue.latitude, lng: venue.longitude } : null,
      });

      const byId = new Map(workers.map((w) => [w.id, w]));
      return ok(ranked.map((r) => ({ ...r, worker: byId.get(r.workerId)! })));
    } catch (e) {
      return fail([], e);
    }
  }

  /** Match score for a single worker against many shifts (worker-side marketplace view). */
  static async scoreShiftsForWorker(workerId: string, shifts: Shift[]): Promise<Result<Map<string, MatchResult>>> {
    try {
      const [profileRes, sensitiveRes, certsRes, skillsRes, bookingsRes, historyRes, rosterRes, blockedRes] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', workerId).single(),
        supabase.from('worker_sensitive').select('latitude, longitude').eq('worker_id', workerId).maybeSingle(),
        supabase.from('certifications').select('cert_type_code, is_active, expiration_date, verified').eq('worker_id', workerId).eq('is_active', true),
        supabase.from('worker_skills').select('skill_id, proficiency_level').eq('worker_id', workerId),
        supabase.from('shift_assignments').select('shift:shifts!inner(starts_at, ends_at)').eq('worker_id', workerId).eq('status', 'confirmed'),
        supabase.from('shift_assignments').select('status').eq('worker_id', workerId).in('status', ['completed', 'no_show', 'withdrawn']),
        supabase.from('preferred_rosters').select('company_id, tier').eq('worker_id', workerId),
        supabase.from('availability').select('start_time, end_time').eq('worker_id', workerId).eq('is_available', false),
      ]);
      for (const r of [profileRes, sensitiveRes, certsRes, skillsRes, bookingsRes, historyRes, rosterRes, blockedRes]) {
        if (r.error) throw r.error;
      }
      const w = profileRes.data as Profile;
      const sensitive = sensitiveRes.data as { latitude: number | null; longitude: number | null } | null;
      const history = historyRes.data ?? [];
      const completed = history.filter((h) => h.status === 'completed').length;
      const rosterByCompany = new Map((rosterRes.data ?? []).map((r) => [r.company_id as string, r.tier as RosterTier]));
      const bookings = ((bookingsRes.data ?? []) as unknown as { shift: { starts_at: string; ends_at: string } }[]).map((b) => b.shift);

      const base: Omit<MatchWorkerInput, 'rosterTier'> = {
        id: w.id,
        location: sensitive?.latitude != null && sensitive?.longitude != null ? { lat: sensitive.latitude, lng: sensitive.longitude } : null,
        travelRadiusKm: w.travel_radius_km ?? 80,
        certifications: (certsRes.data ?? []) as Pick<Certification, 'cert_type_code' | 'is_active' | 'expiration_date' | 'verified'>[],
        skills: (skillsRes.data ?? []) as Pick<WorkerSkill, 'skill_id' | 'proficiency_level'>[],
        bookedWindows: bookings,
        unavailableWindows: (blockedRes.data ?? []).map(toWindow),
        avgRating: w.average_rating ?? null,
        reliabilityRate: history.length ? completed / history.length : null,
        completedShifts: completed,
      };

      const results = new Map<string, MatchResult>();
      for (const s of shifts) {
        const venue = s.event?.venue;
        const [r] = rankWorkersForShift([{ ...base, rosterTier: rosterByCompany.get(s.event?.company_id ?? '') ?? null }], {
          id: s.id,
          starts_at: s.starts_at,
          ends_at: s.ends_at,
          required_cert_codes: s.required_cert_codes ?? [],
          skill_id: s.skill_id,
          min_proficiency: s.min_proficiency,
          venueLocation: venue ? { lat: venue.latitude, lng: venue.longitude } : null,
        });
        results.set(s.id, r);
      }
      return ok(results);
    } catch (e) {
      return fail(new Map(), e);
    }
  }

  // ---------------------------------------------------------------- timesheets
  static async clockEvent(assignmentId: string, kind: 'in' | 'out', lat: number, lng: number): Promise<Result<Timesheet | null>> {
    try {
      const { data, error } = await supabase.rpc('validate_clock_event', {
        p_assignment_id: assignmentId,
        p_kind: kind,
        p_lat: lat,
        p_lng: lng,
      });
      if (error) throw error;
      return ok(data as Timesheet);
    } catch (e) {
      return fail(null, e);
    }
  }

  static async getCompanyTimesheets(companyId: string, statuses?: Timesheet['status'][]): Promise<Result<Timesheet[]>> {
    try {
      let q = supabase
        .from('timesheets')
        .select('*, worker:profiles!timesheets_worker_id_fkey(*), assignment:shift_assignments(offered_rate), shift:shifts!inner(*, event:events!inner(*, venue:venues(*)))')
        .eq('shift.event.company_id', companyId)
        .order('clock_in_at', { ascending: false });
      if (statuses?.length) q = q.in('status', statuses);
      const { data, error } = await q;
      if (error) throw error;
      return ok((data ?? []) as unknown as Timesheet[]);
    } catch (e) {
      return fail([], e);
    }
  }

  static async getWorkerTimesheets(workerId: string): Promise<Result<Timesheet[]>> {
    try {
      const { data, error } = await supabase
        .from('timesheets')
        .select('*, shift:shifts(*, event:events(*, venue:venues(*), company:companies(*)))')
        .eq('worker_id', workerId)
        .order('clock_in_at', { ascending: false });
      if (error) throw error;
      return ok((data ?? []) as unknown as Timesheet[]);
    } catch (e) {
      return fail([], e);
    }
  }

  static async approveTimesheet(timesheetId: string, breakMinutes: number | null, payoutMethod: PayoutMethod): Promise<Result<Invoice | null>> {
    try {
      const { data, error } = await supabase.rpc('approve_timesheet', {
        p_timesheet_id: timesheetId,
        p_break_minutes: breakMinutes,
        p_payout_method: payoutMethod,
      });
      if (error) throw error;
      return ok(data as Invoice);
    } catch (e) {
      return fail(null, e);
    }
  }

  static async disputeTimesheet(timesheetId: string, managerNotes: string): Promise<Result<boolean>> {
    try {
      const { error } = await supabase.from('timesheets').update({ status: 'disputed', manager_notes: managerNotes }).eq('id', timesheetId);
      if (error) throw error;
      return ok(true);
    } catch (e) {
      return fail(false, e);
    }
  }

  // ---------------------------------------------------------------- money
  static async getInvoices(filter: { workerId?: string; companyId?: string; taxYear?: number }): Promise<Result<Invoice[]>> {
    try {
      let q = supabase
        .from('invoices')
        .select('*, event:events(*), company:companies(*), worker:profiles(*), payout:payouts(*)')
        .order('issued_at', { ascending: false });
      if (filter.workerId) q = q.eq('worker_id', filter.workerId);
      if (filter.companyId) q = q.eq('company_id', filter.companyId);
      if (filter.taxYear) q = q.eq('tax_year', filter.taxYear);
      const { data, error } = await q;
      if (error) throw error;
      const rows = (data ?? []).map((row) => ({ ...row, payout: Array.isArray(row.payout) ? row.payout[0] : row.payout })) as Invoice[];
      return ok(rows);
    } catch (e) {
      return fail([], e);
    }
  }

  static async getPayouts(workerId: string): Promise<Result<Payout[]>> {
    try {
      const { data, error } = await supabase
        .from('payouts')
        .select('*, invoice:invoices(*, event:events(*), company:companies(*))')
        .eq('worker_id', workerId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return ok((data ?? []) as Payout[]);
    } catch (e) {
      return fail([], e);
    }
  }

  static async getEscrow(eventId: string): Promise<Result<EscrowDeposit[]>> {
    try {
      const { data, error } = await supabase.from('escrow_deposits').select('*').eq('event_id', eventId).order('created_at');
      if (error) throw error;
      return ok(data ?? []);
    } catch (e) {
      return fail([], e);
    }
  }

  /** Records an escrow deposit. `paymentIntentId` links it to the Stripe PaymentIntent created by the checkout edge function. */
  /**
   * Opens a pending deposit and hands the company to Stripe Checkout. The deposit only
   * becomes `funded` when the `stripe-webhook` edge function confirms the payment via
   * `mark_escrow_funded`, so approvals can never draw on money that was not collected.
   */
  static async fundEscrow(event: Pick<ProductionEvent, 'id' | 'company_id' | 'name'>, amount: number): Promise<Result<{ deposit: EscrowDeposit; checkoutUrl: string } | null>> {
    try {
      const returnTo = `${window.location.origin}/events/${event.id}`;

      // Sandbox mode (no Stripe keys configured): record the deposit as a
      // queued pending row — the escrow insert policy only permits 'pending' —
      // and round-trip back to the event page so the UI flow stays identical.
      // The pending row never counts toward the funded balance, so the demo
      // never claims money it did not collect.
      if (isStripeDemoMode) {
        const { data: deposit, error } = await supabase
          .from('escrow_deposits')
          .insert({ event_id: event.id, company_id: event.company_id, amount, released_amount: 0, currency: 'USD', status: 'pending' })
          .select()
          .single();
        if (error) throw error;
        return ok({ deposit: deposit as EscrowDeposit, checkoutUrl: `${returnTo}?escrow=queued` });
      }

      const { data: deposit, error } = await supabase
        .from('escrow_deposits')
        .insert({ event_id: event.id, company_id: event.company_id, amount, released_amount: 0, currency: 'USD', status: 'pending' })
        .select()
        .single();
      if (error) throw error;

      const checkout = await createCheckoutSession(
        [{
          price_data: {
            currency: 'usd',
            product_data: { name: `Escrow deposit – ${event.name}`, description: 'Held in escrow and released to crew as timesheets are approved' },
            unit_amount: Math.round(amount * 100),
          },
          quantity: 1,
        }],
        `${returnTo}?escrow=funded`,
        `${returnTo}?escrow=cancelled`,
        { escrow_deposit_id: deposit.id, event_id: event.id, company_id: event.company_id },
      );
      if (checkout.error || !checkout.url) throw new Error(checkout.error ?? 'Stripe Checkout did not return a URL');
      return ok({ deposit: deposit as EscrowDeposit, checkoutUrl: checkout.url });
    } catch (e) {
      return fail(null, e);
    }
  }

  static async getEventBudget(event: ProductionEvent, rule?: OvertimePolicy): Promise<Result<EventBudgetSummary>> {
    try {
      const [{ data: escrow, error: escErr }, { data: sheets, error: tsErr }] = await Promise.all([
        supabase.from('escrow_deposits').select('amount, released_amount, status').eq('event_id', event.id),
        supabase.from('timesheets').select('gross_pay, status, shift:shifts!inner(event_id)').eq('shift.event_id', event.id).in('status', ['approved', 'paid']),
      ]);
      if (escErr) throw escErr;
      if (tsErr) throw tsErr;

      const shifts = event.shifts ?? [];
      let policy = rule;
      if (!policy) {
        const { data: ruleRow } = await supabase
          .from('overtime_rules')
          .select('*')
          .eq('code', event.overtime_rule_code ?? 'US_FLSA')
          .maybeSingle();
        policy = ruleRow ?? FLSA_DEFAULT;
      }
      const projectedLabor = shifts
        .filter((s) => s.status !== 'cancelled')
        .reduce((sum, s) => sum + projectedShiftCost(s.starts_at, s.ends_at, s.hourly_rate, s.headcount, policy), 0);
      const confirmed = (s: Shift) => (s.assignments ?? []).filter((a) => a.status === 'confirmed' || a.status === 'completed').length;

      return ok({
        projectedLabor: Math.round(projectedLabor * 100) / 100,
        approvedLabor: (sheets ?? []).reduce((sum, t) => sum + Number(t.gross_pay ?? 0), 0),
        escrowFunded: (escrow ?? []).filter((e) => e.status !== 'pending' && e.status !== 'refunded').reduce((s, e) => s + Number(e.amount), 0),
        escrowReleased: (escrow ?? []).reduce((s, e) => s + Number(e.released_amount), 0),
        budgetCap: event.budget_cap ?? null,
        shiftsTotal: shifts.length,
        shiftsFilled: shifts.filter((s) => confirmed(s) >= s.headcount).length,
        headcountRequired: shifts.reduce((s, sh) => s + sh.headcount, 0),
        headcountConfirmed: shifts.reduce((s, sh) => s + confirmed(sh), 0),
      });
    } catch (e) {
      return fail(
        { projectedLabor: 0, approvedLabor: 0, escrowFunded: 0, escrowReleased: 0, budgetCap: null, shiftsTotal: 0, shiftsFilled: 0, headcountRequired: 0, headcountConfirmed: 0 },
        e,
      );
    }
  }

  // ---------------------------------------------------------------- realtime
  static subscribeToEventShifts(eventId: string, callback: () => void) {
    return supabase
      .channel(`event-shifts-${eventId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shifts', filter: `event_id=eq.${eventId}` }, callback)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shift_assignments' }, callback)
      .subscribe();
  }

  static subscribeToWorkerAssignments(workerId: string, callback: () => void) {
    return supabase
      .channel(`worker-assignments-${workerId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shift_assignments', filter: `worker_id=eq.${workerId}` }, callback)
      .subscribe();
  }
}

const toWindow = (a: { start_time: string; end_time: string }): BookedWindow => ({ starts_at: a.start_time, ends_at: a.end_time });

function groupBy<T>(rows: T[], key: (row: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const k = key(row);
    const list = map.get(k);
    if (list) list.push(row);
    else map.set(k, [row]);
  }
  return map;
}

