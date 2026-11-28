import React, { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { format } from 'date-fns';
import {
  Mail, RefreshCw, Check, X, ArrowLeftRight, Loader2, Zap, Trash2, Plus,
} from 'lucide-react';

/**
 * Gig-offer inbox — production-company offers ingested from the worker's
 * Gmail (google-connect gmail-sync) land here parsed and deduped. Workers
 * accept / decline / counter each one; accepting logs the call to their
 * calendar (which then pushes to Google Calendar automatically).
 * Auto-rules below let them pre-approve patterns like "always take rigging
 * calls from Rhino Staging" — evaluated server-side at ingest time.
 */

interface ParsedOffer {
  is_offer?: boolean;
  role?: string | null;
  company?: string | null;
  call_date?: string | null;
  end_date?: string | null;
  location?: string | null;
  rate?: number | null;
  notes?: string | null;
  counter_rate?: number;
}

interface GigOffer {
  id: string;
  source: string;
  sender: string | null;
  subject: string | null;
  body_excerpt: string | null;
  parsed: ParsedOffer;
  status: string;
  created_at: string;
}

interface OfferRule {
  id: string;
  name: string;
  enabled: boolean;
  match_sender: string | null;
  match_keywords: string[];
  action: 'accept' | 'decline' | 'counter';
  counter_rate: number | null;
  require_no_conflict: boolean;
}

const STATUS_STYLE: Record<string, string> = {
  new: 'bg-blue-500/10 text-blue-700 dark:text-blue-300',
  accepted: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  declined: 'bg-zinc-500/10 text-zinc-600 dark:text-zinc-400',
  countered: 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
  conflict: 'bg-red-500/10 text-red-700 dark:text-red-300',
  expired: 'bg-zinc-500/10 text-zinc-500',
  converted: 'bg-purple-500/10 text-purple-700 dark:text-purple-300',
};

const OffersPage: React.FC = () => {
  const { profile } = useAuth();
  const [offers, setOffers] = useState<GigOffer[]>([]);
  const [rules, setRules] = useState<OfferRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [acting, setActing] = useState<string | null>(null);
  const [showRuleDialog, setShowRuleDialog] = useState(false);

  // New-rule form
  const [ruleName, setRuleName] = useState('');
  const [ruleSender, setRuleSender] = useState('');
  const [ruleKeywords, setRuleKeywords] = useState('');
  const [ruleAction, setRuleAction] = useState<'accept' | 'decline' | 'counter'>('accept');
  const [ruleRate, setRuleRate] = useState('');
  const [ruleNoConflict, setRuleNoConflict] = useState(true);

  const load = useCallback(async () => {
    if (!profile?.id) return;
    const [o, r] = await Promise.all([
      supabase.from('gig_offers').select('*').eq('worker_id', profile.id)
        .order('created_at', { ascending: false }).limit(100),
      supabase.from('offer_rules').select('*').eq('worker_id', profile.id)
        .order('created_at', { ascending: false }),
    ]);
    setOffers((o.data ?? []) as GigOffer[]);
    setRules((r.data ?? []) as OfferRule[]);
    setLoading(false);
  }, [profile?.id]);

  useEffect(() => { load(); }, [load]);

  const syncGmail = async () => {
    setSyncing(true);
    const { data, error } = await supabase.functions.invoke('google-connect', {
      body: { action: 'gmail-sync' },
    });
    setSyncing(false);
    if (error) {
      // functions.invoke throws on non-2xx — the response body still holds
      // our {error} detail, so read it before falling back to a generic msg.
      let detail = '';
      try {
        const ctx = (error as { context?: Response }).context;
        if (ctx) detail = (await ctx.json())?.error ?? '';
      } catch { /* body already consumed or not json */ }
      toast.error(detail || 'Gmail sync failed');
      return;
    }
    toast.success(`Scanned ${data?.scanned ?? 0} emails — ${data?.inserted ?? 0} new offers, ${data?.auto?.acted ?? 0} auto-handled`);
    load();
  };

  const decide = async (offer: GigOffer, decision: 'accepted' | 'declined' | 'countered', counterRate?: number) => {
    setActing(offer.id);
    const { error } = await supabase.functions.invoke('google-connect', {
      body: { action: 'offer-action', offer_id: offer.id, decision, counter_rate: counterRate },
    });
    setActing(null);
    if (error) { toast.error('Could not update offer'); return; }
    toast.success(decision === 'accepted' ? 'Accepted — added to your calendar' : `Offer ${decision}`);
    load();
  };

  const addRule = async () => {
    if (!profile?.id || !ruleName.trim()) return;
    const { error } = await supabase.from('offer_rules').insert({
      worker_id: profile.id,
      name: ruleName.trim(),
      match_sender: ruleSender.trim() || null,
      match_keywords: ruleKeywords.split(',').map((k) => k.trim()).filter(Boolean),
      action: ruleAction,
      counter_rate: ruleAction === 'counter' && ruleRate ? parseFloat(ruleRate) : null,
      require_no_conflict: ruleNoConflict,
    });
    if (error) { toast.error('Could not save rule'); return; }
    toast.success('Rule saved — applies to new offers');
    setShowRuleDialog(false);
    setRuleName(''); setRuleSender(''); setRuleKeywords(''); setRuleRate('');
    load();
  };

  const toggleRule = async (rule: OfferRule) => {
    await supabase.from('offer_rules').update({ enabled: !rule.enabled }).eq('id', rule.id);
    load();
  };

  const deleteRule = async (rule: OfferRule) => {
    await supabase.from('offer_rules').delete().eq('id', rule.id);
    load();
  };

  const pending = offers.filter((o) => o.status === 'new' || o.status === 'conflict');

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
            <Mail className="h-7 w-7" /> Offers
          </h1>
          <p className="text-muted-foreground mt-2">
            Gig offers from production companies, pulled from your Gmail and parsed automatically.
          </p>
        </div>
        <Button onClick={syncGmail} disabled={syncing}>
          {syncing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
          Sync Gmail
        </Button>
      </div>

      {loading ? (
        <div className="space-y-3">{[1, 2, 3].map((i) => <div key={i} className="h-24 bg-muted animate-pulse rounded-lg" />)}</div>
      ) : pending.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12">
            <Mail className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="font-medium">No pending offers</p>
            <p className="text-sm text-muted-foreground mt-1">
              Connect Gmail in Integrations, then hit Sync — offers from production companies will show up here parsed and ready to answer.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {pending.map((o) => {
            const p = o.parsed ?? {};
            return (
              <Card key={o.id}>
                <CardContent className="pt-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge className={STATUS_STYLE[o.status] ?? ''}>{o.status}</Badge>
                        <Badge variant="outline" className="text-[10px]">{o.source}</Badge>
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(o.created_at), 'MMM d, h:mm a')}
                        </span>
                      </div>
                      <p className="font-semibold mt-2">{p.role ?? o.subject ?? '(offer)'}</p>
                      <p className="text-sm text-muted-foreground">
                        {[p.company, o.sender].filter(Boolean).join(' · ')}
                      </p>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-sm">
                        {p.call_date && <span>📅 {format(new Date(p.call_date), 'MMM d, yyyy h:mm a')}</span>}
                        {p.location && <span>📍 {p.location}</span>}
                        {p.rate != null && <span>💲 ${p.rate}/hr</span>}
                      </div>
                      {o.body_excerpt && (
                        <p className="text-xs text-muted-foreground mt-2 line-clamp-2">{o.body_excerpt}</p>
                      )}
                      {p.notes && <p className="text-xs text-muted-foreground mt-1 italic">{p.notes}</p>}
                    </div>
                    <div className="flex flex-col gap-2 shrink-0">
                      <Button size="sm" disabled={acting === o.id}
                        onClick={() => decide(o, 'accepted')}>
                        <Check className="h-4 w-4 mr-1" /> Accept
                      </Button>
                      <Button size="sm" variant="outline" disabled={acting === o.id}
                        onClick={() => {
                          const rate = window.prompt('Counter rate ($/hr):', p.rate?.toString() ?? '');
                          if (rate === null) return;
                          decide(o, 'countered', parseFloat(rate) || undefined);
                        }}>
                        <ArrowLeftRight className="h-4 w-4 mr-1" /> Counter
                      </Button>
                      <Button size="sm" variant="ghost" disabled={acting === o.id}
                        onClick={() => decide(o, 'declined')}>
                        <X className="h-4 w-4 mr-1" /> Decline
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Auto-rules */}
      <Card className="mt-8">
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2"><Zap className="h-5 w-5" /> Auto-rules</CardTitle>
            <CardDescription>
              Pre-approve offer patterns — e.g. "accept any rigging call from Rhino Staging." Rules run when new offers sync in.
            </CardDescription>
          </div>
          <Button size="sm" variant="outline" onClick={() => setShowRuleDialog(true)}>
            <Plus className="h-4 w-4 mr-1" /> New rule
          </Button>
        </CardHeader>
        <CardContent>
          {rules.length === 0 ? (
            <p className="text-sm text-muted-foreground">No rules yet — every offer waits for you.</p>
          ) : (
            <div className="space-y-2">
              {rules.map((r) => (
                <div key={r.id} className="flex items-center justify-between rounded-lg border border-border/60 p-3">
                  <div>
                    <p className="font-medium text-sm">{r.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {r.match_sender ? `from ~"${r.match_sender}"` : 'any sender'}
                      {r.match_keywords?.length ? ` · keywords: ${r.match_keywords.join(', ')}` : ''}
                      {' '}→ <Badge variant="secondary" className="text-[10px]">{r.action}{r.counter_rate ? ` @ $${r.counter_rate}` : ''}</Badge>
                      {r.require_no_conflict && ' · skips schedule conflicts'}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => toggleRule(r)}>
                      {r.enabled ? 'On' : 'Off'}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => deleteRule(r)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={showRuleDialog} onOpenChange={setShowRuleDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New auto-rule</DialogTitle>
            <DialogDescription>Matching offers are handled automatically the next time Gmail syncs.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Rule name</Label>
              <Input value={ruleName} onChange={(e) => setRuleName(e.target.value)} placeholder="Rhino rigging calls" />
            </div>
            <div>
              <Label>Sender contains (optional)</Label>
              <Input value={ruleSender} onChange={(e) => setRuleSender(e.target.value)} placeholder="rhino staging or bookings@rhino.com" />
            </div>
            <div>
              <Label>Keywords (comma-separated, optional)</Label>
              <Input value={ruleKeywords} onChange={(e) => setRuleKeywords(e.target.value)} placeholder="rigging, a2, load-in" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Action</Label>
                <Select value={ruleAction} onValueChange={(v) => setRuleAction(v as typeof ruleAction)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="accept">Accept</SelectItem>
                    <SelectItem value="decline">Decline</SelectItem>
                    <SelectItem value="counter">Counter</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {ruleAction === 'counter' && (
                <div>
                  <Label>Counter rate ($/hr)</Label>
                  <Input type="number" value={ruleRate} onChange={(e) => setRuleRate(e.target.value)} placeholder="55" />
                </div>
              )}
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={ruleNoConflict} onChange={(e) => setRuleNoConflict(e.target.checked)} />
              Skip auto-action if the call overlaps my calendar
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRuleDialog(false)}>Cancel</Button>
            <Button onClick={addRule} disabled={!ruleName.trim()}>Save rule</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default OffersPage;
