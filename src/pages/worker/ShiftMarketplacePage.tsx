import React, { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/contexts/AuthContext';
import { useMarketplaceShifts, useWorkerAssignments } from '@/hooks/useMarketplace';
import { MarketplaceService } from '@/lib/marketplace/service';
import { MatchResult } from '@/lib/marketplace/matchScore';
import { projectedShiftCost } from '@/lib/marketplace/overtime';
import { Shift, ShiftAssignment } from '@/lib/types';
import MatchScoreBadge from '@/components/marketplace/MatchScoreBadge';
import ClockCard from '@/components/marketplace/worker/ClockCard';
import { hoursBetween, money, shiftWindow } from '@/components/marketplace/format';
import { Building2, MapPin, Search, Star, Check, X, Zap } from 'lucide-react';

const ShiftMarketplacePage: React.FC = () => {
  const { profile } = useAuth();
  const shifts = useMarketplaceShifts(profile?.id);
  const assignments = useWorkerAssignments(profile?.id);
  const [scores, setScores] = useState<Map<string, MatchResult>>(new Map());
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!profile?.id || shifts.data.length === 0) return;
    MarketplaceService.scoreShiftsForWorker(profile.id, shifts.data).then(({ data }) => setScores(data));
  }, [profile?.id, shifts.data]);

  const appliedShiftIds = useMemo(() => new Set(assignments.data.filter((a) => !['declined', 'rejected', 'withdrawn'].includes(a.status)).map((a) => a.shift_id)), [assignments.data]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return shifts.data
      .filter((s) => !q || [s.title, s.role_name, s.event?.name, s.event?.company?.name, s.event?.venue?.city].some((v) => v?.toLowerCase().includes(q)))
      .map((s) => ({ shift: s, match: scores.get(s.id) }))
      .filter((x) => !x.match || x.match.breakdown.gatekeeperPassed)
      .sort((a, b) => (b.match?.score ?? 0) - (a.match?.score ?? 0) || a.shift.starts_at.localeCompare(b.shift.starts_at));
  }, [shifts.data, scores, search]);

  const offers = assignments.data.filter((a) => a.status === 'offered');
  const bookings = assignments.data
    .filter((a) => a.status === 'confirmed' || (a.status === 'completed' && a.timesheet && a.timesheet.status !== 'paid'))
    .sort((a, b) => (a.shift?.starts_at ?? '').localeCompare(b.shift?.starts_at ?? ''));
  const pending = assignments.data.filter((a) => a.status === 'applied');

  const act = async (key: string, fn: () => Promise<{ error: string | null }>, ok: string) => {
    setBusy(key);
    const { error } = await fn();
    setBusy(null);
    if (error) return toast.error(error);
    toast.success(ok);
    assignments.refetch();
    shifts.refetch();
  };

  const apply = (shift: Shift) => profile && act(shift.id, () => MarketplaceService.applyToShift(shift, profile.id, scores.get(shift.id)), 'Application sent');
  const respond = (a: ShiftAssignment, r: 'confirmed' | 'declined') =>
    act(a.id, () => MarketplaceService.respondToOffer(a.id, r), r === 'confirmed' ? 'Booked! Added to your schedule' : 'Offer declined');

  const ShiftRow: React.FC<{ shift: Shift; match?: MatchResult; action?: React.ReactNode }> = ({ shift, match, action }) => {
    const est = projectedShiftCost(shift.starts_at, shift.ends_at, Number(shift.hourly_rate), 1);
    return (
      <Card>
        <CardContent className="p-4 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-semibold">{shift.title}</p>
              <Badge variant="secondary">{shift.role_name}</Badge>
              {shift.broadcast_stage === 'roster' && (
                <Badge variant="outline" className="border-amber-300 text-amber-800"><Star className="w-3 h-3 mr-1" /> Roster early access</Badge>
              )}
              {match && <MatchScoreBadge score={match.score} breakdown={match.breakdown} reasons={match.reasons} size="sm" />}
            </div>
            <p className="text-sm text-muted-foreground mt-1 inline-flex items-center gap-1">
              <Building2 className="w-3.5 h-3.5" /> {shift.event?.company?.name} · {shift.event?.name}
            </p>
            <p className="text-sm text-muted-foreground">{shiftWindow(shift.starts_at, shift.ends_at)} · {hoursBetween(shift.starts_at, shift.ends_at)} h</p>
            {shift.event?.venue && (
              <p className="text-xs text-muted-foreground inline-flex items-center gap-1">
                <MapPin className="w-3 h-3" /> {shift.event.venue.name}{shift.event.venue.city ? `, ${shift.event.venue.city}` : ''}
                {match?.breakdown.distanceKm != null && ` · ${match.breakdown.distanceKm} km away`}
              </p>
            )}
            {shift.required_cert_codes.length > 0 && (
              <div className="flex gap-1 mt-1">
                {shift.required_cert_codes.map((c) => <Badge key={c} variant="outline" className="text-[10px]">{c.replace(/_/g, ' ')}</Badge>)}
              </div>
            )}
          </div>
          <div className="text-right">
            <p className="text-lg font-semibold">${Number(shift.hourly_rate).toFixed(2)}<span className="text-xs text-muted-foreground">/hr</span></p>
            <p className="text-xs text-muted-foreground">≈ {money(est)} incl. OT</p>
            <div className="mt-2">{action}</div>
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Shifts</h1>
        <p className="text-sm text-muted-foreground">Calls ranked by your match score. Only shifts you're credentialed for are shown.</p>
      </div>

      <Tabs defaultValue={offers.length ? 'offers' : 'market'}>
        <TabsList>
          <TabsTrigger value="market">Marketplace ({visible.length})</TabsTrigger>
          <TabsTrigger value="offers">
            Direct offers ({offers.length}) {offers.length > 0 && <Zap className="w-3 h-3 ml-1 text-amber-500" />}
          </TabsTrigger>
          <TabsTrigger value="bookings">My bookings ({bookings.length})</TabsTrigger>
          <TabsTrigger value="pending">Applied ({pending.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="market" className="space-y-3 mt-4">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-muted-foreground/70" />
            <Input className="pl-9" placeholder="Search by role, company, venue or city" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          {shifts.loading && [0, 1, 2].map((i) => <Skeleton key={i} className="h-28 w-full" />)}
          {!shifts.loading && visible.length === 0 && <p className="text-center text-muted-foreground py-10 text-sm">No open calls match right now. Add certifications and skills to your profile to unlock more.</p>}
          {visible.map(({ shift, match }) => (
            <ShiftRow
              key={shift.id}
              shift={shift}
              match={match}
              action={
                <Button size="sm" disabled={busy !== null || appliedShiftIds.has(shift.id) || (match && !match.breakdown.gatekeeperPassed)} onClick={() => apply(shift)}>
                  {appliedShiftIds.has(shift.id) ? 'Applied' : 'Apply'}
                </Button>
              }
            />
          ))}
        </TabsContent>

        <TabsContent value="offers" className="space-y-3 mt-4">
          {offers.length === 0 && <p className="text-center text-muted-foreground py-10 text-sm">No direct-book offers waiting. Companies send these to their trusted roster first.</p>}
          {offers.map((a) =>
            a.shift ? (
              <ShiftRow
                key={a.id}
                shift={a.shift}
                match={a.match_score != null && a.match_breakdown ? { workerId: a.worker_id, shiftId: a.shift_id, score: Number(a.match_score), breakdown: a.match_breakdown, reasons: [] } : undefined}
                action={
                  <div className="flex gap-1 justify-end">
                    <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => respond(a, 'declined')}><X className="w-3.5 h-3.5" /></Button>
                    <Button size="sm" disabled={busy !== null} onClick={() => respond(a, 'confirmed')}><Check className="w-3.5 h-3.5 mr-1" /> Accept</Button>
                  </div>
                }
              />
            ) : null,
          )}
        </TabsContent>

        <TabsContent value="bookings" className="space-y-3 mt-4">
          {bookings.length === 0 && <p className="text-center text-muted-foreground py-10 text-sm">No confirmed bookings yet.</p>}
          {bookings.map((a) => <ClockCard key={a.id} assignment={a} onChanged={() => assignments.refetch()} />)}
        </TabsContent>

        <TabsContent value="pending" className="space-y-3 mt-4">
          {pending.length === 0 && <p className="text-center text-muted-foreground py-10 text-sm">No pending applications.</p>}
          {pending.map((a) =>
            a.shift ? (
              <ShiftRow
                key={a.id}
                shift={a.shift}
                action={
                  <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => act(a.id, () => MarketplaceService.respondToOffer(a.id, 'withdrawn'), 'Application withdrawn')}>
                    Withdraw
                  </Button>
                }
              />
            ) : null,
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default ShiftMarketplacePage;
