import React, { useEffect, useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { useAuth } from '@/contexts/AuthContext';
import { useCrewBoard, useShift } from '@/hooks/useCrew';
import { useWorkerAssignments } from '@/hooks/useMarketplace';
import { joinRide, withdrawRideRequest, cancelRideOffer, postRideOffer, setRideFlags, listRideBuddies, fetchMyLastOfferParams } from '@/lib/crew/rides';
import { joinPool, leavePool, cancelLodgingPool, postLodgingPool } from '@/lib/crew/lodging';
import { placeOrder, cancelOrder, confirmOrder, acceptFoodPrice, rejectFoodPrice, acceptOrderPrice, postFoodRun, updateFoodRunStatus, isAcceptingOrders, offerRunHandoff, acceptRunHandoff, declineRunHandoff } from '@/lib/crew/food';
import { postToBoard, resolvePost, closePost, acceptPostDebt, acceptFulfilment, declineFulfilment } from '@/lib/crew/board';
import { iouCapacity, bailKeptCents, DEFAULT_BAIL_POLICY } from '@/lib/crew/iouMath';
import { fetchBailPolicy } from '@/lib/crew/iou';
import { listCrewDistances } from '@/lib/crew/distance';
import { markAllAlertsRead, myAlertPreferences, setAlertPreference } from '@/lib/crew/alerts';
import { postSwapRequest, cancelSwapRequest, claimSwap, withdrawClaim, acceptClaim, rejectClaim, myLockedSwaps } from '@/lib/crew/swap';
import { hasPushSubscription, pushSupported, subscribeToPush, unsubscribeFromPush } from '@/lib/push';
import { hoursBetween, money, shiftWindow, toLocalInputValue } from '@/components/marketplace/format';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Car, BedDouble, UtensilsCrossed, MessageSquare, ArrowLeft, Plus, X, Check,
  MapPin, Clock, Users, Wallet, HandHelping, CircleAlert, BellRing, Backpack, Navigation, ParkingSquare,
  Repeat2, Settings2,
} from 'lucide-react';
import { AlertPreference, CrewAlertKind, CrewDistance, CrewPostCategory, CrewPostDirection, LastRideOfferParams, LockedSwap, RideBuddy, Shift } from '@/lib/types';
import type { BailPolicy } from '@/lib/crew/iouMath';

const cents = (v: string): number | null => {
  const n = parseFloat(v);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
};

const fmt = (iso?: string | null) => (iso ? format(new Date(iso), 'MMM d · HH:mm') : '—');

/** "Pin this spot" — captures device geo for distance-ranked suggestions. */
const useGeoPin = () => {
  const [pin, setPin] = useState<{ lat: number; lng: number } | null>(null);
  const grab = () => {
    if (!('geolocation' in navigator)) return toast.error('Location unavailable on this device');
    navigator.geolocation.getCurrentPosition(
      (pos) => setPin({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => toast.error('Could not get your location'),
    );
  };
  return { pin, setPin, grab };
};

const GeoPinButton: React.FC<{ pin: { lat: number; lng: number } | null; onPin: () => void; onClear: () => void }> = ({ pin, onPin, onClear }) =>
  pin ? (
    <Button type="button" size="sm" variant="secondary" className="w-full" onClick={onClear}>
      <MapPin className="w-3.5 h-3.5 mr-1" /> Spot pinned — tap to clear
    </Button>
  ) : (
    <Button type="button" size="sm" variant="outline" className="w-full" onClick={onPin}>
      <MapPin className="w-3.5 h-3.5 mr-1" /> Pin this spot (helps crew find it)
    </Button>
  );

/** Small collapsible "post something" form used by every tab. */
const MiniForm: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <Button variant="outline" size="sm" className="w-full" onClick={() => setOpen((o) => !o)}>
        <Plus className="w-4 h-4 mr-1" /> {label}
      </Button>
      {open && <Card className="mt-2"><CardContent className="p-3 space-y-2">{children}</CardContent></Card>}
    </div>
  );
};

