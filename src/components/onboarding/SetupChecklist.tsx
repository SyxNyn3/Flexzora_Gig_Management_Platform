import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

/**
 * First-run setup checklist. Shown on the dashboard until every step is
 * done — a tour gets skipped, a checklist gets completed. Each step checks
 * a real signal (a row that exists), never a flag the user set themselves.
 */

interface Step { label: string; to: string; done: boolean }

export default function SetupChecklist() {
  const { profile, user } = useAuth();
  const [steps, setSteps] = useState<Step[] | null>(null);

  useEffect(() => {
    if (!user || !profile) return;
    (async () => {
      if (profile.role === 'company') {
        const { data: company } = await supabase
          .from('companies').select('id, stripe_account_id')
          .eq('created_by', user.id).maybeSingle();
        const { count: events } = await supabase
          .from('events').select('id', { count: 'exact', head: true })
          .eq('company_id', company?.id ?? 'none');
        const { count: shifts } = await supabase
          .from('shifts').select('id', { count: 'exact', head: true })
          .eq('status', 'published');
        setSteps([
          { label: 'Create your company profile', to: '/profile', done: !!company },
          { label: 'Connect Stripe for payouts', to: '/settings/integrations', done: !!company?.stripe_account_id },
          { label: 'Post your first event', to: '/events', done: (events ?? 0) > 0 },
          { label: 'Publish your first call', to: '/broadcast', done: (shifts ?? 0) > 0 },
        ]);
      } else {
        const { data: apps } = await supabase
          .from('gig_applications').select('id', { count: 'exact', head: true })
          .eq('worker_id', user.id);
        const { count: skills } = await supabase
          .from('profile_skills').select('id', { count: 'exact', head: true })
          .eq('profile_id', profile.id);
        setSteps([
          { label: 'Fill out your crew card (skills, markets)', to: '/profile', done: (skills ?? 0) > 0 },
          { label: 'Add a phone number for call texts', to: '/profile', done: !!profile.phone },
          { label: 'Apply to your first gig', to: '/gigs', done: (apps?.length ?? 0) > 0 },
        ]);
      }
    })();
  }, [user, profile]);

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
            {s.label}
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}
