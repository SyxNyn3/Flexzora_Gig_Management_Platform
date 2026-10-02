import { describe, expect, it } from 'vitest';
import { calculateMatch, rankWorkersForShift, MatchShiftInput, MatchWorkerInput, windowsOverlap } from '../matchScore';

const venue = { lat: 34.0430, lng: -118.2673 }; // Crypto.com Arena

const shift: MatchShiftInput = {
  id: 'shift-1',
  starts_at: '2026-10-12T08:00:00Z',
  ends_at: '2026-10-12T16:00:00Z',
  required_cert_codes: ['ETCP_ARENA'],
  skill_id: 'rigging',
  min_proficiency: 3,
  venueLocation: venue,
};

const baseWorker = (overrides: Partial<MatchWorkerInput> = {}): MatchWorkerInput => ({
  id: 'w1',
  location: { lat: 34.05, lng: -118.25 }, // ~1.8 km away
  travelRadiusKm: 80,
  certifications: [{ cert_type_code: 'ETCP_ARENA', is_active: true, expiration_date: '2030-01-01', verified: true }],
  skills: [{ skill_id: 'rigging', proficiency_level: 4 }],
  bookedWindows: [],
  avgRating: 4.8,
  reliabilityRate: 1,
  completedShifts: 30,
  rosterTier: 'core',
  ...overrides,
});

describe('gatekeeper', () => {
  it('scores 0 when a required certification is missing', () => {
    const r = calculateMatch(baseWorker({ certifications: [] }), shift);
    expect(r.score).toBe(0);
    expect(r.breakdown.gatekeeperPassed).toBe(false);
    expect(r.reasons[0]).toMatch(/ETCP_ARENA/);
  });

  it('rejects certifications that expire before the call date', () => {
    const r = calculateMatch(
      baseWorker({ certifications: [{ cert_type_code: 'ETCP_ARENA', is_active: true, expiration_date: '2026-09-30', verified: true }] }),
      shift,
    );
    expect(r.score).toBe(0);
    expect(r.reasons.join()).toMatch(/expires before this call/);
  });

  it('accepts a certification that expires on the call date', () => {
    const r = calculateMatch(
      baseWorker({ certifications: [{ cert_type_code: 'ETCP_ARENA', is_active: true, expiration_date: '2026-10-12', verified: true }] }),
      shift,
    );
    expect(r.breakdown.gatekeeperPassed).toBe(true);
  });

  it('accepts a certification with no expiration', () => {
    const r = calculateMatch(
      baseWorker({ certifications: [{ cert_type_code: 'ETCP_ARENA', is_active: true, expiration_date: undefined, verified: true }] }),
      shift,
    );
    expect(r.breakdown.gatekeeperPassed).toBe(true);
  });

  it('rejects skill tier below minimum', () => {
    const r = calculateMatch(baseWorker({ skills: [{ skill_id: 'rigging', proficiency_level: 2 }] }), shift);
    expect(r.score).toBe(0);
    expect(r.reasons.join()).toMatch(/tier 2 below required 3/);
  });

  it('rejects blocked roster members', () => {
    expect(calculateMatch(baseWorker({ rosterTier: 'blocked' }), shift).score).toBe(0);
  });
});

describe('weighted score', () => {
  it('gives a near-perfect score to a local, free, top-rated core roster member', () => {
    const r = calculateMatch(baseWorker(), shift);
    expect(r.breakdown.gatekeeperPassed).toBe(true);
    expect(r.breakdown.availability).toBe(100);
    expect(r.breakdown.roster).toBe(100);
    expect(r.score).toBeGreaterThan(95);
  });

  it('zeroes availability on an overlapping confirmed booking', () => {
    const r = calculateMatch(
      baseWorker({ bookedWindows: [{ starts_at: '2026-10-12T12:00:00Z', ends_at: '2026-10-12T20:00:00Z' }] }),
      shift,
    );
    expect(r.breakdown.availability).toBe(0);
    // 30% of the score is gone
    expect(r.score).toBeLessThan(75);
  });

  it('zeroes availability on a declared unavailable window', () => {
    const r = calculateMatch(
      baseWorker({ unavailableWindows: [{ starts_at: '2026-10-12T08:00:00Z', ends_at: '2026-10-12T16:00:00Z' }] }),
      shift,
    );
    expect(r.breakdown.availability).toBe(0);
  });

  it('penalises tight turnarounds without zeroing', () => {
    const r = calculateMatch(
      baseWorker({ bookedWindows: [{ starts_at: '2026-10-12T16:30:00Z', ends_at: '2026-10-12T22:00:00Z' }] }),
      shift,
    );
    expect(r.breakdown.availability).toBe(60);
  });

  it('applies the 20% roster boost', () => {
    const core = calculateMatch(baseWorker(), shift).score;
    const preferred = calculateMatch(baseWorker({ rosterTier: 'preferred' }), shift).score;
    const none = calculateMatch(baseWorker({ rosterTier: null }), shift).score;
    expect(core - none).toBeCloseTo(20, 0);
    expect(preferred - none).toBeCloseTo(16, 0);
  });

  it('decays proximity with distance and gives neutral 50 without coordinates', () => {
    const far = calculateMatch(baseWorker({ location: { lat: 36.17, lng: -115.14 } }), shift); // Las Vegas ~370 km
    expect(far.breakdown.proximity).toBe(0);
    const unknown = calculateMatch(baseWorker({ location: null }), shift);
    expect(unknown.breakdown.proximity).toBe(50);
    expect(unknown.breakdown.distanceKm).toBeNull();
  });

  it('gives new workers a neutral performance score', () => {
    const r = calculateMatch(baseWorker({ avgRating: null, reliabilityRate: null, completedShifts: 0 }), shift);
    expect(r.breakdown.performance).toBe(60);
  });

  it('ranks workers by score descending', () => {
    const ranked = rankWorkersForShift(
      [baseWorker({ id: 'far', location: { lat: 33.7, lng: -117.8 }, rosterTier: null }), baseWorker({ id: 'near' }), baseWorker({ id: 'nocert', certifications: [] })],
      shift,
    );
    expect(ranked.map((r) => r.workerId)).toEqual(['near', 'far', 'nocert']);
  });
});

describe('windowsOverlap', () => {
  it('treats touching windows as non-overlapping without buffer', () => {
    expect(windowsOverlap({ starts_at: '2026-01-01T08:00:00Z', ends_at: '2026-01-01T12:00:00Z' }, { starts_at: '2026-01-01T12:00:00Z', ends_at: '2026-01-01T16:00:00Z' })).toBe(false);
  });
  it('detects overlap once a buffer is applied', () => {
    expect(windowsOverlap({ starts_at: '2026-01-01T08:00:00Z', ends_at: '2026-01-01T12:00:00Z' }, { starts_at: '2026-01-01T12:30:00Z', ends_at: '2026-01-01T16:00:00Z' }, 60)).toBe(true);
  });
});
