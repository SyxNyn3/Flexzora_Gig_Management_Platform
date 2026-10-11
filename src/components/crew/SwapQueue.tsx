import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Repeat2, Check, X } from 'lucide-react';
import { companyDecideSwap, listEventSwaps } from '@/lib/crew/swap';
import { money } from '@/components/marketplace/format';
import { SwapClaim, SwapRequest } from '@/lib/types';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';

/** Company swap-approval surface: open/offered swaps on this event's shifts. */
export default function SwapQueue({ eventId }: { eventId: string }) {
  const [requests, setRequests] = useState<SwapRequest[]>([]);
  const [claims, setClaims] = useState<SwapClaim[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<SwapRequest | null>(null);
  const [reason, setReason] = useState('');

  const load = async () => {
    const { data, error } = await listEventSwaps(eventId);
    if (error) toast.error(error);
    setRequests(data.requests);
    setClaims(data.claims);
  };

  useEffect(() => { load(); }, [eventId]);

  const live = requests.filter((r) => ['open', 'offered'].includes(r.status) && !r.company_decision);
  if (live.length === 0) return null;

  const acceptedClaimFor = (r: SwapRequest) => claims.find((c) => c.id === r.accepted_claim_id);
  const pendingCount = (r: SwapRequest) => claims.filter((c) => c.swap_request_id === r.id && c.status === 'pending').length;

  const decide = async (swap: SwapRequest, approve: boolean, why?: string) => {
    setBusy(swap.id);
    const { error } = await companyDecideSwap(swap.id, approve, why);
    setBusy(null);
    if (error) return toast.error(error);
    toast.success(approve ? 'Swap approved — claimer notified to confirm' : 'Swap rejected — claims released');
    setRejecting(null);
    setReason('');
    load();
  };

  return (
    <>
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold flex items-center gap-2">
              <Repeat2 className="w-4 h-4" /> Shift swaps awaiting you ({live.length})
            </h2>
            <p className="text-xs text-muted-foreground">Approve to endorse, reject to release the claim</p>
          </div>
          {live.map((r) => {
            const claim = acceptedClaimFor(r);
            const waiting = pendingCount(r);
            return (
              <div key={r.id} className="flex items-center justify-between gap-3 text-sm border-t first:border-0 pt-3 first:pt-0">
                <div className="min-w-0">
                  <p className="font-medium truncate">
                    {r.requester?.full_name ?? 'Crew'} → {(r as { shift?: { title?: string } }).shift?.title ?? 'call'}
                    {r.sweetener_cents > 0 && <span className="text-emerald-600 dark:text-emerald-400"> +{money(r.sweetener_cents / 100)} sweetener</span>}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {claim
                      ? `${claim.claimer?.full_name ?? 'Claimer'} has the offer — awaiting their confirm`
                      : waiting > 0
                        ? `${waiting} claim${waiting === 1 ? '' : 's'} pending — requester picks`
                        : 'No claims yet'}
                    {r.reason ? ` · "${r.reason}"` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge variant="secondary">{r.status}</Badge>
                  <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => decide(r, true)}>
                    <Check className="w-3.5 h-3.5 mr-1" /> Approve
                  </Button>
                  <Button size="sm" variant="outline" className="text-destructive" disabled={busy !== null} onClick={() => setRejecting(r)}>
                    <X className="w-3.5 h-3.5 mr-1" /> Reject
                  </Button>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Dialog open={rejecting !== null} onOpenChange={(o) => !o && setRejecting(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Reject this swap?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            Live claims are released and any pending offer is pulled. The requester stays on the call.
          </p>
          <Textarea
            placeholder="Reason (optional — shown to both workers)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setRejecting(null)}>Keep swap</Button>
            <Button variant="destructive" disabled={busy !== null} onClick={() => rejecting && decide(rejecting, false, reason)}>
              Reject swap
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
