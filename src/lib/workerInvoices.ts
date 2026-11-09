import { supabase } from '@/lib/supabase';
import { jsPDF } from 'jspdf';
import { format } from 'date-fns';

// Worker-issued invoices — the worker→client document for gigs that don't
// run through platform payroll (off-platform calls, direct-hire work, any
// client that asks for "an invoice"). Distinct from the platform `invoices`
// table, which is company→worker payroll paperwork with fees/timesheets.
//
// Money is integer cents everywhere, matching the rest of the schema. The
// DB recomputes subtotal/total from line_items on every write, so these
// fields are display-only here — never trust a client-sent total.

export interface InvoiceLineItem {
  description: string;
  quantity: number;
  rate_cents: number;
}

export interface WorkerInvoice {
  id: string;
  worker_id: string;
  invoice_number: string;
  bill_to_name: string;
  bill_to_email: string | null;
  bill_to_address: string | null;
  description: string;
  line_items: InvoiceLineItem[];
  currency: string;
  status: 'draft' | 'sent' | 'paid' | 'void';
  subtotal_cents: number;
  total_cents: number;
  issued_at: string | null;
  paid_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface InvoiceInput {
  bill_to_name: string;
  bill_to_email?: string | null;
  bill_to_address?: string | null;
  description?: string;
  line_items: InvoiceLineItem[];
  notes?: string | null;
}

const TABLE = 'worker_invoices';

export async function myInvoices(): Promise<{ data: WorkerInvoice[] | null; error: string | null }> {
  try {
    const { data, error } = await supabase
      .from(TABLE)
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return { data: (data ?? []) as WorkerInvoice[], error: null };
  } catch (e) {
    return { data: null, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function createInvoice(input: InvoiceInput) {
  try {
    // worker_id must be the caller's profile id; RLS WITH CHECK enforces it,
    // but send it explicitly so the row is self-describing.
    const { data: authData } = await supabase.auth.getUser();
    const { data: prof } = await supabase
      .from('profiles').select('id').eq('user_id', authData.user?.id ?? '').single();
    if (!prof) return { error: 'No worker profile found' };

    const { data, error } = await supabase
      .from(TABLE)
      .insert({
        worker_id: prof.id,
        bill_to_name: input.bill_to_name.trim(),
        bill_to_email: input.bill_to_email?.trim() || null,
        bill_to_address: input.bill_to_address?.trim() || null,
        description: input.description?.trim() ?? '',
        line_items: input.line_items,
        notes: input.notes?.trim() || null,
      })
      .select()
      .single();
    if (error) throw error;
    return { invoice: data as WorkerInvoice, error: null as string | null };
  } catch (e) {
    return { invoice: null, error: e instanceof Error ? e.message : String(e) };
  }
}

// Status transitions are worker bookkeeping, not payment state — 'paid'
// means the worker marked it paid (they got the money their own way).
export async function setInvoiceStatus(id: string, status: WorkerInvoice['status']) {
  try {
    const patch: Record<string, unknown> = { status };
    if (status === 'sent' || status === 'paid') patch.issued_at = new Date().toISOString();
    if (status === 'paid') patch.paid_at = new Date().toISOString();
    const { error } = await supabase.from(TABLE).update(patch).eq('id', id);
    if (error) throw error;
    return { error: null as string | null };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export async function deleteInvoice(id: string) {
  try {
    const { error } = await supabase.from(TABLE).delete().eq('id', id).eq('status', 'draft');
    if (error) throw error;
    return { error: null as string | null };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

const money = (cents: number, currency = 'usd') =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: currency.toUpperCase() }).format(cents / 100);

// PDF rendered from the stored row — invoice_number, totals, and line items
// all come from the DB (totals recomputed server-side), so the document
// matches what the worker recorded.
export function downloadInvoicePdf(inv: WorkerInvoice) {
  const doc = new jsPDF();
  doc.setFontSize(20);
  doc.text('INVOICE', 14, 20);
  doc.setFontSize(11);
  doc.text(inv.invoice_number, 14, 28);
  doc.setFontSize(10);
  doc.text(`Issued: ${inv.issued_at ? format(new Date(inv.issued_at), 'MMMM d, yyyy') : format(new Date(inv.created_at), 'MMMM d, yyyy')}`, 14, 34);
  if (inv.status === 'paid' && inv.paid_at) {
    doc.text(`Paid: ${format(new Date(inv.paid_at), 'MMMM d, yyyy')}`, 14, 39);
  }

  // Bill-to block (right column)
  doc.setFontSize(10);
  doc.text('Bill to:', 130, 20);
  doc.setFontSize(11);
  doc.text(inv.bill_to_name, 130, 26);
  let by = 31;
  if (inv.bill_to_email) { doc.setFontSize(10); doc.text(inv.bill_to_email, 130, by); by += 5; }
  if (inv.bill_to_address) {
    doc.setFontSize(10);
    doc.text(doc.splitTextToSize(inv.bill_to_address, 60), 130, by);
    by += doc.splitTextToSize(inv.bill_to_address, 60).length * 5;
  }

  // Line items table
  let y = 55;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('Description', 14, y);
  doc.text('Qty', 120, y);
  doc.text('Rate', 140, y);
  doc.text('Amount', 170, y);
  doc.setFont('helvetica', 'normal');
  y += 7;
  for (const item of inv.line_items ?? []) {
    const amount = (item.quantity ?? 1) * (item.rate_cents ?? 0);
    doc.text(doc.splitTextToSize(item.description || '—', 100)[0] ?? '—', 14, y);
    doc.text(String(item.quantity ?? 1), 120, y);
    doc.text(money(item.rate_cents ?? 0, inv.currency), 140, y);
    doc.text(money(amount, inv.currency), 170, y);
    y += 7;
    if (y > 260) { doc.addPage(); y = 20; }
  }

  if (inv.description) {
    y += 4;
    doc.setFontSize(10);
    doc.text('Notes:', 14, y); y += 6;
    doc.text(doc.splitTextToSize(inv.description, 170), 14, y);
    y += doc.splitTextToSize(inv.description, 170).length * 5 + 6;
  }

  y += 6;
  doc.setFont('helvetica', 'bold');
  doc.text('Total', 140, y);
  doc.text(money(inv.total_cents, inv.currency), 170, y);
  doc.setFont('helvetica', 'normal');

  if (inv.notes) {
    y += 12;
    doc.setFontSize(9);
    doc.text(doc.splitTextToSize(inv.notes, 170), 14, y);
  }

  doc.setFontSize(8);
  doc.setTextColor(120);
  doc.text('Generated by FlexZora — informal invoice for services rendered. Not a payroll document.', 14, 285);
  doc.save(`${inv.invoice_number}.pdf`);
}
