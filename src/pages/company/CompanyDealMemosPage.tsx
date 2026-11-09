import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { supabase } from '@/lib/supabase';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  myDealMemos, sendDealMemo, voidDealMemo, downloadDealMemoPdf,
  DealMemo,
} from '@/lib/dealMemos';
import { FileDown, Send, Ban } from 'lucide-react';

// Company deal memos — two jobs on one screen:
//   1) Send: confirmed assignments on the company's shifts that don't have a
//      memo yet. deal_memo_send snapshots the terms server-side.
//   2) Track: every memo sent, with status (sent/signed/void), notes input,
//      void while unsigned, and PDF download.

interface ConfirmedAssignment {
  id: string;
  worker_id: string;
  worker_name: string;
  shift_title: string;
  role_name: string;
  shift_start: string;
  hourly_rate: number | string;
  event_name: string;
}

const statusBadge = (s: DealMemo['status']) =>
  s === 'signed' ? 'bg-green-500/15 text-green-600 border-green-500/30'
  : s === 'sent' ? 'bg-amber-500/15 text-amber-600 border-amber-500/30'
  : 'bg-muted text-muted-foreground border-border';

// Confirmed assignments on shifts belonging to the member's companies that
// don't already have a memo. Queries are chained with .in() rather than
// PostgREST nested embeds — FK constraint names differ across migrations and
// explicit joins are easier to verify. RLS scopes every table to the member's
// companies, so no company filter is needed on assignments themselves.
async function fetchConfirmedAssignments(memoAssignmentIds: Set<string>): Promise<ConfirmedAssignment[]> {
  const { data: memberships } = await supabase.from('company_members').select('company_id');
  const companyIds = (memberships ?? []).map((m) => m.company_id);
  if (companyIds.length === 0) return [];

  const { data: events } = await supabase.from('events').select('id, name').in('company_id', companyIds);
  const eventName = new Map((events ?? []).map((e) => [e.id, e.name]));
  const eventIds = [...eventName.keys()];
  if (eventIds.length === 0) return [];

  const { data: shifts } = await supabase
    .from('shifts')
    .select('id, title, role_name, starts_at, hourly_rate, event_id')
    .in('event_id', eventIds);
  const shiftById = new Map((shifts ?? []).map((s) => [s.id, s]));
  const shiftIds = [...shiftById.keys()];
  if (shiftIds.length === 0) return [];

  const { data: assignments } = await supabase
    .from('shift_assignments')
    .select('id, worker_id, shift_id')
    .in('shift_id', shiftIds)
    .eq('status', 'confirmed');
  const candidates = (assignments ?? []).filter((a) => !memoAssignmentIds.has(a.id));
  if (candidates.length === 0) return [];

  const workerIds = [...new Set(candidates.map((a) => a.worker_id))];
  const { data: profiles } = await supabase.from('profiles').select('id, full_name').in('id', workerIds);
  const nameById = new Map((profiles ?? []).map((p) => [p.id, p.full_name]));

  return candidates.map((a) => {
    const shift = shiftById.get(a.shift_id)!;
    return {
      id: a.id,
      worker_id: a.worker_id,
      worker_name: nameById.get(a.worker_id) ?? 'Crew member',
      shift_title: shift.title,
      role_name: shift.role_name,
      shift_start: shift.starts_at,
      hourly_rate: shift.hourly_rate,
      event_name: eventName.get(shift.event_id) ?? '',
    } satisfies ConfirmedAssignment;
  });
}

