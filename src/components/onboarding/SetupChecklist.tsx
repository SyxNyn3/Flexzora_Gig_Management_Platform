import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/lib/supabase';
import { getConnectStatus, payoutSetupStep } from '@/lib/connect';
import { useAuth } from '@/contexts/AuthContext';
import { useCompanyMemberships } from '@/hooks/useMarketplace';

/**
 * First-run setup checklist. Shown on the dashboard until every step is
 * done — a tour gets skipped, a checklist gets completed. Each step checks
 * a real signal (a row that exists), never a flag the user set themselves.
 */

interface Step { label: string; to: string; done: boolean; hint?: string }

export default function SetupChecklist() {
  const { profile, user } = useAuth();
  const { memberships } = useCompanyMemberships();
  const [steps, setSteps] = useState<Step[] | null>(null);

  useEffect(() => {
    if (!user || !profile) return;
    let cancelled = false;
    setSteps(null);
    (async () => {
      // Company-side checklist shows for company-role profiles AND for any
      // profile holding a company membership (dual-role workers).
      const companyId = memberships[0]?.company_id ?? null;
      const isCompanySide = profile.role === 'company' || companyId !== null;
      if (isCompanySide) {
        // Membership is the source of truth; fall back to the legacy
        // created_by lookup only for company-role profiles with no member row
        // (pre-membership data that somehow escaped the backfill).
        let resolvedCompanyId = companyId;
        if (!resolvedCompanyId && profile.role === 'company') {
          const { data: legacy } = await supabase
            .from('companies').select('id')
            .eq('created_by', profile.id).maybeSingle();
          resolvedCompanyId = legacy?.id ?? null;
        }
        let events = 0, shifts = 0, escrowed = 0;
        if (resolvedCompanyId) {
          const { data: evs } = await supabase
            .from('events').select('id').eq('company_id', resolvedCompanyId);
          events = evs?.length ?? 0;
          const ids = (evs ?? []).map((x) => x.id);
          if (ids.length) {
            const { count: s } = await supabase
              .from('shifts').select('id', { count: 'exact', head: true })
              .in('event_id', ids).eq('status', 'open');
            shifts = s ?? 0;
          }
          // escrow_deposits is company-readable via owns_company (membership-
          // aware); any funded/partially_released deposit means money is
          // actually staged for payroll, not just a Stripe account existing.
          const { count: e } = await supabase
            .from('escrow_deposits').select('id', { count: 'exact', head: true })
            .eq('company_id', resolvedCompanyId)
            .in('status', ['funded', 'partially_released']);
          escrowed = e ?? 0;
        }
        if (cancelled) return;
        setSteps([
          { label: 'Create your company profile', to: '/profile', done: resolvedCompanyId !== null },
          { label: 'Post your first event', to: '/events', done: events > 0 },
          { label: 'Open your first call for crew', to: '/broadcast', done: shifts > 0 },
          {
            label: 'Fund your first event escrow',
            to: '/events',
            done: escrowed > 0,
            hint: 'Payroll releases from escrow — an unfunded call pays nobody.',
          },
        ]);
      } else {
        const { count: apps } = await supabase
          .from('gig_applications').select('id', { count: 'exact', head: true })
          .eq('worker_id', profile.id);
        const { count: skills } = await supabase
          .from('worker_skills').select('id', { count: 'exact', head: true })
          .eq('worker_id', profile.id);
        const connect = await getConnectStatus();
        const { data: oneConn } = await supabase
          .from('one_connections').select('profile_id')
          .eq('profile_id', profile.id).maybeSingle();
        if (cancelled) return;
        const payout = payoutSetupStep(connect.data, connect.error != null);
        setSteps([
          { label: 'Fill out your crew card (skills, markets)', to: '/profile', done: (skills ?? 0) > 0 },
          { label: 'Add a phone number for call texts', to: '/profile', done: !!profile.phone },
          { label: 'Apply to your first gig', to: '/gigs', done: (apps ?? 0) > 0 },
          { label: 'Set up payouts to get paid', to: '/payouts', done: payout.done, hint: payout.hint },
          {
            label: 'Connect your apps (Calendar, Sheets, QuickBooks…)',
            to: '/integrations',
            done: !!oneConn,
            hint: 'Sync shifts, documents, and invoices — optional but recommended.',
          },
        ]);
      }
    })();
    return () => { cancelled = true; };
    // memberships is a stable reference (NO_MEMBERSHIPS until loaded) so this
    // re-runs exactly when the RPC resolves, not on every render.
  }, [user, profile, memberships]);

  if (!steps || steps.every((s) => s.done)) return null;
  const doneCount = steps.filter((s) => s.done).length;

  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">
          Get set up — {doneCount}/{steps.length} done
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {steps.map((s) => (
          <Link
            key={s.label}
            to={s.to}
            className={`flex items-center gap-2 text-sm ${s.done ? 'text-muted-foreground line-through' : 'text-foreground hover:text-primary'}`}
          >
            <span className={`inline-block h-4 w-4 rounded-full border text-center text-xs leading-4 ${s.done ? 'border-emerald-500 text-emerald-500' : 'border-muted-foreground'}`}>
              {s.done ? '✓' : ''}
            </span>
            <span>
              {s.label}
              {s.hint && <span className="block text-xs text-muted-foreground">{s.hint}</span>}
            </span>
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}
