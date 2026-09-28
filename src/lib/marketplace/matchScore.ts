import { Certification, MatchBreakdown, Shift, WorkerSkill } from '@/lib/types';
import { LatLng, distanceKm } from './geo';

/**
 * Smart Matching Engine
 *
 * Gatekeeper (mandatory): required certifications + skill tier. Fail => score 0.
 * Weighted components (sum = 100%):
 *   proximity     30%  distance from worker home base to venue
 *   availability  30%  no overlap with other confirmed bookings (+ declared unavailability)
 *   performance   20%  avg rating & reliability (no-show / withdrawal history)
 *   roster        20%  membership on the hiring company's trusted roster
 */
export const MATCH_WEIGHTS = {
  proximity: 0.3,
  availability: 0.3,
  performance: 0.2,
  roster: 0.2,
} as const;

export interface BookedWindow {
  starts_at: string;
  ends_at: string;
}

export interface MatchWorkerInput {
  id: string;
  location: LatLng | null;
  travelRadiusKm: number;
  certifications: Pick<Certification, 'cert_type_code' | 'is_active' | 'expiration_date' | 'verified'>[];
  skills: Pick<WorkerSkill, 'skill_id' | 'proficiency_level'>[];
  bookedWindows: BookedWindow[];
  unavailableWindows?: BookedWindow[];
  avgRating: number | null;        // 1..5
  reliabilityRate: number | null;  // 0..1
  completedShifts: number;
  rosterTier: 'core' | 'preferred' | 'blocked' | null;
}

export interface MatchShiftInput
  extends Pick<Shift, 'id' | 'starts_at' | 'ends_at' | 'required_cert_codes' | 'skill_id' | 'min_proficiency'> {
  venueLocation: LatLng | null;
  bufferMinutes?: number; // travel/turnaround buffer between shifts
}

export interface MatchResult {
  workerId: string;
  shiftId: string;
  score: number; // 0..100
  breakdown: MatchBreakdown;
  reasons: string[];
}

const clamp = (n: number, lo = 0, hi = 100) => Math.min(hi, Math.max(lo, n));
const round1 = (n: number) => Math.round(n * 10) / 10;

export function windowsOverlap(a: BookedWindow, b: BookedWindow, bufferMinutes = 0): boolean {
  const buffer = bufferMinutes * 60_000;
  const aStart = new Date(a.starts_at).getTime() - buffer;
  const aEnd = new Date(a.ends_at).getTime() + buffer;
  return aStart < new Date(b.ends_at).getTime() && aEnd > new Date(b.starts_at).getTime();
}

export function checkGatekeeper(worker: MatchWorkerInput, shift: MatchShiftInput, now = new Date()): { passed: boolean; reasons: string[] } {
  const reasons: string[] = [];

  if (worker.rosterTier === 'blocked') {
    reasons.push('Worker is blocked by this company');
  }

  for (const code of shift.required_cert_codes ?? []) {
    const cert = worker.certifications.find(
      (c) => c.cert_type_code === code && c.is_active && (!c.expiration_date || new Date(c.expiration_date) >= now),
    );
    if (!cert) reasons.push(`Missing required certification: ${code}`);
  }

  if (shift.skill_id) {
    const skill = worker.skills.find((s) => s.skill_id === shift.skill_id);
    if (!skill) reasons.push('Missing required skill');
    else if (skill.proficiency_level < shift.min_proficiency) {
      reasons.push(`Skill tier ${skill.proficiency_level} below required ${shift.min_proficiency}`);
    }
  }

  return { passed: reasons.length === 0, reasons };
}

/** 100 at the venue, linear falloff to 0 at the worker's travel radius (min 10 km). */
export function proximityScore(worker: MatchWorkerInput, shift: MatchShiftInput): { score: number; distanceKm: number | null } {
  if (!worker.location || !shift.venueLocation) return { score: 50, distanceKm: null };
  const d = distanceKm(worker.location, shift.venueLocation);
  const radius = Math.max(worker.travelRadiusKm || 80, 10);
  return { score: clamp(100 * (1 - d / radius)), distanceKm: Math.round(d * 10) / 10 };
}

/** 100 if free; 0 on hard conflict with a confirmed booking or declared unavailability; 60 if only the buffer is violated. */
export function availabilityScore(worker: MatchWorkerInput, shift: MatchShiftInput): number {
  const window: BookedWindow = { starts_at: shift.starts_at, ends_at: shift.ends_at };
  const hardConflict =
    worker.bookedWindows.some((w) => windowsOverlap(w, window)) ||
    (worker.unavailableWindows ?? []).some((w) => windowsOverlap(w, window));
  if (hardConflict) return 0;
  const bufferConflict = worker.bookedWindows.some((w) => windowsOverlap(w, window, shift.bufferMinutes ?? 60));
  return bufferConflict ? 60 : 100;
}

/** Ratings and reliability blend; new workers land at a neutral 60 so they are not shut out. */
export function performanceScore(worker: MatchWorkerInput): number {
  if (worker.completedShifts === 0 && worker.avgRating == null && worker.reliabilityRate == null) return 60;
  const rating = worker.avgRating != null ? ((worker.avgRating - 1) / 4) * 100 : 60;
  const reliability = worker.reliabilityRate != null ? worker.reliabilityRate * 100 : 60;
  const experienceBonus = Math.min(worker.completedShifts, 25) / 25 * 10;
  return clamp(rating * 0.5 + reliability * 0.5 + experienceBonus);
}

export function rosterScore(worker: MatchWorkerInput): number {
  switch (worker.rosterTier) {
    case 'core':
      return 100;
    case 'preferred':
      return 80;
    default:
      return 0;
  }
}

export function calculateMatch(worker: MatchWorkerInput, shift: MatchShiftInput, now = new Date()): MatchResult {
  const gate = checkGatekeeper(worker, shift, now);
  const { score: proximity, distanceKm: dist } = proximityScore(worker, shift);
  const availability = availabilityScore(worker, shift);
  const performance = performanceScore(worker);
  const roster = rosterScore(worker);

  const breakdown: MatchBreakdown = {
    gatekeeperPassed: gate.passed,
    gatekeeperReasons: gate.reasons,
    proximity: round1(proximity),
    availability: round1(availability),
    performance: round1(performance),
    roster: round1(roster),
    distanceKm: dist,
  };

  const reasons: string[] = [...gate.reasons];
  if (gate.passed) {
    if (dist != null) reasons.push(dist < 25 ? `Local crew (${dist} km away)` : `${dist} km from venue`);
    if (availability === 0) reasons.push('Schedule conflict with a confirmed booking');
    else if (availability < 100) reasons.push('Tight turnaround from another booking');
    if (performance >= 85) reasons.push('Top-rated, highly reliable');
    else if (performance < 50) reasons.push('Reliability concerns in history');
    if (roster === 100) reasons.push('Core roster member');
    else if (roster > 0) reasons.push('On preferred roster');
  }

  const score = gate.passed
    ? round1(
        proximity * MATCH_WEIGHTS.proximity +
          availability * MATCH_WEIGHTS.availability +
          performance * MATCH_WEIGHTS.performance +
          roster * MATCH_WEIGHTS.roster,
      )
    : 0;

  return { workerId: worker.id, shiftId: shift.id, score, breakdown, reasons };
}

export function rankWorkersForShift(workers: MatchWorkerInput[], shift: MatchShiftInput, now = new Date()): MatchResult[] {
  return workers
    .map((w) => calculateMatch(w, shift, now))
    .sort((a, b) => b.score - a.score || (a.breakdown.distanceKm ?? Infinity) - (b.breakdown.distanceKm ?? Infinity));
}
