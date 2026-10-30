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
        // companies.created_by holds the profile id, not the auth uid.
        const { data: company } = await supabase
          .from('companies').select('id')
          .eq('created_by', profile.id).maybeSingle();
        let events = 0, shifts = 0;
        if (company) {
          const { data: evs } = await supabase
            .from('events').select('id').eq('company_id', company.id);
          events = evs?.length ?? 0;
          const ids = (evs ?? []).map((x) => x.id);
          if (ids.length) {
            const { count: s } = await supabase
              .from('shifts').select('id', { count: 'exact', head: true })
              .in('event_id', ids).eq('status', 'open');
            shifts = s ?? 0;
          }
        }
        setSteps([
          { label: 'Create your company profile', to: '/profile', done: !!company },
          { label: 'Post your first event', to: '/events', done: events > 0 },
          { label: 'Open your first call for crew', to: '/broadcast', done: shifts > 0 },
        ]);
      } else {
        const { count: apps } = await supabase
          .from('gig_applications').select('id', { count: 'exact', head: true })
          .eq('worker_id', profile.id);
        const { count: skills } = await supabase
          .from('worker_skills').select('id', { count: 'exact', head: true })
          .eq('worker_id', profile.id);
        setSteps([
          { label: 'Fill out your crew card (skills, markets)', to: '/profile', done: (skills ?? 0) > 0 },
          { label: 'Add a phone number for call texts', to: '/profile', done: !!profile.phone },
          { label: 'Apply to your first gig', to: '/gigs', done: (apps ?? 0) > 0 },
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
