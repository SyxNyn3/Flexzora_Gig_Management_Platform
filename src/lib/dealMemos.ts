// Deal memos — digital offer memos with e-signature (Cast & Crew "Start+"
// parity; see docs/research/castandcrew-patriot-competitive.md).
//
// Backend contract (supabase/migrations/20261220000000_deal_memos.sql):
//   * deal_memos rows are created ONLY by deal_memo_send (company side,
//     confirmed assignments only) — terms are a frozen jsonb snapshot.
//   * The worker signs via deal_memo_sign (typed legal name + optional
//     drawn signature PNG). 'signed' is terminal; companies can void only
//     while status='sent'.
//   * Tables have party-only RLS; there are no direct write grants.
//   * The PDF is rendered client-side from the frozen terms + signature —
//     what you download is exactly what was signed.
import { supabase } from '@/lib/supabase';
import { format } from 'date-fns';
import { jsPDF } from 'jspdf';

export type DealMemoStatus = 'sent' | 'signed' | 'void';

export interface DealMemoTerms {
  worker_name: string;
  worker_email: string | null;
  company_name: string;
  event_name: string;
  event_type: string | null;
  event_start: string;
  event_end: string;
  shift_title: string;
  role_name: string;
  shift_start: string;
  shift_end: string;
  hourly_rate: number | string;
  currency: string;
}

export interface DealMemo {
  id: string;
  assignment_id: string;
  shift_id: string;
  event_id: string;
  worker_id: string;
  company_id: string;
  status: DealMemoStatus;
  terms: DealMemoTerms;
  notes: string | null;
  sent_by: string;
  signed_name: string | null;
  signature_png: string | null;
  signed_at: string | null;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Reads — plain table SELECT; RLS scopes to the two parties.
// ---------------------------------------------------------------------------
export async function myDealMemos(workerId?: string): Promise<{ data: DealMemo[] | null; error: string | null }> {
  try {
    let query = supabase
      .from('deal_memos')
      .select('*')
      .order('created_at', { ascending: false });
    // Dual-role accounts (worker + company member) get BOTH sides back from
    // RLS. The worker page passes its profile id so it only lists memos it
    // can actually sign — otherwise "Review & sign" appears on memos the
    // user sent as a company and fails server-side every time.
    if (workerId) query = query.eq('worker_id', workerId);
    const { data, error } = await query;
    if (error) throw error;
    return { data: (data ?? []) as DealMemo[], error: null };
  } catch (e) {
    return { data: null, error: e instanceof Error ? e.message : String(e) };
  }
}

// ---------------------------------------------------------------------------
// Writes — RPC-only.
// ---------------------------------------------------------------------------
export async function sendDealMemo(assignmentId: string, notes?: string) {
  try {
    const { data, error } = await supabase.rpc('deal_memo_send', {
      p_assignment_id: assignmentId,
      p_notes: notes || null,
    });
    if (error) throw error;
    return { memoId: data as string, error: null as string | null };
  } catch (e) {
    return { memoId: null, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function signDealMemo(memoId: string, signedName: string, signaturePng?: string | null) {
  try {
    const { error } = await supabase.rpc('deal_memo_sign', {
      p_memo_id: memoId,
      p_signed_name: signedName,
      p_signature_png: signaturePng || null,
    });
    if (error) throw error;
    return { error: null as string | null };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export async function voidDealMemo(memoId: string) {
  try {
    const { error } = await supabase.rpc('deal_memo_void', { p_memo_id: memoId });
    if (error) throw error;
    return { error: null as string | null };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

// ---------------------------------------------------------------------------
// PDF — rendered from the frozen terms + captured signature so the download
// is the signed artifact, not a regeneration from live (mutable) data.
// ---------------------------------------------------------------------------
export function downloadDealMemoPdf(memo: DealMemo) {
  const t = memo.terms;
  const doc = new jsPDF();
  doc.setFontSize(18);
  doc.text('Deal Memo', 14, 20);
  doc.setFontSize(10);
  doc.text(`FlexZora · generated ${format(new Date(memo.created_at), 'MMMM d, yyyy')}`, 14, 27);

  const y = 38;
  doc.setFontSize(11);
  doc.text('Engagement', 14, y);
  doc.setFontSize(10);
  const rows: [string, string][] = [
    ['Worker', t.worker_name],
    ['Company', t.company_name],
    ['Event', `${t.event_name} (${t.event_type ?? 'event'})`],
    ['Event dates', `${format(new Date(t.event_start), 'MMM d, yyyy')} – ${format(new Date(t.event_end), 'MMM d, yyyy')}`],
    ['Call', `${t.shift_title} — ${t.role_name}`],
    ['Call window', `${format(new Date(t.shift_start), 'EEE MMM d, yyyy h:mm a')} – ${format(new Date(t.shift_end), 'h:mm a')}`],
    ['Rate', `$${Number(t.hourly_rate).toFixed(2)} / hr ${t.currency}`],
  ];
  let yy = y + 8;
  for (const [k, v] of rows) {
    doc.text(`${k}:`, 14, yy);
    doc.text(String(v), 55, yy);
    yy += 7;
  }
  if (memo.notes) {
    yy += 4;
    doc.text('Notes:', 14, yy); yy += 6;
    doc.text(doc.splitTextToSize(memo.notes, 170), 14, yy);
    yy += doc.splitTextToSize(memo.notes, 170).length * 5 + 8;
  } else {
    yy += 8;
  }

  doc.setFontSize(9);
  doc.text('This memo records the terms above between the worker and company. It is an', 14, yy);
  doc.text('acknowledgment of the engagement, not a payroll document or employment contract.', 14, yy + 5);
  yy += 14;

  if (memo.status === 'signed') {
    doc.setFontSize(11);
    doc.text('Signed', 14, yy);
    doc.setFontSize(10);
    doc.text(`By: ${memo.signed_name}`, 14, yy + 8);
    doc.text(`Date: ${format(new Date(memo.signed_at!), 'MMMM d, yyyy h:mm a')}`, 14, yy + 14);
    if (memo.signature_png) {
      try {
        doc.addImage(memo.signature_png, 'PNG', 14, yy + 20, 80, 30);
      } catch {
        // Signature image failed to embed — the typed name + timestamp still
        // carry the acknowledgment; note it rather than silently dropping.
        doc.text('(signature image unavailable)', 14, yy + 34);
      }
    }
  } else {
    doc.setFontSize(10);
    doc.text('Status: awaiting worker signature', 14, yy);
  }

  doc.save(`deal-memo-${t.role_name.replace(/\s+/g, '-').toLowerCase()}-${format(new Date(memo.created_at), 'yyyy-MM-dd')}.pdf`);
}
