import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { ShiftAssignment } from '@/lib/types';
import { MarketplaceService } from '@/lib/marketplace/service';
import { checkGeofence, getCurrentPosition } from '@/lib/marketplace/geo';
import { shiftWindow } from '../format';
import { LogIn, LogOut, MapPin, Loader2, Navigation, Users, Flag } from 'lucide-react';

interface Props {
  assignment: ShiftAssignment;
  onChanged: () => void;
}

/** Geofenced clock-in / clock-out for a confirmed booking. */
const AUTO_OUT_GRACE_MS = 90_000;

const ClockCard: React.FC<Props> = ({ assignment, onChanged }) => {
  const [busy, setBusy] = useState(false);
  const [locating, setLocating] = useState<string | null>(null);
  const [flagging, setFlagging] = useState(false);
  const [flagReason, setFlagReason] = useState('');
  const shift = assignment.shift;
  const venue = shift?.event?.venue;
  const fenceCenter =
    venue && venue.latitude != null && venue.longitude != null ? { lat: venue.latitude, lng: venue.longitude } : null;
  const ts = assignment.timesheet;
  const clockedIn = !!ts?.clock_in_at;
  const clockedOut = !!ts?.clock_out_at;
  const outsideSince = useRef<number | null>(null);
  const autoOutDone = useRef(false);
  const now = Date.now();
  const canClockIn = shift && !clockedIn && new Date(shift.starts_at).getTime() - now < 60 * 60_000;

  const clock = async (kind: 'in' | 'out') => {
    setBusy(true);
    setLocating('Getting GPS fix…');
    try {
      const pos = await getCurrentPosition();
      const here = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      if (fenceCenter && venue) {
        const fence = checkGeofence(here, fenceCenter, venue.geofence_radius_m, pos.coords.accuracy);
        setLocating(fence.inside ? `Inside geofence (${Math.round(fence.distanceM)} m)` : `${Math.round(fence.distanceM)} m from venue`);
        if (!fence.inside && kind === 'in') {
          toast.error(`You're ${Math.round(fence.distanceM)} m from ${venue.name}. Clock-in requires being within ${venue.geofence_radius_m} m.`);
          setBusy(false);
          return;
        }
      } else {
        setLocating('No geofence on this event — GPS is recorded but not verified');
      }
      const { error } = await MarketplaceService.clockEvent(assignment.id, kind, here.lat, here.lng);
      if (error) throw new Error(error);
      toast.success(kind === 'in' ? (venue ? `Clocked in at ${venue.name}` : 'Clocked in') : 'Clocked out — timesheet submitted for approval');
      if (kind === 'out') autoOutDone.current = true;
      onChanged();
    } catch (e) {
      toast.error(e instanceof GeolocationPositionError ? 'Location permission is required to clock in.' : (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  // Auto clock-out: while on the clock inside a fenced venue, sustained
  // position fixes outside the fence clock the worker out and flag it for
  // the manager (timesheet keeps the GPS distance/verification fields).
  useEffect(() => {
    if (!clockedIn || clockedOut || !fenceCenter || !venue || typeof navigator === 'undefined' || !navigator.geolocation) return;
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const fence = checkGeofence(
          { lat: pos.coords.latitude, lng: pos.coords.longitude },
          fenceCenter,
          venue.geofence_radius_m,
          pos.coords.accuracy,
        );
        if (fence.inside) {
          outsideSince.current = null;
          return;
        }
        if (outsideSince.current == null) {
          outsideSince.current = pos.timestamp;
          return;
        }
        if (pos.timestamp - outsideSince.current >= AUTO_OUT_GRACE_MS && !autoOutDone.current) {
          autoOutDone.current = true;
          setLocating(`Left ${venue.name} geofence — clocking out`);
          MarketplaceService.clockEvent(assignment.id, 'out', pos.coords.latitude, pos.coords.longitude).then(({ error }) => {
            if (error) {
              autoOutDone.current = false;
              toast.error(`Auto clock-out failed: ${error}`);
              return;
            }
            toast.warning(`Clocked out — you left the ${venue.name} geofence`, { duration: 10_000 });
            if (ts?.id) {
              // Best-effort flag for the manager reviewing the timesheet.
              MarketplaceService.updateTimesheetNotes(ts.id, 'Auto clock-out: worker left the venue geofence').catch(() => {});
            }
            onChanged();
          });
        }
      },
      () => { /* GPS read failures can't confirm an exit — ignore and retry on next fix */ },
      { enableHighAccuracy: true, maximumAge: 15_000, timeout: 20_000 },
    );
    return () => {
      navigator.geolocation.clearWatch(watchId);
      outsideSince.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clockedIn, clockedOut, venue?.id]);

  if (!shift) return null;

  return (
    <div className="rounded-lg border bg-card p-4 shadow-sm" style={{ borderLeft: `4px solid ${shift.event?.color ?? '#2563eb'}` }}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-semibold">{shift.title}</p>
          <p className="text-sm text-muted-foreground">{shift.event?.name} · {shift.event?.company?.name}</p>
          <p className="text-sm text-muted-foreground">{shiftWindow(shift.starts_at, shift.ends_at)} · ${Number(assignment.offered_rate ?? shift.hourly_rate).toFixed(2)}/hr</p>
          {venue && (
            <p className="text-xs text-muted-foreground inline-flex items-center gap-1 mt-1">
              <MapPin className="w-3 h-3" /> {venue.name}, {venue.address}
            </p>
          )}
        </div>
        <Badge variant={clockedOut ? 'secondary' : clockedIn ? 'default' : 'outline'}>
          {clockedOut ? `Submitted · ${ts?.status}` : clockedIn ? 'On the clock' : 'Confirmed'}
        </Badge>
      </div>

      {shift.notes && <p className="text-xs text-muted-foreground mt-2 bg-muted rounded p-2">{shift.notes}</p>}

      <div className="mt-3 flex items-center justify-between gap-3">
        <div className="text-xs text-muted-foreground space-y-0.5">
          {ts?.clock_in_at && <p>In {format(new Date(ts.clock_in_at), 'HH:mm')} {ts.clock_in_verified ? '· GPS verified' : '· outside fence'}</p>}
          {ts?.clock_out_at && <p>Out {format(new Date(ts.clock_out_at), 'HH:mm')} · {Number(ts.regular_hours) + Number(ts.overtime_hours) + Number(ts.doubletime_hours)} h · ${Number(ts.gross_pay).toFixed(2)}</p>}
          {locating && <p className="inline-flex items-center gap-1"><Navigation className="w-3 h-3" /> {locating}</p>}
        </div>
        {!clockedIn && (
          <Button onClick={() => clock('in')} disabled={busy || !canClockIn} title={canClockIn ? undefined : 'Clock-in opens 60 min before call time'}>
            {busy ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <LogIn className="w-4 h-4 mr-1" />} Clock in
          </Button>
        )}
        {clockedIn && !clockedOut && (
          <Button variant="destructive" onClick={() => clock('out')} disabled={busy}>
            {busy ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <LogOut className="w-4 h-4 mr-1" />} Clock out
          </Button>
        )}
      </div>

      <div className="mt-2 flex justify-between items-center">
        {ts && (ts.status === 'submitted' || ts.status === 'approved') ? (
          <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground" onClick={() => setFlagging(!flagging)}>
            <Flag className="w-3.5 h-3.5 mr-1" /> Flag a problem with this timesheet
          </Button>
        ) : <span />}
        {ts?.status === 'disputed' && (
          <Badge variant="outline" className="bg-red-500/15 text-destructive dark:text-red-400">Under dispute review</Badge>
        )}
        <Button asChild variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground">
          <Link to={`/shifts/${shift.id}/crew`}><Users className="w-3.5 h-3.5 mr-1" /> Crew — rides, bunks, grub, board</Link>
        </Button>
      </div>
      {flagging && ts && (
        <div className="mt-2 space-y-2 border-t pt-2">
          <Textarea
            rows={2}
            className="text-sm"
            placeholder="What's wrong? e.g. clock-out recorded early — I stayed until 01:30 strike wrap"
            value={flagReason}
            onChange={(e) => setFlagReason(e.target.value)}
          />
          <Button
            size="sm"
            variant="destructive"
            disabled={busy || !flagReason.trim()}
            onClick={async () => {
              setBusy(true);
              const { error } = await MarketplaceService.flagTimesheet(ts.id, flagReason.trim());
              setBusy(false);
              if (error) return toast.error(error);
              toast.success('Flagged — the company will review and respond');
              setFlagging(false);
              setFlagReason('');
              onChanged();
            }}
          >
            Submit dispute
          </Button>
        </div>
      )}
    </div>
  );
};

export default ClockCard;
