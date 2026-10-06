import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ProductionEvent } from '@/lib/types';
import { EventBudgetSummary, MarketplaceService } from '@/lib/marketplace/service';
import { IS_PAYMENTS_SANDBOX, SANDBOX_BANNER } from '@/lib/payments';
import { supabase } from '@/lib/supabase';
import { money } from '../format';
import { Landmark, Users, Wallet, TrendingUp } from 'lucide-react';

interface Props {
  event: ProductionEvent;
  refreshKey: number;
}

const ESCROW_POLL_MS = 3000;
const ESCROW_POLL_MAX_TICKS = 20;

const Stat: React.FC<{ icon: React.ReactNode; label: string; value: string; sub?: string; warn?: boolean }> = ({ icon, label, value, sub, warn }) => (
  <Card>
    <CardContent className="p-4 flex items-start gap-3">
      <div className={`p-2 rounded-md ${warn ? 'bg-destructive/15 text-destructive' : 'bg-secondary/15 text-secondary'}`}>{icon}</div>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={`text-lg font-semibold ${warn ? 'text-red-600 dark:text-red-400' : ''}`}>{value}</p>
        {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
      </div>
    </CardContent>
  </Card>
);

const BudgetSummary: React.FC<Props> = ({ event, refreshKey }) => {
  const [summary, setSummary] = useState<EventBudgetSummary | null>(null);
  const [amount, setAmount] = useState('');
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = () => MarketplaceService.getEventBudget(event).then(({ data }) => setSummary(data));

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event.id, refreshKey]);

  // Back from Stripe Checkout: the webhook funds the deposit asynchronously, so poll the
  // budget until the funded balance moves (or give up after a minute).
  useEffect(() => {
    const outcome = new URLSearchParams(window.location.search).get('escrow');
    if (outcome === 'cancelled') toast.info('Escrow deposit cancelled; no funds were taken');
    if (outcome !== 'funded') return;
    toast.success('Payment received — waiting for Stripe to confirm the deposit');
    let baseline: number | null = null;
    let ticks = 0;
    const timer = window.setInterval(async () => {
      const { data } = await MarketplaceService.getEventBudget(event);
      if (!data) return;
      if (baseline === null) {
        baseline = data.escrowFunded;
        return;
      }
      ticks += 1;
      if (data.escrowFunded > baseline || ticks >= ESCROW_POLL_MAX_TICKS) {
        window.clearInterval(timer);
        setSummary(data);
        if (data.escrowFunded > baseline) toast.success('Escrow deposit confirmed');
      }
    }, ESCROW_POLL_MS);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event.id]);

  const fund = async () => {
    const n = Number(amount);
    if (!n || n <= 0) return;
    setSaving(true);
    if (IS_PAYMENTS_SANDBOX) {
      const { error } = await supabase
        .from('escrow_deposits')
        .insert({ event_id: event.id, company_id: event.company_id, amount: n, released_amount: 0, currency: 'USD', status: 'pending' });
      setSaving(false);
      if (error) return toast.error(error.message);
      toast.success('Sandbox mode — deposit recorded as simulated. Connect Stripe to fund real escrow.');
      setOpen(false);
      setAmount('');
      return load();
    }
    const { data, error } = await MarketplaceService.fundEscrow(event, n);
    if (error || !data) {
      setSaving(false);
      return toast.error(error ?? 'Could not start the deposit');
    }
    window.location.assign(data.checkoutUrl);
  };

  if (!summary) return null;

  const overBudget = summary.budgetCap != null && summary.projectedLabor > summary.budgetCap;
  const underFunded = summary.escrowFunded - summary.escrowReleased < summary.projectedLabor - summary.approvedLabor;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <Stat
        icon={<Users className="w-4 h-4" />}
        label="Crew filled"
        value={`${summary.headcountConfirmed}/${summary.headcountRequired}`}
        sub={`${summary.shiftsFilled}/${summary.shiftsTotal} calls fully staffed`}
      />
      <Stat
        icon={<TrendingUp className="w-4 h-4" />}
        label="Projected labor"
        value={money(summary.projectedLabor)}
        sub={summary.budgetCap != null ? `Cap ${money(summary.budgetCap)}` : 'No cap set'}
        warn={overBudget}
      />
      <Stat icon={<Wallet className="w-4 h-4" />} label="Approved / paid" value={money(summary.approvedLabor)} sub="From approved timesheets" />
      <Card>
        <CardContent className="p-4 flex items-start gap-3">
          <div className={`p-2 rounded-md ${underFunded ? 'bg-amber-100 text-amber-700' : 'bg-green-500/10 text-green-600 dark:text-green-400'}`}>
            <Landmark className="w-4 h-4" />
          </div>
          <div className="flex-1">
            <p className="text-xs text-muted-foreground">Escrow</p>
            <p className="text-lg font-semibold">{money(summary.escrowFunded - summary.escrowReleased)}</p>
            <p className="text-xs text-muted-foreground">{money(summary.escrowReleased)} released</p>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button size="sm" variant="outline" className="mt-2 w-full">Fund escrow</Button>
              </DialogTrigger>
              <DialogContent className="max-w-sm">
                <DialogHeader>
                  <DialogTitle>Deposit to escrow</DialogTitle>
                </DialogHeader>
                <p className="text-sm text-muted-foreground">
                  Funds are held for <strong>{event.name}</strong> and released to crew as you approve timesheets. Shortfall vs. projected labor:{' '}
                  <strong>{money(Math.max(0, summary.projectedLabor - summary.approvedLabor - (summary.escrowFunded - summary.escrowReleased)))}</strong>
                </p>
                {IS_PAYMENTS_SANDBOX && (
                  <p className="text-xs rounded-md border border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400 px-3 py-2">
                    {SANDBOX_BANNER}
                  </p>
                )}
                <Input type="number" min={1} step="100" placeholder="Amount (USD)" value={amount} onChange={(e) => setAmount(e.target.value)} />
                <Button onClick={fund} disabled={saving || !amount}>
                  {saving ? (IS_PAYMENTS_SANDBOX ? 'Recording deposit…' : 'Redirecting to Stripe…') : IS_PAYMENTS_SANDBOX ? 'Simulate escrow deposit' : 'Continue to payment'}
                </Button>
                {!IS_PAYMENTS_SANDBOX && (
                  <p className="text-xs text-muted-foreground">You will be taken to Stripe Checkout; the balance updates once the payment settles.</p>
                )}
              </DialogContent>
            </Dialog>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default BudgetSummary;
