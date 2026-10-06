import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ProductionEvent } from '@/lib/types';
import { EventBudgetSummary, MarketplaceService } from '@/lib/marketplace/service';
import { isStripeDemoMode } from '@/lib/stripe';
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
      <div className={`p-2 rounded-md ${warn ? 'bg-red-100 text-red-700' : 'bg-blue-50 text-blue-700'}`}>{icon}</div>
      <div>
        <p className="text-xs text-gray-500">{label}</p>
        <p className={`text-lg font-semibold ${warn ? 'text-red-700' : ''}`}>{value}</p>
        {sub && <p className="text-xs text-gray-500">{sub}</p>}
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

  // Back from Stripe Checkout: the webhook flips the deposit pending → funded
  // asynchronously, so poll the deposits until none are pending (or give up).
  useEffect(() => {
    const outcome = new URLSearchParams(window.location.search).get('escrow');
    if (outcome === 'cancelled') toast.info('Escrow deposit cancelled; no funds were taken');
    if (outcome === 'queued') {
      toast.info('Deposit queued via Flexzora Escrow (Sandbox) — no funds were moved');
      load();
      return;
    }
    if (outcome !== 'funded') return;
    toast.success('Payment received — waiting for Stripe to confirm the deposit');
    let ticks = 0;
    const timer = window.setInterval(async () => {
      ticks += 1;
      const { data: deposits } = await MarketplaceService.getEscrow(event.id);
      const confirmed = deposits != null && deposits.length > 0 && deposits.every((d) => d.status !== 'pending');
      if (confirmed || ticks >= ESCROW_POLL_MAX_TICKS) {
        window.clearInterval(timer);
        const { data } = await MarketplaceService.getEventBudget(event);
        if (data) setSummary(data);
        if (confirmed) toast.success('Escrow deposit confirmed');
      }
    }, ESCROW_POLL_MS);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event.id]);

  const fund = async () => {
    const n = Number(amount);
    if (!n || n <= 0) return;
    setSaving(true);
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
          <div className={`p-2 rounded-md ${underFunded ? 'bg-amber-100 text-amber-700' : 'bg-green-50 text-green-700'}`}>
            <Landmark className="w-4 h-4" />
          </div>
          <div className="flex-1">
            <p className="text-xs text-gray-500">Escrow</p>
            <p className="text-lg font-semibold">{money(summary.escrowFunded - summary.escrowReleased)}</p>
            <p className="text-xs text-gray-500">{money(summary.escrowReleased)} released</p>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button size="sm" variant="outline" className="mt-2 w-full">Fund escrow</Button>
              </DialogTrigger>
              <DialogContent className="max-w-sm">
                <DialogHeader>
                  <DialogTitle>Deposit to escrow</DialogTitle>
                </DialogHeader>
                <p className="text-sm text-gray-600">
                  Funds are held for <strong>{event.name}</strong> and released to crew as you approve timesheets. Shortfall vs. projected labor:{' '}
                  <strong>{money(Math.max(0, summary.projectedLabor - summary.approvedLabor - (summary.escrowFunded - summary.escrowReleased)))}</strong>
                </p>
                <Input type="number" min={1} step="100" placeholder="Amount (USD)" value={amount} onChange={(e) => setAmount(e.target.value)} />
                <Button onClick={fund} disabled={saving || !amount}>
                  {saving
                    ? isStripeDemoMode ? 'Queueing deposit…' : 'Redirecting to Stripe…'
                    : 'Continue to payment'}
                </Button>
                <p className="text-xs text-gray-500">
                  {isStripeDemoMode
                    ? 'Sandbox mode: the deposit is queued via Flexzora Escrow (no Stripe account connected).'
                    : 'You will be taken to Stripe Checkout; the balance updates once the payment settles.'}
                </p>
              </DialogContent>
            </Dialog>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default BudgetSummary;
