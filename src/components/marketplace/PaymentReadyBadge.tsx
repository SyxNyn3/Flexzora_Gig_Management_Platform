import React from 'react';
import { Badge } from '@/components/ui/badge';
import { PayoutReadiness } from '@/lib/types';
import { Banknote, Clock, FileWarning, HelpCircle } from 'lucide-react';

interface Props {
  readiness?: PayoutReadiness | null;
  size?: 'sm' | 'md';
}

// "Ready to pay" requires BOTH sides of the payout path: Stripe Connect
// payouts enabled AND an approved W-9 (the hold claim_payout_for_release
// enforces). A worker with payouts enabled but no approved W-9 still shows
// the W-9 badge — their pay will be held at release.
const state = (r: PayoutReadiness) => {
  if (r.w9_status !== 'approved') {
    return { label: 'W-9 needed', cls: 'bg-red-500/15 text-destructive dark:text-red-400 border-red-500/30', Icon: FileWarning };
  }
  if (r.payouts_enabled) {
    return { label: 'Ready to pay', cls: 'bg-green-500/15 text-emerald-500 dark:text-emerald-400 border-green-500/30', Icon: Banknote };
  }
  return { label: 'Payout setup in progress', cls: 'bg-amber-500/10 text-amber-800 border-amber-500/30', Icon: Clock };
};

const PaymentReadyBadge: React.FC<Props> = ({ readiness, size = 'md' }) => {
  const cls = size === 'sm' ? 'text-[11px] px-2' : '';
  // No row means the RPC omitted this worker (no company relationship) or the
  // fetch hasn't landed — render muted rather than guessing at their state.
  if (!readiness) {
    return (
      <Badge variant="outline" className={`bg-muted text-muted-foreground border-border ${cls}`}>
        <HelpCircle className="w-3 h-3 mr-1" />
        Payout unknown
      </Badge>
    );
  }
  const s = state(readiness);
  return (
    <Badge variant="outline" className={`${s.cls} ${cls}`} title={readiness.w9_status !== 'approved' ? 'Review tax documents under Credential review → Tax & eligibility' : undefined}>
      <s.Icon className="w-3 h-3 mr-1" />
      {s.label}
    </Badge>
  );
};

export default PaymentReadyBadge;
