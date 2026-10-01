import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export interface WaitlistStats {
  total: number;
  companies: number;
  workers: number;
  betaTesters: number;
}

const EMPTY_STATS: WaitlistStats = {
  total: 0,
  companies: 0,
  workers: 0,
  betaTesters: 0,
};

export const useWaitlistStats = (): WaitlistStats => {
  const [stats, setStats] = useState<WaitlistStats>(EMPTY_STATS);

  useEffect(() => {
    let mounted = true;
    supabase.rpc('waitlist_public_stats').then(({ data, error }) => {
      if (!mounted || error || !data) return;
      setStats({
        total: Number(data.total) || 0,
        companies: Number(data.companies) || 0,
        workers: Number(data.workers) || 0,
        betaTesters: Number(data.beta_testers) || 0,
      });
    });
    return () => {
      mounted = false;
    };
  }, []);

  return stats;
};
