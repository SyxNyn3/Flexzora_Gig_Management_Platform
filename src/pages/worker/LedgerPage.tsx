import React, { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useSupabaseQuery } from '@/hooks/useSupabaseQuery';
import { money } from '@/components/marketplace/format';
import {
  LEDGER_KIND_LABELS, LedgerEntry, LedgerKind, LedgerSummary,
  addLedgerEntry, fetchLedgerEntries, fetchLedgerSummary, fetchOnboardingCompanies,
} from '@/lib/ledger';
import { Car, FileText, Loader2, Minus, Plus, Receipt, Wallet } from 'lucide-react';

const cents = (n: number | null | undefined) => money((n ?? 0) / 100);

// IRS standard mileage rate by drive date (dollars/mile). Verify against the
// current IRS notice each January — stored on the entry, so history stays
// auditable even if the table below ages.
const MILEAGE_RATES: [string, number][] = [
  ['2026-07-01', 0.76],
  ['2026-01-01', 0.725],
  ['2025-01-01', 0.70],
  ['2024-01-01', 0.67],
];
const mileageRateFor = (isoDate: string): number => {
  for (const [from, rate] of MILEAGE_RATES) if (isoDate >= from) return rate;
  return MILEAGE_RATES[MILEAGE_RATES.length - 1][1];
};

const KIND_ICONS: Record<LedgerKind, React.ReactNode> = {
  mileage: <Car className="w-4 h-4" />,
  per_diem: <Receipt className="w-4 h-4" />,
  manual_income: <FileText className="w-4 h-4" />,
  payment_received: <Wallet className="w-4 h-4" />,
  expense_extra: <Minus className="w-4 h-4" />,
  adjustment: <Plus className="w-4 h-4" />,
};

const entryDate = (e: LedgerEntry) => format(new Date(e.entry_date + 'T12:00:00'), 'MMM d, yyyy');