const CrewBoardPage: React.FC = () => {
  const { shiftId } = useParams<{ shiftId: string }>();
  const { profile } = useAuth();
  const shiftQ = useShift(shiftId);
  const board = useCrewBoard(shiftId);
  const assignments = useWorkerAssignments(profile?.id);
  const [busy, setBusy] = useState<string | null>(null);
  const [pushOn, setPushOn] = useState<boolean | null>(null);
  const [buddies, setBuddies] = useState<RideBuddy[]>([]);
  const [lastOffer, setLastOffer] = useState<LastRideOfferParams | null>(null);
  const [buddyTick, setBuddyTick] = useState(0);
  const [bailPolicy, setBailPolicy] = useState<BailPolicy>(DEFAULT_BAIL_POLICY);
  const [distances, setDistances] = useState<CrewDistance[]>([]);
  const [alertPrefs, setAlertPrefs] = useState<AlertPreference[]>([]);
  const [lockedSwaps, setLockedSwaps] = useState<LockedSwap[]>([]);

  useEffect(() => {
    hasPushSubscription().then(setPushOn);
    fetchBailPolicy().then(({ data }) => setBailPolicy(data));
    myAlertPreferences().then(({ data }) => setAlertPrefs(data));
  }, []);

  useEffect(() => {
    if (!shiftId) return;
    listRideBuddies(shiftId).then(({ data }) => setBuddies(data));
    fetchMyLastOfferParams().then(({ data }) => setLastOffer(data));
    listCrewDistances(shiftId).then(({ data }) => setDistances(data));
    myLockedSwaps(shiftId).then(({ data }) => setLockedSwaps(data));
  }, [shiftId, buddyTick]);

  const shift = shiftQ.data ?? undefined;
  const myAssignment = useMemo(
    () => assignments.data.find((a) => a.shift_id === shiftId && ['confirmed', 'applied', 'offered'].includes(a.status)),
    [assignments.data, shiftId],
  );
  const myIous = useMemo(
    () => board.data.ious.filter((i) => i.worker_id === profile?.id && i.status === 'committed'),
    [board.data.ious, profile?.id],
  );
  const distById = useMemo(() => new Map(distances.map((d) => [d.ref_id, d])), [distances]);
  const closestBunkId = useMemo(() => {
    const bunks = distances.filter((d) => d.kind === 'lodging');
    return bunks.length ? bunks.reduce((a, b) => (a.km <= b.km ? a : b)).ref_id : null;
  }, [distances]);
  const sortedOffers = useMemo(() => {
    const pinned = board.data.offers.filter((o) => distById.has(o.id));
    const rest = board.data.offers.filter((o) => !distById.has(o.id));
    pinned.sort((a, b) => (distById.get(a.id)?.detour_km ?? 0) - (distById.get(b.id)?.detour_km ?? 0));
    return [...pinned, ...rest];
  }, [board.data.offers, distById]);

  // "Committed vs. cap" preview: estimates gross from the posted rate × call
  // length. The real cap applies to approved gross inside approve_timesheet.
  const capacity = useMemo(() => {
    if (!shift) return null;
    const estGrossCents = Math.round(Number(shift.hourly_rate) * hoursBetween(shift.starts_at, shift.ends_at) * 100);
    return iouCapacity(myIous, estGrossCents);
  }, [shift, myIous]);

  // Crew roster for the "who fulfilled it?" picker — anyone visible on boards.
  const crewRoster = useMemo(() => {
    const m = new Map<string, string>();
    board.data.offers.forEach((o) => o.driver?.full_name && m.set(o.driver_worker_id, o.driver.full_name));
    board.data.requests.forEach((r) => r.rider?.full_name && m.set(r.rider_worker_id, r.rider.full_name));
    board.data.pools.forEach((p) => p.host?.full_name && m.set(p.host_worker_id, p.host.full_name));
    board.data.members.forEach((x) => x.worker?.full_name && m.set(x.worker_id, x.worker.full_name));
    board.data.runs.forEach((r) => r.runner?.full_name && m.set(r.runner_worker_id, r.runner.full_name));
    board.data.orders.forEach((o) => o.worker?.full_name && m.set(o.worker_id, o.worker.full_name));
    m.delete(profile?.id ?? '');
    return Array.from(m.entries());
  }, [board.data, profile?.id]);

  const act = async (key: string, fn: () => Promise<{ error: string | null; data?: unknown }>, okMsg: string | ((data: unknown) => string)) => {
    setBusy(key);
    const r = await fn();
    setBusy(null);
    if (r.error) return toast.error(r.error);
    toast.success(typeof okMsg === 'function' ? okMsg(r.data) : okMsg);
    board.refetch();
    assignments.refetch();
    setBuddyTick((t) => t + 1);
  };

  const unreadAlerts = board.data.alerts.filter((a) => !a.read_at);
  const myRequest = board.data.requests.find((r) => r.rider_worker_id === profile?.id && r.status !== 'withdrawn' && r.status !== 'cancelled');
  const myMembershipByPool = new Map(board.data.members.filter((m) => m.worker_id === profile?.id && m.status === 'joined').map((m) => [m.pool_id, m]));
  const myOrderByRun = new Map(board.data.orders.filter((o) => o.worker_id === profile?.id && o.status !== 'cancelled').map((o) => [o.run_id, o]));

  if (shiftQ.loading) return <div className="max-w-3xl mx-auto p-4 space-y-3"><Skeleton className="h-16 w-full" /><Skeleton className="h-40 w-full" /></div>;
  if (!shift) return <div className="max-w-3xl mx-auto p-6 text-center text-muted-foreground">Shift not found.</div>;

  const venue = shift.event?.venue;

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-4 pb-24">
      <Link to="/shifts" className="text-sm text-muted-foreground inline-flex items-center gap-1"><ArrowLeft className="w-3.5 h-3.5" /> Shifts</Link>

      {/* Shift header + commitments strip */}
      <div>
        <h1 className="text-xl font-bold">{shift.title}</h1>
        <p className="text-sm text-muted-foreground">{shift.event?.company?.name} · {shift.event?.name}</p>
        <p className="text-sm text-muted-foreground">{shiftWindow(shift.starts_at, shift.ends_at)} · ${Number(shift.hourly_rate).toFixed(2)}/hr</p>
        {venue && (
          <p className="text-xs text-muted-foreground inline-flex items-center gap-1">
            <MapPin className="w-3 h-3" /> {venue.name}{venue.city ? `, ${venue.city}` : ''}
            {venue.overnight_parking && ' · Overnight parking'}
            {venue.camping_allowed && ' · Camping OK'}
          </p>
        )}
        {venue?.parking_notes && <p className="text-xs text-muted-foreground mt-1 bg-muted rounded p-2">{venue.parking_notes}</p>}
      </div>

      {capacity && (
        <Card>
          <CardContent className="p-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm">
              <Wallet className="w-4 h-4 text-muted-foreground" />
              <span className="font-medium">Your shares</span>
              <span className="text-muted-foreground">
                {money(capacity.committedCents / 100)} committed of {money(capacity.capCents / 100)} cap
              </span>
            </div>
            <Badge variant={capacity.remainingCents > 0 ? 'secondary' : 'destructive'}>
              {capacity.remainingCents > 0 ? `${money(capacity.remainingCents / 100)} room` : 'Cap reached'}
            </Badge>
          </CardContent>
        </Card>
      )}

      {board.data.alerts.length > 0 && (
        <Card>
          <CardContent className="p-3 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium inline-flex items-center gap-1.5">
                <BellRing className="w-4 h-4" /> Briefing
                {unreadAlerts.length > 0 && <Badge variant="destructive">{unreadAlerts.length} new</Badge>}
              </p>
              <div className="flex items-center gap-2">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-7 text-xs" title="Per-kind push and SMS preferences">
                      <Settings2 className="w-3.5 h-3.5" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-72" align="end">
                    <p className="text-sm font-medium mb-1">Alert settings</p>
                    <p className="text-xs text-muted-foreground mb-3">Push pings this device instantly; SMS digest texts a rollup (needs a phone on your profile).</p>
                    <div className="space-y-2">
                      {(['gear', 'parking', 'departure', 'pool', 'iou', 'ride_buddy', 'custom'] as CrewAlertKind[]).map((kind) => {
                        const pref = alertPrefs.find((p) => p.kind === kind);
                        const push = pref?.push ?? true;
                        const sms = pref?.sms ?? false;
                        const update = async (patch: { push?: boolean; sms?: boolean }) => {
                          const r = await setAlertPreference(kind, patch);
                          if (r.error) return toast.error(r.error);
                          setAlertPrefs((prev) => {
                            const next = prev.filter((p) => p.kind !== kind);
                            next.push({ worker_id: pref?.worker_id ?? '', kind, push: patch.push ?? push, sms: patch.sms ?? sms, updated_at: '' });
                            return next;
                          });
                        };
                        return (
                          <div key={kind} className="flex items-center justify-between gap-2 text-sm">
                            <span className="capitalize">{kind === 'iou' ? 'IOUs' : kind === 'ride_buddy' ? 'Ride buddies' : kind}</span>
                            <span className="flex items-center gap-3 text-xs text-muted-foreground">
                              <label className="flex items-center gap-1">Push<Switch className="scale-75" checked={push} onCheckedChange={(v) => update({ push: v })} /></label>
                              <label className="flex items-center gap-1">SMS<Switch className="scale-75" checked={sms} onCheckedChange={(v) => update({ sms: v })} /></label>
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </PopoverContent>
                </Popover>
                {pushSupported() && pushOn !== null && (
                  <Button variant="ghost" size="sm" className="h-7 text-xs" disabled={busy !== null}
                    onClick={async () => {
                      const r = pushOn ? await unsubscribeFromPush() : await subscribeToPush();
                      if (!r.ok) return toast.error(r.error ?? 'Push setup failed');
                      setPushOn(!pushOn);
                      toast.success(pushOn ? 'Device alerts off' : 'Alerts on for this device');
                    }}>
                    {pushOn ? 'Device alerts on' : 'Alert this device'}
                  </Button>
                )}
                {unreadAlerts.length > 0 && (
                  <Button variant="ghost" size="sm" className="h-7 text-xs" disabled={busy !== null}
                    onClick={() => act('read', () => markAllAlertsRead(), 'Marked read')}>
                    Mark all read
                  </Button>
                )}
              </div>
            </div>
            {board.data.alerts.map((a) => (
              <div key={a.id} className={`text-sm rounded p-2 ${a.read_at ? 'text-muted-foreground' : 'bg-muted'}`}>
                <p className="font-medium inline-flex items-center gap-1.5">
                  {a.kind === 'gear' && <Backpack className="w-3.5 h-3.5" />}
                  {a.kind === 'parking' && <ParkingSquare className="w-3.5 h-3.5" />}
                  {a.kind === 'departure' && <Navigation className="w-3.5 h-3.5" />}
                  {a.kind === 'ride_buddy' && <Car className="w-3.5 h-3.5" />}
                  {!['gear', 'parking', 'departure', 'ride_buddy'].includes(a.kind) && <CircleAlert className="w-3.5 h-3.5" />}
                  {a.title}
                </p>
                <p className="text-xs whitespace-pre-line mt-0.5">{a.body}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {myAssignment && (
        <Card>
          <CardContent className="p-3 flex items-center justify-between gap-3 text-sm">
            <span className="font-medium inline-flex items-center gap-2"><Car className="w-4 h-4" /> Getting there</span>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                Need a ride
                <Switch
                  checked={myAssignment.needs_ride}
                  onCheckedChange={(v) => act('flags', () => setRideFlags(myAssignment.id, { needs_ride: v }), 'Flag updated')}
                />
              </label>
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                Can drive
                <Switch
                  checked={myAssignment.can_drive}
                  onCheckedChange={(v) => act('flags', () => setRideFlags(myAssignment.id, { can_drive: v }), 'Flag updated')}
                />
              </label>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Shift swaps — hand the whole call to a credentialed crewmate */}
      {(myAssignment?.status === 'confirmed' || board.data.swaps.length > 0 || lockedSwaps.length > 0) && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <p className="text-sm font-medium inline-flex items-center gap-2"><Repeat2 className="w-4 h-4" /> Shift swap</p>
            {board.data.swaps.filter((s) => s.status !== 'cancelled').map((s) => {
              const mine = s.requester_worker_id === profile?.id;
              const myClaim = board.data.swapClaims.find((c) => c.swap_request_id === s.id && c.claimer_worker_id === profile?.id);
              const pendingClaims = board.data.swapClaims.filter((c) => c.swap_request_id === s.id && c.status === 'pending');
              return (
                <div key={s.id} className="text-sm border-t first:border-0 pt-2 first:pt-0 space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium">
                        {s.requester?.full_name ?? 'A crew member'} can't make it
                        {s.sweetener_cents > 0 && <Badge variant="secondary" className="ml-2">+{money(s.sweetener_cents / 100)}</Badge>}
                        <Badge variant="outline" className="ml-2">{s.status}</Badge>
                      </p>
                      {s.reason && <p className="text-xs text-muted-foreground mt-0.5">{s.reason}</p>}
                    </div>
                    <div className="shrink-0">
                      {mine && s.status === 'open' && (
                        <Button size="sm" variant="outline" disabled={busy !== null}
                          onClick={() => act(s.id, () => cancelSwapRequest(s.id), 'Swap request cancelled')}>
                          Cancel
                        </Button>
                      )}
                      {!mine && s.status === 'open' && !myClaim && (
                        <ClaimSwapButton busy={busy} onClaim={(msg) => act(s.id, () => claimSwap(s.id, msg), 'Claim in — requester decides')} />
                      )}
                      {myClaim?.status === 'pending' && (
                        <Button size="sm" variant="outline" disabled={busy !== null}
                          onClick={() => act(myClaim.id, () => withdrawClaim(myClaim.id), 'Claim withdrawn')}>
                          Withdraw
                        </Button>
                      )}
                      {myClaim?.status === 'accepted' && <Badge>Offer sent — check your offers</Badge>}
                    </div>
                  </div>
                  {mine && pendingClaims.length > 0 && (
                    <div className="text-xs space-y-1.5">
                      <p className="text-muted-foreground font-medium">Claims</p>
                      {pendingClaims.map((c) => (
                        <div key={c.id} className="flex items-center justify-between gap-2">
                          <span>{c.claimer?.full_name ?? '—'}{c.message ? ` — “${c.message}”` : ''}</span>
                          <span className="flex gap-1">
                            <Button size="sm" className="h-7" disabled={busy !== null}
                              onClick={() => act(c.id, () => acceptClaim(c.id), 'Claim accepted — offer sent for approval')}>
                              <Check className="w-3 h-3" />
                            </Button>
                            <Button size="sm" variant="outline" className="h-7" disabled={busy !== null}
                              onClick={() => act(c.id, () => rejectClaim(c.id), 'Claim rejected')}>
                              <X className="w-3 h-3" />
                            </Button>
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                  {mine && s.status === 'offered' && (
                    <p className="text-xs text-muted-foreground">Replacement is holding an offer — once they accept and the booking confirms, you're released.</p>
                  )}
                </div>
              );
            })}
            {lockedSwaps.map((l) => (
              <div key={l.swap_id} className="text-sm rounded p-2 border border-dashed border-muted-foreground/40">
                <p className="font-medium inline-flex items-center gap-1.5 text-muted-foreground">
                  <Repeat2 className="w-3.5 h-3.5" /> Swap available
                  {l.sweetener_cents > 0 && <span className="text-emerald-600 dark:text-emerald-400">+{money(l.sweetener_cents / 100)} sweetener</span>}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  You're one credential short of claiming it:{' '}
                  {l.missing.map((m, i) => (
                    <span key={m.code}>
                      {i > 0 && ', '}
                      <Link to="/profile" className="font-medium text-primary underline underline-offset-2">{m.name}</Link>
                    </span>
                  ))}
                  {l.missing.some((m) => m.state === 'pending') && ' — one is already in review'}
                </p>
              </div>
            ))}
            {myAssignment?.status === 'confirmed' && !board.data.swaps.some((s) => s.requester_worker_id === profile?.id && s.status !== 'cancelled') && (
              <SwapForm busy={busy} onSubmit={(reason, sweetener) =>
                act('swap', () => postSwapRequest({ assignmentId: myAssignment.id, shiftId: shift.id, reason, sweetenerCents: sweetener }), 'Swap posted — cert-eligible crew can claim')} />
            )}
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="rides">
        <TabsList className="w-full grid grid-cols-4">
          <TabsTrigger value="rides"><Car className="w-4 h-4 mr-1" />Rides ({board.data.offers.length})</TabsTrigger>
          <TabsTrigger value="lodging"><BedDouble className="w-4 h-4 mr-1" />Bunks ({board.data.pools.length})</TabsTrigger>
          <TabsTrigger value="food"><UtensilsCrossed className="w-4 h-4 mr-1" />Grub ({board.data.runs.length})</TabsTrigger>
          <TabsTrigger value="board"><MessageSquare className="w-4 h-4 mr-1" />Board ({board.data.posts.length})</TabsTrigger>
        </TabsList>

        {/* ----------------------------- RIDES ----------------------------- */}
        <TabsContent value="rides" className="space-y-3 mt-4">
          {buddies.some((b) => b.buddy_confirmed) && (
            <Card>
              <CardContent className="p-4 space-y-2">
                <p className="text-sm font-semibold flex items-center gap-1.5">
                  <Car className="w-4 h-4" /> Same car as last time?
                </p>
                {buddies.filter((b) => b.buddy_confirmed).map((b) => (
                  <div key={b.buddy_worker_id} className="flex items-center justify-between gap-3 text-sm">
                    <p className="min-w-0 truncate">
                      <span className="font-medium">{b.buddy_name}</span>
                      <span className="text-muted-foreground">
                        {' '}— {b.i_drove_last ? 'rode with you' : 'drove you'} {b.rides_together === 1 ? 'once' : `${b.rides_together}×`}
                        {!b.buddy_offer_id && ' · on this call, no seats posted yet'}
                      </span>
                    </p>
                    {b.buddy_offer_id && (
                      <Button size="sm" disabled={busy !== null || !!myRequest}
                        title={myRequest ? 'You already have a ride request' : undefined}
                        onClick={() => act(b.buddy_worker_id, () => joinRide(b.buddy_offer_id!, { shiftId: shiftId! }), `Riding with ${b.buddy_name} again`)}>
                        Ride with {b.buddy_name.split(' ')[0] ?? b.buddy_name}
                      </Button>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
          {board.data.offers.length === 0 && board.data.requests.length === 0 && (
            <p className="text-center text-muted-foreground py-8 text-sm">No rides yet — post the first one.</p>
          )}
          {sortedOffers.map((o) => {
            const matched = myRequest?.offer_id === o.id && myRequest.status === 'matched';
            const mine = o.driver_worker_id === profile?.id;
            const full = o.seats_taken >= o.seats;
            const dist = distById.get(o.id);
            return (
              <Card key={o.id}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold">{o.driver?.full_name ?? 'Crew driver'}</p>
                        <Badge variant={full ? 'secondary' : 'outline'}>{o.seats_taken}/{o.seats} seats</Badge>
                        {o.gas_share_cents > 0 && <Badge variant="secondary">{money(o.gas_share_cents / 100)}/seat</Badge>}
                        {dist?.detour_km != null && (
                          <Badge variant={dist.detour_km <= 3 ? 'default' : 'outline'}>
                            {dist.detour_km <= 3 ? 'On your way' : `+${dist.detour_km} km detour`} · {dist.km} km away
                          </Badge>
                        )}
                        {matched && <Badge>You're in</Badge>}
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        {o.departure_area ?? 'TBD'} {o.departure_at ? `· leaves ${fmt(o.departure_at)}` : ''}
                      </p>
                      {o.notes && <p className="text-xs text-muted-foreground mt-1 bg-muted rounded p-2">{o.notes}</p>}
                      {matched && shift && o.gas_share_cents > 0 && bailKeptCents(shift.starts_at, o.gas_share_cents * (myRequest?.seats_needed ?? 1), bailPolicy) > 0 && (
                        <p className="text-xs text-amber-600 mt-1">
                          Inside the {bailPolicy.windowHours}h bail window — leaving keeps {money(bailKeptCents(shift.starts_at, o.gas_share_cents * (myRequest?.seats_needed ?? 1), bailPolicy) / 100)} of your share committed.
                        </p>
                      )}
                    </div>
                    <div className="shrink-0">
                      {mine ? (
                        o.status !== 'cancelled' && (
                          <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => act(o.id, () => cancelRideOffer(o.id), 'Ride cancelled — riders notified')}>
                            Cancel
                          </Button>
                        )
                      ) : matched ? (
                        <Button size="sm" variant="outline" disabled={busy !== null}
                          onClick={() => act(o.id, () => withdrawRideRequest(myRequest!.id),
                            shift && bailKeptCents(shift.starts_at, o.gas_share_cents * (myRequest?.seats_needed ?? 1), bailPolicy) > 0
                              ? 'Seat released — partial share stays committed'
                              : 'Seat released')}>
                          Bail out
                        </Button>
                      ) : o.status === 'open' && !full && (
                        <Button size="sm" disabled={busy !== null || !!myRequest} title={myRequest ? 'You already have a ride request' : undefined}
                          onClick={() => act(o.id, () => joinRide(o.id, { shiftId: o.shift_id }), o.gas_share_cents > 0 ? `Seat taken — ${money(o.gas_share_cents / 100)} gas share committed` : 'Seat taken')}>
                          Join
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
          {board.data.requests.filter((r) => r.status === 'open').length > 0 && (
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Users className="w-3 h-3" />
              Still need a ride: {board.data.requests.filter((r) => r.status === 'open').map((r) => r.rider?.full_name ?? 'Someone').join(', ')}
            </p>
          )}
          {myRequest?.status === 'open' && (
            <Card>
              <CardContent className="p-3 flex items-center justify-between gap-3">
                <p className="text-sm">Your request is posted — waiting for a driver.</p>
                <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => act('req', () => withdrawRideRequest(myRequest.id), 'Request withdrawn')}>
                  Withdraw
                </Button>
              </CardContent>
            </Card>
          )}
          <RideOfferForm shift={shift} busy={busy} initial={lastOffer} onSubmit={(input) => act('post-offer', () => postRideOffer(input), 'Ride posted')} />
        </TabsContent>

        {/* ---------------------------- LODGING ---------------------------- */}
        <TabsContent value="lodging" className="space-y-3 mt-4">
          {board.data.pools.length === 0 && <p className="text-center text-muted-foreground py-8 text-sm">No lodging pools yet — host one.</p>}
          {board.data.pools.map((p) => {
            const mine = p.host_worker_id === profile?.id;
            const myMembership = myMembershipByPool.get(p.id);
            const roster = board.data.members.filter((m) => m.pool_id === p.id && m.status === 'joined');
            return (
              <Card key={p.id}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold">{p.name}</p>
                        <Badge variant="secondary">{p.kind}</Badge>
                        <Badge variant="outline">{p.spots_taken}/{p.spots} spots</Badge>
                        {p.share_cents > 0 && <Badge variant="secondary">{money(p.share_cents / 100)}/spot</Badge>}
                        {distById.get(p.id) && (
                          <Badge variant={p.id === closestBunkId ? 'default' : 'outline'}>
                            {p.id === closestBunkId ? 'Closest bunk · ' : ''}{distById.get(p.id)!.km} km to venue
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        Host: {p.host?.full_name ?? '—'} · {p.address_area ?? 'area TBD'}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        <Clock className="w-3 h-3 inline mr-1" />In {fmt(p.check_in_at)} · out {fmt(p.check_out_at)}
                      </p>
                      {roster.length > 0 && (
                        <p className="text-xs text-muted-foreground mt-1">In: {roster.map((m) => m.worker?.full_name ?? '—').join(', ')}</p>
                      )}
                      {p.notes && <p className="text-xs text-muted-foreground mt-1 bg-muted rounded p-2">{p.notes}</p>}
                      {myMembership && shift && p.share_cents > 0 && bailKeptCents(shift.starts_at, p.share_cents * myMembership.spots_needed, bailPolicy) > 0 && (
                        <p className="text-xs text-amber-600 mt-1">
                          Inside the {bailPolicy.windowHours}h bail window — leaving keeps {money(bailKeptCents(shift.starts_at, p.share_cents * myMembership.spots_needed, bailPolicy) / 100)} of your share committed.
                        </p>
                      )}
                    </div>
                    <div className="shrink-0">
                      {mine ? (
                        p.status !== 'cancelled' && (
                          <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => act(p.id, () => cancelLodgingPool(p.id), 'Pool cancelled')}>Cancel</Button>
                        )
                      ) : myMembership ? (
                        <Button size="sm" variant="outline" disabled={busy !== null}
                          onClick={() => act(p.id, () => leavePool(myMembership.id),
                            shift && bailKeptCents(shift.starts_at, p.share_cents * myMembership.spots_needed, bailPolicy) > 0
                              ? 'Left the bunk — partial share stays committed'
                              : 'Left the bunk — share voided')}>Leave</Button>
                      ) : p.status === 'open' && (
                        <Button size="sm" disabled={busy !== null}
                          onClick={() => act(p.id, () => joinPool(p.id), p.share_cents > 0 ? `Bunk taken — ${money(p.share_cents / 100)} share committed` : 'Bunk taken')}>
                          Join
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
          <LodgingForm shift={shift} busy={busy} onSubmit={(input) => act('post-pool', () => postLodgingPool(input), 'Pool posted')} />
        </TabsContent>

        {/* ----------------------------- FOOD ------------------------------ */}
        <TabsContent value="food" className="space-y-3 mt-4">
          {board.data.runs.length === 0 && <p className="text-center text-muted-foreground py-8 text-sm">No food runs yet — post one before the call.</p>}
          {board.data.runs.map((r) => {
            const mine = r.runner_worker_id === profile?.id;
            const runOrders = board.data.orders.filter((o) => o.run_id === r.id && o.status !== 'cancelled');
            const myOrder = myOrderByRun.get(r.id);
            const accepting = isAcceptingOrders(r);
            return (
              <Card key={r.id}>
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold">{r.restaurant}</p>
                        <Badge variant={r.status === 'open' ? 'default' : 'secondary'}>{r.status}</Badge>
                        {distById.get(r.id) && <Badge variant="outline">Pickup {distById.get(r.id)!.km} km from venue</Badge>}
                        {r.min_orders > 0 && (
                          <Badge variant={runOrders.length >= r.min_orders ? 'outline' : 'secondary'}>
                            {runOrders.length}/{r.min_orders} orders{runOrders.length < r.min_orders ? ' needed' : ''}
                          </Badge>
                        )}
                        {r.late_fee_cents > 0 && <Badge variant="outline">{money(r.late_fee_cents / 100)} late-cancel fee</Badge>}
                        {r.pending_runner_worker_id && (
                          <Badge variant="secondary">handoff → {r.pending_runner?.full_name ?? 'pending'}</Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        Runner: {r.runner?.full_name ?? '—'} · cutoff {fmt(r.order_cutoff_at)}
                        {r.delivery_area ? ` · ${r.delivery_area}` : ''}
                      </p>
                      {r.notes && <p className="text-xs text-muted-foreground mt-1 bg-muted rounded p-2">{r.notes}</p>}
                    </div>
                    {mine && r.status === 'open' && (
                      <Button size="sm" variant="outline" disabled={busy !== null || (r.min_orders > 0 && runOrders.length < r.min_orders)}
                        title={r.min_orders > 0 && runOrders.length < r.min_orders ? `Needs ${r.min_orders - runOrders.length} more order(s) before committing` : undefined}
                        onClick={() => act(r.id, () => updateFoodRunStatus(r.id, 'ordered'), 'Run marked ordered')}>
                        Ordered
                      </Button>
                    )}
                    {r.pending_runner_worker_id === profile?.id && r.status === 'open' && (
                      <div className="shrink-0 flex flex-col gap-1">
                        <Button size="sm" disabled={busy !== null}
                          onClick={() => act(r.id, () => acceptRunHandoff(r.id), 'Run taken over — order IOUs now collect to you')}>
                          Take the run
                        </Button>
                        <Button size="sm" variant="ghost" disabled={busy !== null}
                          onClick={() => act(r.id, () => declineRunHandoff(r.id), 'Handoff declined')}>
                          Decline
                        </Button>
                      </div>
                    )}
                    {mine && r.status === 'ordered' && (
                      <Button size="sm" variant="outline" disabled={busy !== null}
                        onClick={() => act(r.id, () => updateFoodRunStatus(r.id, 'delivered'), 'Run delivered')}>
                        Delivered
                      </Button>
                    )}
                  </div>
                  {runOrders.length > 0 && (
                    <div className="text-xs space-y-1 border-t pt-2">
                      {runOrders.map((o) => (
                        <div key={o.id} className="flex items-center justify-between gap-2">
                          <span className={o.status === 'confirmed' ? 'text-foreground' : 'text-muted-foreground'}>
                            {o.worker?.full_name ?? '—'}: {o.item}
                            {o.price_cents != null ? ` — ${money(o.price_cents / 100)}` : ''}
                            {o.status === 'price_review' ? ' (over quote — awaiting orderer)' : ''}
                          </span>
                          {mine && o.status === 'placed' && (
                            <ConfirmOrderButton busy={busy} onConfirm={(price) => act(o.id, () => confirmOrder(o.id, price),
                              (status) => status === 'price_review' ? 'Above the quoted price — sent to the orderer for review' : 'Order confirmed — IOU minted')} />
                          )}
                          {!mine && o.worker_id === profile?.id && o.status === 'placed' && (
                            <Button size="sm" variant="ghost" className="h-6 px-2" disabled={busy !== null} onClick={() => act(o.id, () => cancelOrder(o.id), 'Order cancelled')}><X className="w-3 h-3" /></Button>
                          )}
                          {!mine && o.worker_id === profile?.id && o.status === 'price_review' && (
                            <span className="inline-flex gap-1">
                              <Button size="sm" className="h-6 px-2 text-xs" disabled={busy !== null}
                                onClick={() => act(o.id, () => acceptFoodPrice(o.id), 'Price accepted — IOU minted')}>
                                Accept {money((o.price_cents ?? 0) / 100)}
                              </Button>
                              <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" disabled={busy !== null}
                                onClick={() => act(o.id, () => rejectFoodPrice(o.id), 'Bounced back to the runner')}>
                                Bounce back
                              </Button>
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  {!mine && accepting && !myOrder && <PlaceOrderBox busy={busy} onPlace={(item, quotedCents, note) => act(`order-${r.id}`, () => placeOrder(r.id, item, quotedCents, note), 'Order in')} />}
                  {myOrder?.status === 'placed' && <p className="text-xs text-muted-foreground">Your order is in (quoted {money((myOrder.quoted_price_cents ?? 0) / 100)}) — runner confirms the real price.</p>}
                  {myOrder?.status === 'price_review' && <p className="text-xs text-amber-600">Runner&apos;s price {money((myOrder.price_cents ?? 0) / 100)} is over your quote — accept or bounce it back above.</p>}
                  {myOrder?.status === 'confirmed' && <p className="text-xs"><Badge variant="secondary">Confirmed {money((myOrder.price_cents ?? 0) / 100)}</Badge> — settles from your payout.</p>}
                  {mine && r.status === 'open' && (
                    <div className="flex items-center gap-3">
                      <Button size="sm" variant="ghost" className="h-6 px-0 text-xs text-muted-foreground" disabled={busy !== null}
                        onClick={() => act(`cancel-${r.id}`, () => updateFoodRunStatus(r.id, 'cancelled'), 'Run cancelled')}>
                        Cancel run
                      </Button>
                      {r.pending_runner_worker_id ? (
                        <Button size="sm" variant="ghost" className="h-6 px-0 text-xs text-muted-foreground" disabled={busy !== null}
                          onClick={() => act(`handoff-${r.id}`, () => declineRunHandoff(r.id), 'Handoff offer retracted')}>
                          Retract handoff
                        </Button>
                      ) : crewRoster.length > 0 ? (
                        <HandoffPicker busy={busy} roster={crewRoster}
                          onOffer={(targetId) => act(`handoff-${r.id}`, () => offerRunHandoff(r.id, targetId), 'Handoff offered')} />
                      ) : null}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
          <FoodRunForm shift={shift} busy={busy} onSubmit={(input) => act('post-run', () => postFoodRun(input), 'Food run posted')} />
        </TabsContent>

        {/* ----------------------------- BOARD ----------------------------- */}
        <TabsContent value="board" className="space-y-3 mt-4">
          {board.data.posts.length === 0 && <p className="text-center text-muted-foreground py-8 text-sm">Nothing posted yet — asks and offers land here.</p>}
          {board.data.posts.map((p) => {
            const mine = p.author_worker_id === profile?.id;
            return (
              <Card key={p.id}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline">{p.category}</Badge>
                        <Badge variant={p.direction === 'want' ? 'default' : 'secondary'}>{p.direction === 'want' ? 'Wanted' : 'Offered'}</Badge>
                        {p.amount_cents != null && p.amount_cents > 0 && <Badge variant="secondary">{money(p.amount_cents / 100)}</Badge>}
                        {p.status !== 'open' && <Badge variant="outline">{p.status}</Badge>}
                      </div>
                      <p className="font-semibold mt-1">{p.title}</p>
                      <p className="text-xs text-muted-foreground">by {p.author?.full_name ?? '—'} · {format(new Date(p.created_at), 'MMM d HH:mm')}</p>
                      {p.body && <p className="text-sm text-muted-foreground mt-1">{p.body}</p>}
                      {p.status === 'resolved' && p.fulfiller && (
                        <p className="text-xs text-muted-foreground mt-1">Fulfilled by {p.fulfiller.full_name}</p>
                      )}
                      {p.status === 'awaiting_accept' && p.fulfilled_by_worker_id === profile?.id && (
                        <div className="flex items-center gap-2 mt-2">
                          <Button size="sm" className="h-7" disabled={busy !== null}
                            onClick={() => act(p.id, () => acceptFulfilment(p.id), 'Accepted — the share is on your ledger')}>
                            <Check className="w-3.5 h-3.5 mr-1" /> Accept {p.amount_cents ? money(p.amount_cents / 100) : ''}
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7" disabled={busy !== null}
                            onClick={() => act(p.id, () => declineFulfilment(p.id), 'Declined — post is open again')}>
                            Decline
                          </Button>
                        </div>
                      )}
                      {p.status === 'awaiting_accept' && p.fulfilled_by_worker_id !== profile?.id && (
                        <p className="text-xs text-muted-foreground mt-1">Waiting for {p.fulfiller?.full_name ?? 'the fulfiller'} to accept before anything is owed.</p>
                      )}
                      {p.status === 'resolved' && (p.amount_cents ?? 0) > 0 && p.fulfilled_by_worker_id && !p.debtor_confirmed_at && (
                        p.fulfilled_by_worker_id === profile?.id && p.direction === 'offer' ? (
                          <div className="mt-2 flex items-center gap-2 text-xs">
                            <span>You owe {money((p.amount_cents ?? 0) / 100)} for this.</span>
                            <Button size="sm" className="h-7" disabled={busy !== null}
                              onClick={() => act(`accept-${p.id}`, () => acceptPostDebt(p.id), 'Accepted — the share is on your ledger')}>
                              <Check className="w-3 h-3 mr-1" /> Accept
                            </Button>
                          </div>
                        ) : (
                          <p className="text-xs text-muted-foreground mt-2">Waiting for {p.fulfiller?.full_name ?? 'the fulfiller'} to accept the {money((p.amount_cents ?? 0) / 100)} share.</p>
                        )
                      )}
                    </div>
                    {mine && p.status === 'open' && (
                      <div className="shrink-0 flex flex-col gap-1">
                        <ResolvePostButton crew={crewRoster} busy={busy} onResolve={(workerId) => {
                          setBusy(p.id);
                          resolvePost(p.id, workerId).then(({ data, error }) => {
                            setBusy(null);
                            if (error) return toast.error(error);
                            toast.success(data?.status === 'awaiting_accept'
                              ? 'Sent — nothing is owed until they accept'
                              : 'Resolved — ledger updated');
                            board.refetch();
                          });
                        }} />
                        <Button size="sm" variant="ghost" className="h-7" disabled={busy !== null} onClick={() => act(p.id, () => closePost(p.id), 'Post closed')}>
                          <X className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
          <BoardPostForm shift={shift} busy={busy} onSubmit={(input) => act('post', () => postToBoard(input), 'Posted to the board')} />
        </TabsContent>
      </Tabs>

      {myIous.length > 0 && (
        <Card>
          <CardContent className="p-3">
            <p className="text-xs font-medium text-muted-foreground mb-1 inline-flex items-center gap-1"><CircleAlert className="w-3 h-3" /> Open shares coming out of this check</p>
            {myIous.map((i) => (
              <p key={i.id} className="text-xs text-muted-foreground">· {money(i.amount_cents / 100)} {i.kind}{i.beneficiary_profile?.full_name ? ` → ${i.beneficiary_profile.full_name}` : ''}</p>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
};

/* ------------------------------------------------------------------ forms */

const RideOfferForm: React.FC<{ shift: Shift; busy: string | null; initial?: LastRideOfferParams | null; onSubmit: (i: Parameters<typeof postRideOffer>[0]) => void }> = ({ shift, busy, initial, onSubmit }) => {
  const [seats, setSeats] = useState('3');
  const [area, setArea] = useState('');
  const [at, setAt] = useState(toLocalInputValue(shift.starts_at));
  const [gas, setGas] = useState('');
  const [notes, setNotes] = useState('');
  const geo = useGeoPin();

  // "Offer again": hydrate from my most recent live offer once it loads.
  useEffect(() => {
    if (!initial) return;
    setSeats(String(initial.seats));
    setArea(initial.departure_area ?? '');
    setGas(initial.gas_share_cents > 0 ? String(initial.gas_share_cents / 100) : '');
    setNotes(initial.notes ?? '');
    if (initial.departure_lat != null && initial.departure_lng != null) {
      geo.setPin({ lat: initial.departure_lat, lng: initial.departure_lng });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- setPin is stable
  }, [initial]);
  return (
    <MiniForm label="Offer a ride">
      <div className="grid grid-cols-2 gap-2">
        <Input placeholder="Seats" inputMode="numeric" value={seats} onChange={(e) => setSeats(e.target.value)} />
        <Input type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} />
      </div>
      <Input placeholder="Leaving from (hotel, lot, city)" value={area} onChange={(e) => setArea(e.target.value)} />
      <Input placeholder="Gas share per seat ($, optional)" inputMode="decimal" value={gas} onChange={(e) => setGas(e.target.value)} />
      <Input placeholder="Notes — gear room, stops, playlist rules" value={notes} onChange={(e) => setNotes(e.target.value)} />
      <GeoPinButton pin={geo.pin} onPin={geo.grab} onClear={() => geo.setPin(null)} />
      <Button size="sm" className="w-full" disabled={busy !== null || !seats || parseInt(seats) < 1}
        onClick={() => onSubmit({ shiftId: shift.id, seats: parseInt(seats), departureArea: area || undefined, departureAt: new Date(at).toISOString(), departureLat: geo.pin?.lat, departureLng: geo.pin?.lng, gasShareCents: cents(gas) ?? 0, notes: notes || undefined })}>
        Post ride
      </Button>
    </MiniForm>
  );
};

const LodgingForm: React.FC<{ shift: Shift; busy: string | null; onSubmit: (i: Parameters<typeof postLodgingPool>[0]) => void }> = ({ shift, busy, onSubmit }) => {
  const [name, setName] = useState('');
  const [kind, setKind] = useState<'hotel' | 'airbnb' | 'house' | 'camp' | 'rv' | 'other'>('hotel');
  const [area, setArea] = useState('');
  const [spots, setSpots] = useState('2');
  const [share, setShare] = useState('');
  const [checkIn, setCheckIn] = useState(toLocalInputValue(shift.starts_at));
  const [notes, setNotes] = useState('');
  const geo = useGeoPin();
  return (
    <MiniForm label="Host a bunk pool">
      <Input placeholder="Name — La Quinta suite, Riverside campground" value={name} onChange={(e) => setName(e.target.value)} />
      <div className="grid grid-cols-2 gap-2">
        <Select value={kind} onValueChange={(v) => setKind(v as typeof kind)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {['hotel', 'airbnb', 'house', 'camp', 'rv', 'other'].map((k) => <SelectItem key={k} value={k}>{k}</SelectItem>)}
          </SelectContent>
        </Select>
        <Input placeholder="Spots" inputMode="numeric" value={spots} onChange={(e) => setSpots(e.target.value)} />
      </div>
      <Input placeholder="Area / address" value={area} onChange={(e) => setArea(e.target.value)} />
      <GeoPinButton pin={geo.pin} onPin={geo.grab} onClear={() => geo.setPin(null)} />
      <div className="grid grid-cols-2 gap-2">
        <Input type="datetime-local" value={checkIn} onChange={(e) => setCheckIn(e.target.value)} />
        <Input placeholder="Share per spot ($)" inputMode="decimal" value={share} onChange={(e) => setShare(e.target.value)} />
      </div>
      <Input placeholder="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
      <Button size="sm" className="w-full" disabled={busy !== null || !name || parseInt(spots) < 1}
        onClick={() => onSubmit({ shiftId: shift.id, kind, name, addressArea: area || undefined, geoLat: geo.pin?.lat, geoLng: geo.pin?.lng, checkInAt: new Date(checkIn).toISOString(), spots: parseInt(spots), shareCents: cents(share) ?? 0, notes: notes || undefined })}>
        Post pool
      </Button>
    </MiniForm>
  );
};

const HandoffPicker: React.FC<{ busy: string | null; roster: [string, string][]; onOffer: (targetId: string) => void }> = ({ busy, roster, onOffer }) => {
  const [target, setTarget] = useState('');
  return (
    <span className="flex items-center gap-1">
      <Select value={target} onValueChange={setTarget}>
        <SelectTrigger className="h-6 w-32 text-xs"><SelectValue placeholder="Hand off to…" /></SelectTrigger>
        <SelectContent>
          {roster.map(([id, name]) => <SelectItem key={id} value={id}>{name}</SelectItem>)}
        </SelectContent>
      </Select>
      <Button size="sm" variant="ghost" className="h-6 px-1 text-xs" disabled={busy !== null || !target} onClick={() => onOffer(target)}>
        Offer
      </Button>
    </span>
  );
};

const FoodRunForm: React.FC<{ shift: Shift; busy: string | null; onSubmit: (i: Parameters<typeof postFoodRun>[0]) => void }> = ({ shift, busy, onSubmit }) => {
  const [restaurant, setRestaurant] = useState('');
  const [cutoff, setCutoff] = useState(toLocalInputValue(shift.starts_at));
  const [area, setArea] = useState('');
  const [menu, setMenu] = useState('');
  const [notes, setNotes] = useState('');
  const [minOrders, setMinOrders] = useState('');
  const [lateFee, setLateFee] = useState('');
  const geo = useGeoPin();
  return (
    <MiniForm label="Start a food run">
      <Input placeholder="Restaurant" value={restaurant} onChange={(e) => setRestaurant(e.target.value)} />
      <div className="grid grid-cols-2 gap-2">
        <Input type="datetime-local" value={cutoff} onChange={(e) => setCutoff(e.target.value)} />
        <Input placeholder="Menu link" value={menu} onChange={(e) => setMenu(e.target.value)} />
      </div>
      <Input placeholder="Meet where — Dock B 18:30" value={area} onChange={(e) => setArea(e.target.value)} />
      <GeoPinButton pin={geo.pin} onPin={geo.grab} onClear={() => geo.setPin(null)} />
      <div className="grid grid-cols-2 gap-2">
        <Input placeholder="Min orders to commit (optional)" inputMode="numeric" value={minOrders} onChange={(e) => setMinOrders(e.target.value)} />
        <Input placeholder="Late-cancel fee ($, optional)" inputMode="decimal" value={lateFee} onChange={(e) => setLateFee(e.target.value)} />
      </div>
      <Input placeholder="Notes — cash or IOU, etc." value={notes} onChange={(e) => setNotes(e.target.value)} />
      <Button size="sm" className="w-full" disabled={busy !== null || !restaurant}
        onClick={() => onSubmit({ shiftId: shift.id, restaurant, orderCutoffAt: new Date(cutoff).toISOString(), deliveryArea: area || undefined, pickupLat: geo.pin?.lat, pickupLng: geo.pin?.lng, minOrders: parseInt(minOrders) > 0 ? parseInt(minOrders) : 0, lateFeeCents: cents(lateFee) ?? 0, menuLink: menu || undefined, notes: notes || undefined })}>
        Post run
      </Button>
    </MiniForm>
  );
};

const PlaceOrderBox: React.FC<{ busy: string | null; onPlace: (item: string, quotedCents: number, note?: string) => void }> = ({ busy, onPlace }) => {
  const [item, setItem] = useState('');
  const [price, setPrice] = useState('');
  const p = cents(price);
  return (
    <div className="flex gap-2 pt-1">
      <Input placeholder="Your order — #4 no onions" value={item} onChange={(e) => setItem(e.target.value)} />
      <Input className="w-20" placeholder="$" inputMode="decimal" title="Menu price — the runner can't charge more than ~25% over this without your OK"
        value={price} onChange={(e) => setPrice(e.target.value)} />
      <Button size="sm" disabled={busy !== null || !item || !p || p <= 0} onClick={() => { onPlace(item, p!, undefined); setItem(''); setPrice(''); }}>Add</Button>
    </div>
  );
};

const ConfirmOrderButton: React.FC<{ busy: string | null; onConfirm: (priceCents: number) => void }> = ({ busy, onConfirm }) => {
  const [price, setPrice] = useState('');
  const p = cents(price);
  return (
    <span className="inline-flex gap-1">
      <Input className="h-7 w-20" placeholder="$" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
      <Button size="sm" className="h-7" disabled={busy !== null || !p || p <= 0} onClick={() => onConfirm(p!)}>
        <Check className="w-3 h-3" />
      </Button>
    </span>
  );
};

const ResolvePostButton: React.FC<{ crew: [string, string][]; busy: string | null; onResolve: (workerId: string) => void }> = ({ crew, busy, onResolve }) => {
  const [who, setWho] = useState('');
  return (
    <span className="inline-flex gap-1">
      <Select value={who} onValueChange={setWho}>
        <SelectTrigger className="h-7 w-28 text-xs"><SelectValue placeholder="Who?" /></SelectTrigger>
        <SelectContent>
          {crew.map(([id, name]) => <SelectItem key={id} value={id}>{name}</SelectItem>)}
        </SelectContent>
      </Select>
      <Button size="sm" className="h-7" disabled={busy !== null || !who} title="Resolve — credits the fulfiller" onClick={() => onResolve(who)}>
        <HandHelping className="w-3.5 h-3.5" />
      </Button>
    </span>
  );
};

const SwapForm: React.FC<{ busy: string | null; onSubmit: (reason: string | undefined, sweetenerCents: number | undefined) => void }> = ({ busy, onSubmit }) => {
  const [reason, setReason] = useState('');
  const [sweetener, setSweetener] = useState('');
  return (
    <div className="space-y-2">
      <Input placeholder="Why? (optional — 'double-booked', 'sick')" value={reason} onChange={(e) => setReason(e.target.value)} />
      <Input placeholder="Sweetener $ (optional — pay whoever takes it)" inputMode="decimal" value={sweetener} onChange={(e) => setSweetener(e.target.value)} />
      <Button size="sm" variant="outline" className="w-full" disabled={busy !== null}
        onClick={() => onSubmit(reason || undefined, cents(sweetener) ?? undefined)}>
        <Repeat2 className="w-3.5 h-3.5 mr-1" /> Post swap request
      </Button>
    </div>
  );
};

const ClaimSwapButton: React.FC<{ busy: string | null; onClaim: (message?: string) => void }> = ({ busy, onClaim }) => {
  const [msg, setMsg] = useState('');
  const [open, setOpen] = useState(false);
  if (!open) return <Button size="sm" disabled={busy !== null} onClick={() => setOpen(true)}>Take it</Button>;
  return (
    <span className="inline-flex gap-1">
      <Input className="h-8 w-32" placeholder="Pitch (optional)" value={msg} onChange={(e) => setMsg(e.target.value)} />
      <Button size="sm" className="h-8" disabled={busy !== null} onClick={() => onClaim(msg || undefined)}>Claim</Button>
    </span>
  );
};

const BoardPostForm: React.FC<{ shift: Shift; busy: string | null; onSubmit: (i: Parameters<typeof postToBoard>[0]) => void }> = ({ shift, busy, onSubmit }) => {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [category, setCategory] = useState<CrewPostCategory>('borrow');
  const [direction, setDirection] = useState<CrewPostDirection>('want');
  const [amount, setAmount] = useState('');
  return (
    <MiniForm label="Post to the board">
      <div className="grid grid-cols-2 gap-2">
        <Select value={category} onValueChange={(v) => setCategory(v as CrewPostCategory)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {['borrow', 'ride', 'lodging', 'food', 'announce', 'general'].map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={direction} onValueChange={(v) => setDirection(v as CrewPostDirection)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="want">I need it</SelectItem>
            <SelectItem value="offer">I have it</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <Input placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
      <Input placeholder="Details" value={body} onChange={(e) => setBody(e.target.value)} />
      <Input placeholder="Amount ($, optional — becomes an IOU on resolve)" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
      <Button size="sm" className="w-full" disabled={busy !== null || !title}
        onClick={() => onSubmit({ shiftId: shift.id, category, direction, title, body: body || undefined, amountCents: cents(amount) ?? undefined })}>
        Post
      </Button>
    </MiniForm>
  );
};

export default CrewBoardPage;
