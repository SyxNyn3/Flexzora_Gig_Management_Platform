import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import SignaturePad from '@/components/dealMemos/SignaturePad';
import { useAuth } from '@/contexts/AuthContext';
import {
  myDealMemos, signDealMemo, downloadDealMemoPdf,
  DealMemo,
} from '@/lib/dealMemos';
import { FileSignature, FileDown, CheckCircle2 } from 'lucide-react';

// Worker deal memos — every memo a company sent for the worker's confirmed
// calls. 'sent' memos need a signature (typed legal name + optional drawn
// signature); signed/void are read-only with PDF download. The signature is
// an acknowledgment of terms, not a payroll document — the PDF footer says so.

const statusBadge = (s: DealMemo['status']) =>
  s === 'signed' ? 'bg-green-500/15 text-green-600 border-green-500/30'
  : s === 'sent' ? 'bg-amber-500/15 text-amber-600 border-amber-500/30'
  : 'bg-muted text-muted-foreground border-border';

const DealMemoCard: React.FC<{ memo: DealMemo; onChanged: () => void }> = ({ memo, onChanged }) => {
  const [signOpen, setSignOpen] = useState(false);
  const [signedName, setSignedName] = useState('');
  const [signaturePng, setSignaturePng] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const t = memo.terms;

  const sign = async () => {
    if (signedName.trim().length < 2 || busy) return;
    setBusy(true);
    const { error } = await signDealMemo(memo.id, signedName.trim(), signaturePng);
    setBusy(false);
    if (error) { toast.error(error); return; }
    toast.success('Deal memo signed');
    setSignOpen(false);
    onChanged();
  };

  return (
    <Card>
      <CardContent className="py-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-semibold">{t.role_name} — {t.shift_title}</p>
              <Badge variant="outline" className={statusBadge(memo.status)}>{memo.status}</Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              {t.company_name} · {t.event_name} ·{' '}
              {format(new Date(t.shift_start), 'EEE MMM d, h:mm a')}
            </p>
            <p className="text-sm mt-1">
              ${Number(t.hourly_rate).toFixed(2)}/hr · {format(new Date(t.event_start), 'MMM d')}–{format(new Date(t.event_end), 'MMM d, yyyy')}
            </p>
            {memo.status === 'signed' && memo.signed_name && (
              <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" /> Signed by {memo.signed_name}
                {memo.signed_at ? ` · ${format(new Date(memo.signed_at), 'MMM d, yyyy')}` : ''}
              </p>
            )}
          </div>
          <div className="flex gap-2 shrink-0">
            {memo.status === 'sent' && (
              <Button size="sm" onClick={() => setSignOpen(true)}>
                <FileSignature className="w-4 h-4 mr-1" />Review &amp; sign
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={async () => {
              try { await downloadDealMemoPdf(memo); }
              catch { toast.error('Could not generate the PDF'); }
            }}>
              <FileDown className="w-4 h-4 mr-1" />PDF
            </Button>
          </div>
        </div>
      </CardContent>

      <Dialog open={signOpen} onOpenChange={setSignOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Sign deal memo — {t.role_name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 text-sm">
            <div className="bg-muted/50 rounded-md p-3 space-y-1">
              <p><span className="font-medium">Company:</span> {t.company_name}</p>
              <p><span className="font-medium">Event:</span> {t.event_name}</p>
              <p><span className="font-medium">Call:</span> {t.shift_title} — {t.role_name}, {format(new Date(t.shift_start), 'EEE MMM d, yyyy h:mm a')}–{format(new Date(t.shift_end), 'h:mm a')}</p>
              <p><span className="font-medium">Rate:</span> ${Number(t.hourly_rate).toFixed(2)}/hr</p>
              {memo.notes && <p className="pt-1 border-t mt-1"><span className="font-medium">Notes:</span> {memo.notes}</p>}
            </div>
            <p className="text-xs text-muted-foreground">
              Signing acknowledges these terms. This is not a payroll document or employment
              contract — keep the PDF for your records.
            </p>
            <div>
              <Label htmlFor="sign-name">Type your full legal name</Label>
              <Input id="sign-name" value={signedName} maxLength={120}
                     onChange={(e) => setSignedName(e.target.value)}
                     placeholder="As it appears on your ID" />
            </div>
            <SignaturePad onChange={setSignaturePng} />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setSignOpen(false)}>Cancel</Button>
            <Button onClick={sign} disabled={signedName.trim().length < 2 || busy}>
              {busy ? 'Signing…' : 'Sign memo'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
};

const DealMemosPage: React.FC = () => {
  const { profile } = useAuth();
  const [memos, setMemos] = useState<DealMemo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    const { data, error: err } = await myDealMemos(profile?.id);
    if (err) setError(err); else { setError(null); setMemos(data ?? []); }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
      <h1 className="text-3xl font-bold mb-1">Deal memos</h1>
      <p className="text-muted-foreground mb-6">
        Signed agreements for your confirmed calls. Review the terms, sign, and keep the PDF.
      </p>

      {error && <Card className="mb-4"><CardContent className="py-4 text-destructive">{error}</CardContent></Card>}

      {loading ? (
        <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}</div>
      ) : memos.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <FileSignature className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <h2 className="text-xl font-semibold mb-2">No deal memos yet</h2>
            <p className="text-muted-foreground">
              When a company sends you a memo for a confirmed call, it'll show up here to sign.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {memos.map((m) => <DealMemoCard key={m.id} memo={m} onChanged={load} />)}
        </div>
      )}
    </div>
  );
};

export default DealMemosPage;
