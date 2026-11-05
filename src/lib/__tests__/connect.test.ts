import { describe, expect, it, vi } from 'vitest';
import type { ConnectStatus } from '@/lib/connect';

vi.mock('@/lib/supabase', () => ({
  supabase: { functions: { invoke: vi.fn() } },
}));

import { payoutSetupStep } from '@/lib/connect';

const status = (over: Partial<ConnectStatus>): ConnectStatus => ({
  available: true,
  connected: false,
  payoutsEnabled: false,
  detailsSubmitted: false,
  ...over,
});

describe('payoutSetupStep', () => {
  it('marks the step done only when Stripe reports payoutsEnabled', () => {
    const s = payoutSetupStep(status({ payoutsEnabled: true, connected: true, detailsSubmitted: true }), false);
    expect(s.done).toBe(true);
    expect(s.hint).not.toMatch(/tax|agreement|payment ready/i);
  });

  it('stays incomplete when connected but payouts not enabled', () => {
    const s = payoutSetupStep(status({ connected: true }), false);
    expect(s.done).toBe(false);
  });

  it('stays incomplete when details submitted but still under verification', () => {
    const s = payoutSetupStep(status({ connected: true, detailsSubmitted: true }), false);
    expect(s.done).toBe(false);
    expect(s.hint).toMatch(/verifying/i);
  });

  it('prompts account connection when nothing is set up', () => {
    const s = payoutSetupStep(status({}), false);
    expect(s.done).toBe(false);
    expect(s.hint).toMatch(/connect/i);
  });

  it('never marks done on error — even if a fallback status arrived', () => {
    expect(payoutSetupStep(status({ payoutsEnabled: true }), true).done).toBe(false);
    expect(payoutSetupStep(null, true).done).toBe(false);
  });

  it('never marks done on unknown (loading) or unavailable status', () => {
    expect(payoutSetupStep(null, false).done).toBe(false);
    expect(payoutSetupStep({ available: false }, false).done).toBe(false);
  });
});
