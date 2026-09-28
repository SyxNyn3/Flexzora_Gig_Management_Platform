import React, { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/contexts/AuthContext';
import { useInvoices, usePayouts } from '@/hooks/useMarketplace';
import { Invoice, Payout } from '@/lib/types';
import { money } from '@/components/marketplace/format';
import { Download, FileText, Landmark, Zap, Clock } from 'lucide-react';

const payoutTone: Record<Payout['status'], string> = {
  queued: 'bg-amber-100 text-amber-800',
  processing: 'bg-blue-100 text-blue-800',
  paid: 'bg-green-100 text-green-800',
  failed: 'bg-red-100 text-red-800',
};

const csvEscape = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;

const downloadCsv = (invoices: Invoice[], year: number) => {
  const header = ['Invoice #', 'Issued', 'Paid', 'Company', 'Event', 'Subtotal', 'Platform fee', 'Net', 'Status'];
  const rows = invoices.map((i) => [
    i.invoice_number,
    format(new Date(i.issued_at), 'yyyy-MM-dd'),
    i.paid_at ? format(new Date(i.paid_at), 'yyyy-MM-dd') : '',
    i.company?.name ?? '',
    i.event?.name ?? '',
    Number(i.subtotal).toFixed(2),
    Number(i.platform_fee).toFixed(2),
    Number(i.total).toFixed(2),
    i.status,
  ]);
  const csv = [header, ...rows].map((r) => r.map(csvEscape).join(',')).join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `flexzora-earnings-${year}.csv`;
  a.click();
  URL.revokeObjectURL(url);
};

const PayoutsPage: React.FC = () => {
  const { profile } = useAuth();
  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(thisYear);
  const invoices = useInvoices({ workerId: profile?.id, taxYear: year });
  const payouts = usePayouts(profile?.id);

  const upcoming = payouts.data.filter((p) => p.status === 'queued' || p.status === 'processing');
  const upcomingTotal = upcoming.reduce((n, p) => n + Number(p.amount), 0);
  const paidThisYear = invoices.data.filter((i) => i.status === 'paid').reduce((n, i) => n + Number(i.total), 0);
  const grossThisYear = invoices.data.reduce((n, i) => n + Number(i.subtotal), 0);
  const feesThisYear = invoices.data.reduce((n, i) => n + Number(i.platform_fee), 0);

  const byCompany = useMemo(() => {
    const m = new Map<string, number>();
    invoices.data.forEach((i) => m.set(i.company?.name ?? 'Unknown', (m.get(i.company?.name ?? 'Unknown') ?? 0) + Number(i.total)));
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
  }, [invoices.data]);

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Earnings & payouts</h1>
          <p className="text-sm text-gray-600">Invoices are generated automatically when a production manager approves your timesheet.</p>
        </div>
        <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
          <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
          <SelectContent>
            {[thisYear, thisYear - 1, thisYear - 2].map((y) => <SelectItem key={y} value={String(y)}>Tax year {y}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card><CardContent className="p-4"><p className="text-xs text-gray-500 inline-flex items-center gap-1"><Clock className="w-3 h-3" /> Upcoming payouts</p><p className="text-xl font-semibold">{money(upcomingTotal)}</p><p className="text-xs text-gray-500">{upcoming.length} in flight</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-gray-500">Paid in {year}</p><p className="text-xl font-semibold">{money(paidThisYear)}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-gray-500">Gross billed (1099 basis)</p><p className="text-xl font-semibold">{money(grossThisYear)}</p><p className="text-xs text-gray-500">{money(feesThisYear)} platform fees</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-gray-500">Invoices</p><p className="text-xl font-semibold">{invoices.data.length}</p><Button size="sm" variant="outline" className="mt-1 h-7 text-xs" disabled={!invoices.data.length} onClick={() => downloadCsv(invoices.data, year)}><Download className="w-3 h-3 mr-1" /> Export CSV</Button></CardContent></Card>
      </div>

      <Tabs defaultValue="payouts">
        <TabsList>
          <TabsTrigger value="payouts">Payouts</TabsTrigger>
          <TabsTrigger value="invoices">Invoices</TabsTrigger>
          <TabsTrigger value="companies">By company</TabsTrigger>
        </TabsList>

        <TabsContent value="payouts" className="space-y-2 mt-4">
          {payouts.loading && <Skeleton className="h-24 w-full" />}
          {!payouts.loading && payouts.data.length === 0 && <p className="text-center text-gray-500 py-10 text-sm">No payouts yet. Complete a shift and get your timesheet approved.</p>}
          {payouts.data.map((p) => (
            <Card key={p.id}>
              <CardContent className="p-3 flex items-center gap-3">
                <div className={`p-2 rounded-md ${p.method === 'instant' ? 'bg-amber-50 text-amber-700' : 'bg-blue-50 text-blue-700'}`}>
                  {p.method === 'instant' ? <Zap className="w-4 h-4" /> : <Landmark className="w-4 h-4" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{p.invoice?.event?.name ?? 'Shift payout'} · {p.invoice?.company?.name}</p>
                  <p className="text-xs text-gray-500">
                    {p.method === 'instant' ? 'Instant transfer' : 'ACH'} · {p.paid_at ? `Paid ${format(new Date(p.paid_at), 'MMM d')}` : p.expected_arrival_at ? `Expected ${format(new Date(p.expected_arrival_at), 'MMM d')}` : 'Processing'}
                    {p.failure_reason && <span className="text-red-600"> · {p.failure_reason}</span>}
                  </p>
                </div>
                <p className="font-semibold">{money(p.amount)}</p>
                <Badge variant="outline" className={payoutTone[p.status]}>{p.status}</Badge>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="invoices" className="space-y-2 mt-4">
          {invoices.loading && <Skeleton className="h-24 w-full" />}
          {!invoices.loading && invoices.data.length === 0 && <p className="text-center text-gray-500 py-10 text-sm">No invoices for {year}.</p>}
          {invoices.data.map((inv) => (
            <Card key={inv.id}>
              <CardContent className="p-3">
                <div className="flex items-center gap-3">
                  <FileText className="w-4 h-4 text-gray-400" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium">{inv.invoice_number} <span className="text-gray-500 font-normal">· {inv.company?.name} · {inv.event?.name}</span></p>
                    <p className="text-xs text-gray-500">Issued {format(new Date(inv.issued_at), 'MMM d, yyyy')}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold">{money(inv.total)}</p>
                    <p className="text-xs text-gray-500">{money(inv.subtotal)} − {money(inv.platform_fee)} fee</p>
                  </div>
                  <Badge variant="outline" className={inv.status === 'paid' ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'}>{inv.status}</Badge>
                </div>
                <div className="mt-2 pl-7 text-xs text-gray-600 grid grid-cols-[1fr_auto_auto_auto] gap-x-4">
                  {inv.line_items.map((li, i) => (
                    <React.Fragment key={i}>
                      <span>{li.description}</span><span>{li.hours.toFixed(2)} h</span><span>@ {money(li.rate)}</span><span className="text-right">{money(li.amount)}</span>
                    </React.Fragment>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="companies" className="space-y-2 mt-4">
          {byCompany.length === 0 && <p className="text-center text-gray-500 py-10 text-sm">Nothing billed in {year}.</p>}
          {byCompany.map(([name, total]) => (
            <Card key={name}><CardContent className="p-3 flex items-center justify-between"><span className="font-medium">{name}</span><span className="font-semibold">{money(total)}</span></CardContent></Card>
          ))}
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default PayoutsPage;
