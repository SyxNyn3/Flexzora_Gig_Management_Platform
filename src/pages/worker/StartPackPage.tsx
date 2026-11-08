import React, { useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useSupabaseQuery } from '@/hooks/useSupabaseQuery';
import {
  ONBOARDING_ITEM_LABELS, ONBOARDING_ITEM_ORDER,
  fetchOnboarding, fetchOnboardingCompanies, updateOnboardingItem,
  GigOnboarding, OnboardingItemState,
} from '@/lib/ledger';
import { CheckCircle2, Clock, FileWarning, Loader2 } from 'lucide-react';

const stateTone: Record<OnboardingItemState, string> = {
  missing: 'bg-muted text-muted-foreground border-border',
  submitted: 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30',
  confirmed: 'bg-green-500/15 text-emerald-500 dark:text-green-400 border-green-500/30',
  waived: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30',
};

const stateLabel: Record<OnboardingItemState, string> = {
  missing: 'Missing',
  submitted: 'Submitted',
  confirmed: 'Confirmed',
  waived: 'Waived',
};

const Checklist: React.FC<{ companyId: string; companyName: string; onChanged: () => void }> = ({ companyId, companyName, onChanged }) => {
  const q = useSupabaseQuery(() => fetchOnboarding(companyId), [companyId]);
  const row: GigOnboarding | null = q.data;
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const setState = async (item: string, state: OnboardingItemState) => {
    setBusyKey(item);
    const { error } = await updateOnboardingItem(companyId, item, state);
    setBusyKey(null);
    if (error) return toast.error(error);
    onChanged();
  };

  if (q.loading) return <Skeleton className="h-40 w-full" />;
  if (!row) return <p className="text-sm text-muted-foreground py-4">Checklist unavailable.</p>;

  const items = ONBOARDING_ITEM_ORDER.map((k) => ({ key: k, state: row.items?.[k] ?? 'missing' }));
  const done = items.filter((i) => i.state === 'confirmed' || i.state === 'waived').length;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">{companyName}</p>
        <Badge variant="outline" className={row.status === 'complete' ? 'bg-green-500/15 text-emerald-500 border-green-500/30' : 'bg-amber-500/15 text-amber-600 border-amber-500/30'}>
          {done}/{items.length} confirmed{row.status === 'complete' ? ' · complete' : ''}
        </Badge>
      </div>
      {items.map(({ key, state }) => (
        <div key={key} className="flex items-center gap-3 py-1.5">
          <div className="flex-1 min-w-0">
            <p className="text-sm">{ONBOARDING_ITEM_LABELS[key] ?? key}</p>
            <p className="text-xs text-muted-foreground">
              {state === 'submitted' && 'You marked this submitted — waiting on the company to confirm'}
              {state === 'confirmed' && 'Verified by the company'}
              {state === 'waived' && 'Waived by the company'}
              {state === 'missing' && 'Not on file yet — submit it, then mark it here'}
            </p>
          </div>
          <Badge variant="outline" className={stateTone[state]}>{stateLabel[state]}</Badge>
          <div className="flex gap-1">
            {state === 'missing' && (
              <Button size="sm" variant="outline" className="h-7 text-xs" disabled={busyKey === key} onClick={() => setState(key, 'submitted')}>
                {busyKey === key ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Mark submitted'}
              </Button>
            )}
            {state === 'submitted' && (
              <Button size="sm" variant="ghost" className="h-7 text-xs" disabled={busyKey === key} onClick={() => setState(key, 'missing')}>
                Undo
              </Button>
            )}
            {state === 'missing' && row.items?.[key] !== undefined && null}
          </div>
        </div>
      ))}
      <p className="text-xs text-muted-foreground pt-1">
        Upload the actual documents from <span className="font-medium">Payouts → Compliance</span> — this checklist tracks what each production still needs from you. Productions can't get paid without their start pack; don't let yours be the reason you're not.
      </p>
    </div>
  );
};

const StartPackPage: React.FC = () => {
  const [nonce, setNonce] = useState(0);
  const [openCompany, setOpenCompany] = useState<string | null>(null);
  const companies = useSupabaseQuery(() => fetchOnboardingCompanies(), [nonce]);

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Start packs</h1>
        <p className="text-sm text-muted-foreground">
          Every production runs a different paperwork gauntlet — deal memo, W-4, state forms, I-9, union card, COI. Missing one can delay your first check. Track what's owed per company here.
        </p>
      </div>

      <Card className="border-amber-500/30 bg-amber-500/5">
        <CardContent className="p-4 flex gap-3">
          <FileWarning className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">1099 crew have no wage-hour protections</span> — no overtime, no meal penalties, no waiting-time penalties. Your contract and your records are the only leverage. Keep this checklist current and save your own copies of everything.
          </p>
        </CardContent>
      </Card>

      {companies.loading && <Skeleton className="h-32 w-full" />}
      {!companies.loading && (companies.data ?? []).length === 0 && (
        <Card><CardContent className="p-8 text-center text-muted-foreground text-sm">
          <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-emerald-500/60" />
          No companies need a start pack yet — or you've already set one up for everyone you've worked with.
        </CardContent></Card>
      )}

      {(companies.data ?? []).map((c) => (
        <Card key={c.company_id}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">{c.company_name}</p>
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Clock className="w-3 h-3" /> Worked with since {new Date(c.first_seen).toLocaleDateString()}
                </p>
              </div>
              <div className="flex items-center gap-3">
                {c.checklist_status && (
                  <Badge variant="outline" className={c.checklist_status === 'complete' ? 'bg-green-500/15 text-emerald-500 border-green-500/30' : 'bg-amber-500/15 text-amber-600 border-amber-500/30'}>
                    {c.checklist_done}/{c.checklist_total} confirmed
                  </Badge>
                )}
                <Button size="sm" variant="outline" onClick={() => setOpenCompany(openCompany === c.company_id ? null : c.company_id)}>
                  {openCompany === c.company_id ? 'Hide checklist' : c.checklist_status ? 'Update checklist' : 'Set up checklist'}
                </Button>
              </div>
            </div>
            {openCompany === c.company_id && (
              <div className="mt-4 pt-4 border-t border-border/60">
                <Checklist companyId={c.company_id} companyName={c.company_name} onChanged={() => setNonce((n) => n + 1)} />
              </div>
            )}
          </CardContent>
        </Card>
      ))}

      <Card>
        <CardContent className="p-4">
          <p className="text-sm font-medium mb-1">What belongs in a start pack</p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Deal memo or signed contract · W-4 (federal) · state withholding form for each state you work in · I-9 · direct-deposit authorization · union card or clearance (union calls) · certificate of insurance if you invoice through a loan-out · emergency contact · NDA · safety certs or set-specific training. Upload files under Payouts → Compliance; this page tracks status.
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default StartPackPage;