const CompanyDealMemosPage: React.FC = () => {
  const [memos, setMemos] = useState<DealMemo[]>([]);
  const [candidates, setCandidates] = useState<ConfirmedAssignment[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = async () => {
    const { data } = await myDealMemos();
    const memoList = data ?? [];
    setMemos(memoList);

    // Rebuild the assignment->shift map from a fresh confirmed-assignment
    // pull so we can label each candidate row.
    const memoIds = new Set(memoList.map((m) => m.assignment_id));
    const rows = await fetchConfirmedAssignments(memoIds);
    setCandidates(rows);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const send = async (assignmentId: string) => {
    setBusyId(assignmentId);
    const { memoId, error } = await sendDealMemo(assignmentId, notes[assignmentId]);
    setBusyId(null);
    if (error) { toast.error(error); return; }
    toast.success('Deal memo sent — the worker can sign it now');
    setNotes((n) => ({ ...n, [assignmentId]: '' }));
    load();
    void memoId;
  };

  const voidMemo = async (memoId: string) => {
    if (!window.confirm('Void this memo? The worker will no longer be able to sign it.')) return;
    setBusyId(memoId);
    const { error } = await voidDealMemo(memoId);
    setBusyId(null);
    if (error) { toast.error(error); return; }
    toast.success('Memo voided');
    load();
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      <h1 className="text-3xl font-bold mb-1">Deal memos</h1>
      <p className="text-muted-foreground mb-6">
        Send signed agreements for confirmed calls. Workers sign digitally; the memo is kept on file.
      </p>

      <h2 className="text-lg font-semibold mb-3">Ready to send</h2>
      {loading ? (
        <Skeleton className="h-24 rounded-xl mb-8" />
      ) : candidates.length === 0 ? (
        <Card className="mb-8"><CardContent className="py-6 text-center text-muted-foreground">
          Every confirmed booking already has a memo (or none are confirmed yet).
        </CardContent></Card>
      ) : (
        <div className="space-y-3 mb-8">
          {candidates.map((a) => (
            <Card key={a.id}>
              <CardContent className="py-4">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div>
                    <p className="font-semibold">{a.role_name} — {a.worker_name}</p>
                    <p className="text-sm text-muted-foreground">
                      {a.event_name} · {a.shift_title} · {format(new Date(a.shift_start), 'EEE MMM d, h:mm a')}
                    </p>
                    <p className="text-sm">${Number(a.hourly_rate).toFixed(2)}/hr</p>
                  </div>
                  <div className="flex gap-2 items-center flex-wrap">
                    <Input
                      className="w-48" placeholder="Optional note to worker"
                      value={notes[a.id] ?? ''}
                      onChange={(e) => setNotes((n) => ({ ...n, [a.id]: e.target.value }))}
                    />
                    <Button size="sm" onClick={() => send(a.id)} disabled={busyId === a.id}>
                      <Send className="w-4 h-4 mr-1" />{busyId === a.id ? 'Sending…' : 'Send memo'}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <h2 className="text-lg font-semibold mb-3">Sent memos</h2>
      {loading ? (
        <Skeleton className="h-24 rounded-xl" />
      ) : memos.length === 0 ? (
        <Card><CardContent className="py-6 text-center text-muted-foreground">No memos sent yet.</CardContent></Card>
      ) : (
        <div className="space-y-3">
          {memos.map((m) => (
            <Card key={m.id}>
              <CardContent className="py-4">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold">{m.terms.role_name} — {m.terms.worker_name}</p>
                      <Badge variant="outline" className={statusBadge(m.status)}>{m.status}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {m.terms.event_name} · {format(new Date(m.terms.shift_start), 'EEE MMM d, h:mm a')}
                    </p>
                    {m.status === 'signed' && m.signed_name && (
                      <p className="text-xs text-muted-foreground mt-1">Signed by {m.signed_name}</p>
                    )}
                  </div>
                  <div className="flex gap-2 shrink-0">
                    {m.status === 'sent' && (
                      <Button size="sm" variant="outline" onClick={() => voidMemo(m.id)} disabled={busyId === m.id}>
                        <Ban className="w-4 h-4 mr-1" />Void
                      </Button>
                    )}
                    <Button size="sm" variant="outline" onClick={async () => {
                      try { await downloadDealMemoPdf(m); }
                      catch { toast.error('Could not generate the PDF'); }
                    }}>
                      <FileDown className="w-4 h-4 mr-1" />PDF
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default CompanyDealMemosPage;
