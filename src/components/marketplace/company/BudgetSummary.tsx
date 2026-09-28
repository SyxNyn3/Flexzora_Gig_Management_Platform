import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ProductionEvent } from '@/lib/types';
import { EventBudgetSummary, MarketplaceService } from '@/lib/marketplace/service';
import { money } from '../format';
import { Landmark, Users, Wallet, TrendingUp } from 'lucide-react';

interface Props {
  event: ProductionEvent;
  refreshKey: number;
}

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

  const fund = async () => {
    const n = Number(amount);
    if (!n || n <= 0) return;
    setSaving(true);
    const { error } = await MarketplaceService.fundEscrow(event.id, event.company_id, n);
    setSaving(false);
    if (error) return toast.error(error);
    toast.success(`${money(n)} deposited to escrow`);
    setOpen(false);
    setAmount('');
    load();
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
                <Button onClick={fund} disabled={saving || !amount}>{saving ? 'Depositing…' : 'Deposit'}</Button>
              </DialogContent>
            </Dialog>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default BudgetSummary;