const AddEntryForm: React.FC<{ onDone: () => void }> = ({ onDone }) => {
  const [kind, setKind] = useState<LedgerKind>('manual_income');
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [companyId, setCompanyId] = useState('');
  const [payer, setPayer] = useState('');
  const [invoiceRef, setInvoiceRef] = useState('');
  const [miles, setMiles] = useState('');
  const [rate, setRate] = useState('');
  const [odoStart, setOdoStart] = useState('');
  const [odoEnd, setOdoEnd] = useState('');
  const [nights, setNights] = useState('');
  const [nightlyRate, setNightlyRate] = useState('');
  const [locality, setLocality] = useState('');
  const [method, setMethod] = useState('');
  const [reference, setReference] = useState('');
  const [busy, setBusy] = useState(false);

  const companies = useSupabaseQuery(fetchOnboardingCompanies, []);
  const companyOptions = useMemo(() => {
    const map = new Map<string, string>();
    (companies.data ?? []).forEach((c) => map.set(c.company_id, c.company_name));
    return Array.from(map.entries());
  }, [companies.data]);

  const isIncomeSide = ['manual_income', 'payment_received', 'mileage', 'per_diem'].includes(kind);

  const submit = async () => {
    const dollars = parseFloat(amount);
    if (!dollars || dollars <= 0) return toast.error('Enter an amount greater than zero');
    let amountCents = Math.round(dollars * 100);
    const details: Record<string, unknown> = {};

    if (kind === 'mileage') {
      const m = parseFloat(miles);
      const r = parseFloat(rate) || mileageRateFor(date);
      if (!m || m <= 0) return toast.error('Enter miles driven');
      amountCents = Math.round(m * r * 100);
      details.miles = m;
      details.rate_cents = Math.round(r * 100);
      if (odoStart) details.odometer_start = Number(odoStart);
      if (odoEnd) details.odometer_end = Number(odoEnd);
    } else if (kind === 'per_diem') {
      const n = parseInt(nights, 10);
      const nr = parseFloat(nightlyRate);
      if (!n || n <= 0 || !nr || nr <= 0) return toast.error('Enter nights and nightly rate');
      amountCents = Math.round(n * nr * 100);
      details.nights = n;
      details.gsa_rate_cents = Math.round(nr * 100);
      if (locality) details.locality = locality;
    } else if (kind === 'manual_income') {
      if (payer) details.payer = payer;
      if (invoiceRef) details.invoice_ref = invoiceRef;
    } else if (kind === 'payment_received') {
      if (method) details.method = method;
      if (reference) details.reference = reference;
    }

    setBusy(true);
    const { error } = await addLedgerEntry({
      kind,
      amount_cents: kind === 'expense_extra' ? -amountCents : amountCents,
      entry_date: date,
      company_id: companyId || null,
      details,
      description: description || null,
    });
    setBusy(false);
    if (error) return toast.error(error);
    toast.success('Ledger entry saved');
    onDone();
  };

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <Label className="text-xs">Type</Label>
            <Select value={kind} onValueChange={(v) => setKind(v as LedgerKind)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(LEDGER_KIND_LABELS) as LedgerKind[]).map((k) => (
                  <SelectItem key={k} value={k}>{LEDGER_KIND_LABELS[k]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Date</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">{kind === 'mileage' ? 'Miles' : kind === 'per_diem' ? 'Nights × rate' : 'Amount ($)'}</Label>
            {kind === 'mileage' ? (
              <div className="flex gap-1">
                <Input placeholder="Miles" value={miles} onChange={(e) => setMiles(e.target.value)} />
                <Input placeholder={`Rate (${(parseFloat(rate) || mileageRateFor(date)).toFixed(3)})`} value={rate} onChange={(e) => setRate(e.target.value)} className="w-28" />
              </div>
            ) : kind === 'per_diem' ? (
              <div className="flex gap-1">
                <Input placeholder="Nights" value={nights} onChange={(e) => setNights(e.target.value)} />
                <Input placeholder="$/night" value={nightlyRate} onChange={(e) => setNightlyRate(e.target.value)} />
              </div>
            ) : (
              <Input placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} />
            )}
          </div>
          <div>
            <Label className="text-xs">Company (optional)</Label>
            <Select value={companyId} onValueChange={setCompanyId}>
              <SelectTrigger><SelectValue placeholder="Off-platform / none" /></SelectTrigger>
              <SelectContent>
                {companyOptions.map(([id, name]) => <SelectItem key={id} value={id}>{name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        {kind === 'mileage' && (
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-xs">Odometer start (audit-proof)</Label><Input placeholder="e.g. 45210" value={odoStart} onChange={(e) => setOdoStart(e.target.value)} /></div>
            <div><Label className="text-xs">Odometer end</Label><Input placeholder="e.g. 45287" value={odoEnd} onChange={(e) => setOdoEnd(e.target.value)} /></div>
          </div>
        )}
        {kind === 'per_diem' && (
          <div><Label className="text-xs">Locality / GSA area</Label><Input placeholder="e.g. Los Angeles, CA" value={locality} onChange={(e) => setLocality(e.target.value)} /></div>
        )}
        {kind === 'manual_income' && (
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-xs">Paid by (who)</Label><Input placeholder="Production company name" value={payer} onChange={(e) => setPayer(e.target.value)} /></div>
            <div><Label className="text-xs">Invoice / reference #</Label><Input value={invoiceRef} onChange={(e) => setInvoiceRef(e.target.value)} /></div>
          </div>
        )}
        {kind === 'payment_received' && (
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-xs">Method</Label><Input placeholder="Zelle, check, cash, PayPal" value={method} onChange={(e) => setMethod(e.target.value)} /></div>
            <div><Label className="text-xs">Reference</Label><Input placeholder="Confirmation #" value={reference} onChange={(e) => setReference(e.target.value)} /></div>
          </div>
        )}

        <div>
          <Label className="text-xs">Note</Label>
          <Input placeholder={isIncomeSide ? 'What was this for?' : 'What did you spend on?'} value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <Button size="sm" onClick={submit} disabled={busy}>
          {busy && <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />} Save entry
        </Button>
      </CardContent>
    </Card>
  );
};

const LedgerPage: React.FC = () => {
  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(thisYear);
  const [showForm, setShowForm] = useState(false);
  const [nonce, setNonce] = useState(0);

  const summary = useSupabaseQuery(() => fetchLedgerSummary(year), [year, nonce]);
  const entries = useSupabaseQuery(() => fetchLedgerEntries({ limit: 200 }), [nonce]);
  const s: LedgerSummary | null = summary.data;

  const yearOptions = [thisYear, thisYear - 1, thisYear - 2];

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Work ledger</h1>
          <p className="text-sm text-muted-foreground">Everything you're owed across every production — platform and off-platform. Your records, your leverage.</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              {yearOptions.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button size="sm" variant={showForm ? 'secondary' : 'default'} onClick={() => setShowForm((v) => !v)}>
            {showForm ? 'Close' : 'Add entry'}
          </Button>
        </div>
      </div>

      {summary.loading ? <Skeleton className="h-28 w-full" /> : s && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Earned ({year})</p><p className="text-xl font-semibold">{cents(s.earned_cents)}</p><p className="text-xs text-muted-foreground">platform + off-platform</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Received</p><p className="text-xl font-semibold">{cents(s.received_cents)}</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Still owed</p><p className={`text-xl font-semibold ${s.outstanding_cents > 0 ? 'text-amber-600 dark:text-amber-400' : ''}`}>{cents(s.outstanding_cents)}</p><p className="text-xs text-muted-foreground">invoices + manual income unpaid</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Expenses + mileage</p><p className="text-xl font-semibold">{cents(s.expenses_cents + s.mileage_cents + s.per_diem_cents)}</p><p className="text-xs text-muted-foreground">{s.total_miles ? `${Math.round(s.total_miles).toLocaleString()} mi logged` : 'no mileage yet'}</p></CardContent></Card>
        </div>
      )}

      {showForm && <AddEntryForm onDone={() => { setShowForm(false); setNonce((n) => n + 1); }} />}

      <Tabs defaultValue="entries">
        <TabsList>
          <TabsTrigger value="entries">Entries</TabsTrigger>
          <TabsTrigger value="companies">By company</TabsTrigger>
        </TabsList>

        <TabsContent value="entries" className="space-y-2 mt-4">
          {entries.loading && <Skeleton className="h-24 w-full" />}
          {!entries.loading && (entries.data ?? []).length === 0 && (
            <p className="text-center text-muted-foreground py-10 text-sm">
              No manual entries yet. Log mileage, per diem, off-platform gigs, or payments received outside Flexzora.
            </p>
          )}
          {(entries.data ?? []).map((e) => (
            <Card key={e.id}>
              <CardContent className="p-3 flex items-center gap-3">
                <div className="p-2 rounded-md bg-muted text-muted-foreground">{KIND_ICONS[e.kind]}</div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">
                    {LEDGER_KIND_LABELS[e.kind]}
                    {e.description ? <span className="text-muted-foreground font-normal"> — {e.description}</span> : null}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {entryDate(e)}
                    {e.kind === 'mileage' && e.details?.miles ? ` · ${e.details.miles} mi${e.details.rate_cents ? ` @ ${cents(e.details.rate_cents)}/mi` : ''}` : ''}
                    {e.kind === 'per_diem' && e.details?.nights ? ` · ${e.details.nights} night${e.details.nights === 1 ? '' : 's'}${e.details.locality ? ` · ${e.details.locality}` : ''}` : ''}
                    {e.status !== 'recorded' ? ` · ${e.status}` : ''}
                  </p>
                </div>
                <p className={`font-semibold ${e.amount_cents < 0 ? 'text-muted-foreground' : ''}`}>{cents(e.amount_cents)}</p>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="companies" className="space-y-2 mt-4">
          {!s || s.by_company.length === 0 ? (
            <p className="text-center text-muted-foreground py-10 text-sm">No company-tagged entries for {year}. Tag entries with a company to see per-client totals.</p>
          ) : s.by_company.map((c) => (
            <Card key={c.company_id}>
              <CardContent className="p-3 flex items-center justify-between">
                <span className="font-medium">{c.company_name ?? 'Unknown company'}</span>
                <div className="text-right">
                  <p className="font-semibold">{cents(c.net_cents)}</p>
                  <p className="text-xs text-muted-foreground">
                    {c.mileage_cents ? `${cents(c.mileage_cents)} mileage · ` : ''}{c.per_diem_cents ? `${cents(c.per_diem_cents)} per diem` : ''}
                  </p>
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default LedgerPage;
