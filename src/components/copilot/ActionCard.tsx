// Action preview card — the copilot never acts without an explicit confirm.
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CheckCheck, ClipboardCopy, FileText, Megaphone, X } from 'lucide-react';
import { CopilotAction } from '@/lib/types';

interface Props {
  action: CopilotAction;
  busy: boolean;
  onConfirm: () => void;
  onDismiss: () => void;
  onCopy?: (text: string) => void;
}

const ActionCard: React.FC<Props> = ({ action, busy, onConfirm, onDismiss, onCopy }) => {
  const [copied, setCopied] = useState(false);
  const payload = action.payload;
  const isDone = action.status === 'done';
  const isDismissed = action.status === 'dismissed';

  const copyDraft = async () => {
    const text = String(payload.draft ?? '');
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      onCopy?.(text);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="mt-2 rounded-md border bg-accent/30 p-3 space-y-2">
      <div className="flex items-center gap-2">
        {action.kind === 'save_doc' ? <FileText className="w-4 h-4 text-primary" /> : <Megaphone className="w-4 h-4 text-primary" />}
        <span className="text-sm font-medium">{action.label}</span>
        {isDone && <Badge className="bg-green-600 text-xs">done{action.note ? ` — ${action.note}` : ''}</Badge>}
        {isDismissed && <Badge variant="outline" className="text-xs">dismissed</Badge>}
      </div>

      {action.kind === 'broadcast_draft' && (
        <div className="text-xs space-y-1">
          <div className="text-muted-foreground">
            Audience:{' '}
            {payload.shift_title
              ? `crew on “${payload.shift_title}”`
              : payload.event_name
                ? `everyone on “${payload.event_name}”`
                : 'all rostered crew'}
          </div>
          <div className="rounded bg-background border p-2 whitespace-pre-wrap">{String(payload.draft ?? '') || '—'}</div>
          <div className="text-muted-foreground italic">
            Nothing sends automatically — this is a draft for your review.
          </div>
        </div>
      )}

      {action.kind === 'save_doc' && (
        <div className="rounded bg-background border p-2 text-xs whitespace-pre-wrap">{String(payload.body ?? '')}</div>
      )}

      {action.status === 'pending' && (
        <div className="flex gap-2">
          {action.kind === 'save_doc' && (
            <Button size="sm" onClick={onConfirm} disabled={busy}>
              <CheckCheck className="w-3.5 h-3.5 mr-1" /> Save note
            </Button>
          )}
          {action.kind === 'broadcast_draft' && (
            <Button size="sm" variant="secondary" onClick={copyDraft}>
              {copied ? <CheckCheck className="w-3.5 h-3.5 mr-1" /> : <ClipboardCopy className="w-3.5 h-3.5 mr-1" />}
              {copied ? 'Copied' : 'Copy draft'}
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={onDismiss} disabled={busy}>
            <X className="w-3.5 h-3.5 mr-1" /> Dismiss
          </Button>
        </div>
      )}
    </div>
  );
};

export default ActionCard;
