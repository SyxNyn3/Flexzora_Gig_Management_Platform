import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Plus, FileDown, Trash2, Send, CheckCircle2, Ban } from 'lucide-react';
import {
  myInvoices, createInvoice, setInvoiceStatus, deleteInvoice,
  downloadInvoicePdf, WorkerInvoice, InvoiceLineItem,
} from '@/lib/workerInvoices';

const money = (cents: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);

const statusTone: Record<WorkerInvoice['status'], string> = {
  draft: 'bg-muted text-muted-foreground',
  sent: 'bg-blue-500/10 text-blue-700 dark:text-blue-300',
  paid: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  void: 'bg-destructive/10 text-destructive',
};

interface LineDraft { description: string; quantity: string; rate: string }

const emptyLine = (): LineDraft => ({ description: '', quantity: '1', rate: '' });

const InvoicesPage: React.FC = () => {
  const [invoices, setInvoices] = useState<WorkerInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  // Create-form state
  const [billToName, setBillToName] = useState('');
  const [billToEmail, setBillToEmail] = useState('');
  const [billToAddress, setBillToAddress] = useState('');
  const [description, setDescription] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<LineDraft[]>([emptyLine()]);

  const load = async () => {
    const { data, error: err } = await myInvoices();
    if (err) setError(err); else { setError(null); setInvoices(data ?? []); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const setLine = (i: number, patch: Partial<LineDraft>) =>
    setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  const lineTotal = lines.reduce((s, l) => {
    const q = parseFloat(l.quantity) || 0;
    const r = parseFloat(l.rate) || 0;
    return s + q * r * 100;
  }, 0);

  const resetForm = () => {
    setBillToName(''); setBillToEmail(''); setBillToAddress('');
    setDescription(''); setNotes(''); setLines([emptyLine()]);
  };

  const submit = async () => {
    if (!billToName.trim()) return toast.error('Bill-to name is required');
    const items: InvoiceLineItem[] = lines
      .filter((l) => l.description.trim() && (parseFloat(l.rate) || 0) > 0)
      .map((l) => ({
        description: l.description.trim(),
        quantity: parseFloat(l.quantity) || 1,
        rate_cents: Math.round((parseFloat(l.rate) || 0) * 100),
      }));
    if (items.length === 0) return toast.error('Add at least one line item with a rate');

    setBusy(true);
    const { error: err } = await createInvoice({
      bill_to_name: billToName,
      bill_to_email: billToEmail || null,
      bill_to_address: billToAddress || null,
      description,
      notes,
      line_items: items,
    });
    setBusy(false);
    if (err) return toast.error(err);
    toast.success('Invoice created');
    setCreateOpen(false);
    resetForm();
    load();
  };

  const act = async (id: string, status: WorkerInvoice['status'], ok: string) => {
    const { error: err } = await setInvoiceStatus(id, status);
    if (err) return toast.error(err);
    toast.success(ok);
    load();
  };

  const remove = async (id: string) => {
    const { error: err } = await deleteInvoice(id);
    if (err) return toast.error(err);
    toast.success('Draft deleted');
    load();
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">Invoices</h1>
          <p className="text-muted-foreground mt-1">
            Bills you send clients for work outside platform payroll — gigs that pay you directly.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="w-4 h-4 mr-2" />New invoice
        </Button>
      </div>

      {loading ? (
        <div className="space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-24" />)}</div>
      ) : error ? (
        <Card><CardContent className="py-8 text-center text-destructive">{error}</CardContent></Card>
      ) : invoices.length === 0 ? (
        <Card><CardContent className="py-10 text-center">
          <p className="text-muted-foreground mb-4">No invoices yet.</p>
          <p className="text-sm text-muted-foreground">
            When a client asks for an invoice — or you want a paper trail for a direct-hire gig —
            create one here and download the PDF.
          </p>
        </CardContent></Card>
      ) : (
        <div className="space-y-3">
          {invoices.map((inv) => (
            <Card key={inv.id}>
              <CardContent className="py-4">
                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold">{inv.invoice_number}</p>
                      <Badge variant="outline" className={statusTone[inv.status]}>{inv.status}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1 truncate">
                      {inv.bill_to_name}
                      {inv.bill_to_email ? ` · ${inv.bill_to_email}` : ''}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {inv.line_items?.length ?? 0} line{(inv.line_items?.length ?? 0) === 1 ? '' : 's'} ·{' '}
                      {money(inv.total_cents)}
                      {inv.issued_at ? ` · issued ${new Date(inv.issued_at).toLocaleDateString()}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 flex-wrap">
                    {inv.status === 'draft' && (
                      <>
                        <Button size="sm" onClick={() => act(inv.id, 'sent', 'Marked as sent')} disabled={busy}>
                          <Send className="w-4 h-4 mr-1" />Mark sent
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => remove(inv.id)} disabled={busy}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </>
                    )}
                    {inv.status === 'sent' && (
                      <Button size="sm" onClick={() => act(inv.id, 'paid', 'Marked as paid')} disabled={busy}>
                        <CheckCircle2 className="w-4 h-4 mr-1" />Mark paid
                      </Button>
                    )}
                    {(inv.status === 'draft' || inv.status === 'sent') && (
                      <Button size="sm" variant="ghost" onClick={() => act(inv.id, 'void', 'Invoice voided')} disabled={busy}>
                        <Ban className="w-4 h-4" />
                      </Button>
                    )}
                    <Button size="sm" variant="outline" onClick={() => downloadInvoicePdf(inv)}>
                      <FileDown className="w-4 h-4 mr-1" />PDF
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New invoice</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label>Bill to (client name) *</Label>
                <Input value={billToName} onChange={(e) => setBillToName(e.target.value)} placeholder="Acme Events LLC" />
              </div>
              <div>
                <Label>Client email</Label>
                <Input value={billToEmail} onChange={(e) => setBillToEmail(e.target.value)} placeholder="ap@acme.com" />
              </div>
            </div>
            <div>
              <Label>Client address</Label>
              <Input value={billToAddress} onChange={(e) => setBillToAddress(e.target.value)} placeholder="123 Main St, City, ST 00000" />
            </div>
            <div>
              <Label>Description (shown on the invoice)</Label>
              <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Stagehand services — Foo Festival" />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <Label>Line items</Label>
                <Button size="sm" variant="outline" onClick={() => setLines((ls) => [...ls, emptyLine()])}>
                  <Plus className="w-3 h-3 mr-1" />Add line
                </Button>
              </div>
              <div className="space-y-2">
                {lines.map((l, i) => (
                  <div key={i} className="grid grid-cols-[1fr_70px_100px_32px] gap-2 items-center">
                    <Input value={l.description} onChange={(e) => setLine(i, { description: e.target.value })} placeholder="Description" />
                    <Input type="number" min="0" step="0.5" value={l.quantity} onChange={(e) => setLine(i, { quantity: e.target.value })} placeholder="Qty" />
                    <Input type="number" min="0" step="0.01" value={l.rate} onChange={(e) => setLine(i, { rate: e.target.value })} placeholder="Rate $" />
                    <Button size="sm" variant="ghost" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))} disabled={lines.length === 1}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>
              <p className="text-sm text-right mt-2 text-muted-foreground">
                Total: <span className="font-semibold text-foreground">{money(lineTotal)}</span>
              </p>
            </div>

            <div>
              <Label>Notes (private — not printed on the PDF)</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Internal notes about this job" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={submit} disabled={busy}>{busy ? 'Creating…' : 'Create invoice'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default InvoicesPage;
