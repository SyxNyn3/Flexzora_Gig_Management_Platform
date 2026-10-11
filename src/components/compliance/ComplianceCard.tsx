import React, { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { FileCheck2, Loader2, Upload } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { ComplianceService, DOC_TYPE_LABELS } from '@/lib/compliance/service';
import type { ComplianceDoc, ComplianceDocStatus, ComplianceDocType } from '@/lib/types';

const statusTone: Record<ComplianceDocStatus, string> = {
  pending: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30',
  approved: 'bg-green-500/15 text-emerald-500 dark:text-green-400 border-green-500/30',
  rejected: 'bg-red-500/15 text-destructive dark:text-red-400 border-red-500/30',
};

const DOC_TYPES: ComplianceDocType[] = ['w9', 'i9'];

/** Worker-side compliance vault: upload + status for W-9/I-9 documents. */
const ComplianceCard: React.FC = () => {
  const { profile } = useAuth();
  const [docs, setDocs] = useState<ComplianceDoc[]>([]);
  const [busy, setBusy] = useState<ComplianceDocType | null>(null);
  const inputFor = useRef<ComplianceDocType>('w9');
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    if (!profile?.id) return;
    const r = await ComplianceService.listMine(profile.id);
    if (r.error) toast.error(r.error);
    setDocs(r.data ?? []);
  }, [profile?.id]);

  useEffect(() => { load(); }, [load]);

  const pick = (type: ComplianceDocType) => {
    inputFor.current = type;
    fileRef.current?.click();
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !profile?.id) return;
    const type = inputFor.current;
    setBusy(type);
    const up = await ComplianceService.uploadDocument(profile.id, type, file);
    if (up.error || !up.data) {
      setBusy(null);
      return toast.error(up.error ?? 'Upload failed');
    }
    const sub = await ComplianceService.submit(profile.id, type, up.data);
    setBusy(null);
    if (sub.error) return toast.error(sub.error);
    toast.success(`${DOC_TYPE_LABELS[type]} submitted for review`);
    load();
  };

  const byType = new Map(docs.map((d) => [d.doc_type, d]));
  const w9 = byType.get('w9');
  const payoutHeld = w9?.status !== 'approved';

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-md ${payoutHeld ? 'bg-amber-500/15 text-amber-500' : 'bg-green-500/15 text-emerald-500'}`}>
            <FileCheck2 className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm">Tax & eligibility documents</p>
            <p className="text-xs text-muted-foreground">
              {payoutHeld
                ? 'Payouts hold until an approved W-9 is on file — upload it once, it covers every company'
                : 'Compliance docs on file — payouts are clear to send'}
            </p>
          </div>
        </div>

        {DOC_TYPES.map((type) => {
          const doc = byType.get(type);
          return (
            <div key={type} className="flex items-center gap-3 pl-1">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{DOC_TYPE_LABELS[type]}</p>
                {doc?.status === 'rejected' && doc.review_note && (
                  <p className="text-xs text-destructive dark:text-red-400 truncate">Rejected: {doc.review_note}</p>
                )}
              </div>
              {doc && <Badge variant="outline" className={statusTone[doc.status]}>{doc.status}</Badge>}
              <Button size="sm" variant={doc ? 'outline' : 'default'} className="h-7 text-xs" disabled={busy !== null} onClick={() => pick(type)}>
                {busy === type ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Upload className="w-3 h-3 mr-1" />}
                {doc ? (doc.status === 'rejected' ? 'Resubmit' : 'Replace') : 'Upload'}
              </Button>
            </div>
          );
        })}

        <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="hidden" onChange={onFile} />
      </CardContent>
    </Card>
  );
};

export default ComplianceCard;
