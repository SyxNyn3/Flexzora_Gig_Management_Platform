import React, { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { formatDistanceToNow, parseISO } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Check, ExternalLink, Loader2, RefreshCw, ShieldCheck, X } from 'lucide-react';
import { useMyCompany } from '@/hooks/useMarketplace';
import { CertService } from '@/lib/certs/service';
import type { PendingReview } from '@/lib/certs/service';

const CertReviewPage: React.FC = () => {
  const { company } = useMyCompany();
  const [queue, setQueue] = useState<PendingReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [noteFor, setNoteFor] = useState<string | null>(null);
  const [note, setNote] = useState('');

  const load = useCallback(async () => {
    if (!company?.id) return;
    const r = await CertService.reviewQueue(company.id);
    if (r.error) toast.error(r.error);
    setQueue(r.data ?? []);
    setLoading(false);
  }, [company?.id]);

  useEffect(() => { load(); }, [load]);

  const decide = async (cert: PendingReview, approve: boolean) => {
    if (!company?.id) return;
    if (!approve && !note.trim()) {
      setNoteFor(cert.id);
      return toast.error('Rejections need a note — the worker sees it');
    }
    setBusy(cert.id);
    const r = await CertService.decide(cert.id, company.id, approve, approve ? undefined : note.trim());
    setBusy(null);
    if (r.error) return toast.error(r.error);
    toast.success(approve ? 'Verified — counts toward gated calls' : 'Rejected — worker was notified');
    setQueue((q) => q.filter((c) => c.id !== cert.id));
    setNoteFor(null);
    setNote('');
  };

  const openDoc = async (cert: PendingReview) => {
    if (!cert.document_path) return;
    const url = await CertService.documentUrl(cert.document_path);
    if (url) window.open(url, '_blank');
    else toast.error('Document unavailable — ask the worker to re-upload');
  };

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ShieldCheck className="w-6 h-6" /> Credential review
          </h1>
          <p className="text-sm text-muted-foreground">
            Workers on your roster or bookings submitted credential documents. Verified certs gate
            cert-required calls — check the document before you stamp it.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load}>
          <RefreshCw className="w-4 h-4 mr-1" /> Refresh
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading queue…
        </p>
      ) : queue.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            Queue is empty — nothing waiting on your stamp.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {queue.map((cert) => (
            <Card key={cert.id}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">
                    {cert.worker_name ?? 'Worker'} — {cert.name}
                  </CardTitle>
                  <Badge variant="outline" className="text-[10px]">
                    {cert.verification_requested_at
                      ? `submitted ${formatDistanceToNow(parseISO(cert.verification_requested_at), { addSuffix: true })}`
                      : 'pending'}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  {cert.cert_type_code && <span>Type: {cert.cert_type_code}</span>}
                  {cert.issuing_organization && <span>Issuer: {cert.issuing_organization}</span>}
                  {cert.expiration_date && <span>Expires: {cert.expiration_date}</span>}
                  {cert.credential_id && <span>ID: {cert.credential_id}</span>}
                </div>

                <div className="flex items-center gap-2">
                  {cert.document_path ? (
                    <Button variant="outline" size="sm" onClick={() => openDoc(cert)}>
                      <ExternalLink className="w-4 h-4 mr-1" />
                      {cert.document_name ?? 'View document'}
                    </Button>
                  ) : (
                    <span className="text-xs text-muted-foreground">No document attached — ask them to add one.</span>
                  )}
                </div>

                {noteFor === cert.id && (
                  <Textarea
                    autoFocus
                    placeholder="Why is it rejected? (worker sees this — e.g. “scan is unreadable, resubmit a photo of the card”)"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    rows={2}
                  />
                )}

                <div className="flex gap-2">
                  <Button size="sm" disabled={busy === cert.id} onClick={() => decide(cert, true)}>
                    {busy === cert.id ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Check className="w-4 h-4 mr-1" />}
                    Verify
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy === cert.id}
                    onClick={() => (noteFor === cert.id ? decide(cert, false) : setNoteFor(cert.id))}
                  >
                    <X className="w-4 h-4 mr-1" /> {noteFor === cert.id ? 'Reject with note' : 'Reject'}
                  </Button>
                  {noteFor === cert.id && (
                    <Button size="sm" variant="ghost" onClick={() => { setNoteFor(null); setNote(''); }}>
                      Cancel
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default CertReviewPage;
