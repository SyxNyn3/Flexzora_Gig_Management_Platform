import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { format, parseISO, startOfDay } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAuth } from '@/contexts/AuthContext';
import { useSkills } from '@/hooks/useSupabaseQuery';
import { useCertificationTypes, useEvent, useMyCompany } from '@/hooks/useMarketplace';
import { MarketplaceService } from '@/lib/marketplace/service';
import { Shift, ShiftFormData, Skill } from '@/lib/types';
import RosterBoard from '@/components/marketplace/company/RosterBoard';
import ShiftForm from '@/components/marketplace/company/ShiftForm';
import CandidatesPanel from '@/components/marketplace/company/CandidatesPanel';
import BudgetSummary from '@/components/marketplace/company/BudgetSummary';
import { ArrowLeft, MapPin, Plus, Rocket, Users, Timer, UserX } from 'lucide-react';

const EventDetailPage: React.FC = () => {
  const { eventId } = useParams<{ eventId: string }>();
  const { profile } = useAuth();
  const { company } = useMyCompany();
  const event = useEvent(eventId);
  const skills = useSkills();
  const certTypes = useCertificationTypes();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [shiftDialog, setShiftDialog] = useState<{ open: boolean; editing?: Shift }>({ open: false });
  const [submitting, setSubmitting] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const selected = useMemo(() => event.data?.shifts?.find((s) => s.id === selectedId) ?? null, [event.data, selectedId]);

  const stats = useMemo(() => {
    const shifts = event.data?.shifts ?? [];
    const totalHeadcount = shifts.reduce((n, s) => n + s.headcount, 0);
    const booked = shifts.reduce((n, s) => n + (s.assignments ?? []).filter((a) => a.status === 'confirmed' || a.status === 'completed').length, 0);
    const fillRate = totalHeadcount > 0 ? booked / totalHeadcount : null;

    const fillHours = shifts
      .filter((s) => s.status === 'filled' || s.status === 'completed' || s.status === 'in_progress')
      .map((s) => {
        const confirmed = (s.assignments ?? [])
          .filter((a) => (a.status === 'confirmed' || a.status === 'completed') && a.confirmed_at)
          .map((a) => new Date(a.confirmed_at!).getTime());
        if (!confirmed.length) return null;
        const start = new Date(s.roster_broadcast_at ?? s.public_broadcast_at ?? s.created_at).getTime();
        return (Math.max(...confirmed) - start) / 3_600_000;
      })
      .filter((h): h is number => h != null && h >= 0);
    const timeToFill = fillHours.length ? fillHours.reduce((a, b) => a + b, 0) / fillHours.length : null;

    const worked = shifts.reduce((n, s) => n + (s.assignments ?? []).filter((a) => ['confirmed', 'completed', 'no_show'].includes(a.status)).length, 0);
    const noShows = shifts.reduce((n, s) => n + (s.assignments ?? []).filter((a) => a.status === 'no_show').length, 0);
    const noShowRate = worked > 0 ? noShows / worked : null;

    return { fillRate, booked, totalHeadcount, timeToFill, noShowRate, noShows };
  }, [event.data]);

  // Roster-first waterfall: roster-stage calls older than the window go public.
  useEffect(() => {
    if (!eventId) return;
    MarketplaceService.promoteStaleRosterShifts(eventId).then(({ data: promoted }) => {
      if (promoted && promoted > 0) {
        toast.info(`${promoted} call${promoted === 1 ? '' : 's'} released to the public marketplace`);
        event.refetch();
      }
    });
    // Runs once per event on mount — event.refetch is intentionally excluded.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  const refresh = () => {
    event.refetch();
    setRefreshKey((k) => k + 1);
  };

  const saveShift = async (form: ShiftFormData) => {
    if (!eventId) return;
    setSubmitting(true);
    const res = shiftDialog.editing
      ? await MarketplaceService.updateShift(shiftDialog.editing.id, form)
      : await MarketplaceService.createShift(event.data!, form);
    setSubmitting(false);
    if (res.error) return toast.error(res.error);
    toast.success(shiftDialog.editing ? 'Shift updated' : 'Shift added');
    if (res.data) setSelectedId(res.data.id);
    setShiftDialog({ open: false });
    refresh();
  };

  const moveShift = async (shift: Shift, day: Date) => {
    const dayStart = startOfDay(day);
    const moveDate = (iso: string) => {
      const t = new Date(iso);
      return new Date(
        dayStart.getFullYear(), dayStart.getMonth(), dayStart.getDate(),
        t.getHours(), t.getMinutes(), t.getSeconds(),
      ).toISOString();
    };
    const { error } = await MarketplaceService.updateShift(shift.id, {
      starts_at: moveDate(shift.starts_at),
      ends_at: moveDate(shift.ends_at),
    });
    if (error) return toast.error(error);
    toast.success(`"${shift.title}" moved to ${format(day, 'EEE MMM d')}`);
    refresh();
  };

  const publish = async () => {
    if (!eventId) return;
    const { error } = await MarketplaceService.publishEvent(eventId);
    if (error) return toast.error(error);
    toast.success('Event published — all draft calls broadcast to your trusted roster');
    refresh();
  };

  if (event.loading || !event.data) {
    return <div className="max-w-7xl mx-auto p-6"><Skeleton className="h-64 w-full" /></div>;
  }
  const ev = event.data;

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link to="/events" className="text-sm text-muted-foreground inline-flex items-center gap-1 hover:text-foreground/90">
            <ArrowLeft className="w-3.5 h-3.5" /> All events
          </Link>
          <h1 className="text-2xl font-bold mt-1 flex items-center gap-2">
            <span className="inline-block w-3 h-3 rounded-full" style={{ background: ev.color }} />
            {ev.name}
            <Badge variant="outline" className="capitalize">{ev.status.replace('_', ' ')}</Badge>
          </h1>
          <p className="text-sm text-muted-foreground">
            {format(parseISO(ev.starts_on), 'EEE MMM d')} – {format(parseISO(ev.ends_on), 'EEE MMM d, yyyy')}
            {ev.venue && (
              <span className="inline-flex items-center gap-1 ml-3">
                <MapPin className="w-3.5 h-3.5" /> {ev.venue.name} · {ev.venue.geofence_radius_m} m geofence
              </span>
            )}
            <span className="ml-3">OT rule: {ev.overtime_rule_code}</span>
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShiftDialog({ open: true })}>
            <Plus className="w-4 h-4 mr-1" /> Add shift
          </Button>
          {ev.status === 'draft' && (
            <Button onClick={publish} disabled={!ev.shifts?.length}>
              <Rocket className="w-4 h-4 mr-1" /> Publish to roster
            </Button>
          )}
        </div>
      </div>

      <BudgetSummary event={ev} refreshKey={refreshKey} />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground inline-flex items-center gap-1"><Users className="w-3.5 h-3.5" /> Fill rate</p>
            <p className="text-xl font-semibold mt-0.5">
              {stats.fillRate != null ? `${Math.round(stats.fillRate * 100)}%` : '—'}
            </p>
            <p className="text-xs text-muted-foreground">{stats.booked} of {stats.totalHeadcount} seats booked</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground inline-flex items-center gap-1"><Timer className="w-3.5 h-3.5" /> Avg time to fill</p>
            <p className="text-xl font-semibold mt-0.5">
              {stats.timeToFill != null ? (stats.timeToFill < 24 ? `${stats.timeToFill.toFixed(1)} h` : `${(stats.timeToFill / 24).toFixed(1)} d`) : '—'}
            </p>
            <p className="text-xs text-muted-foreground">broadcast → last seat confirmed</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground inline-flex items-center gap-1"><UserX className="w-3.5 h-3.5" /> No-show rate</p>
            <p className="text-xl font-semibold mt-0.5">
              {stats.noShowRate != null ? `${Math.round(stats.noShowRate * 100)}%` : '—'}
            </p>
            <p className="text-xs text-muted-foreground">{stats.noShows} no-show{stats.noShows === 1 ? '' : 's'} among booked seats</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid lg:grid-cols-[1fr_400px] gap-6 items-start">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold">Schedule & roster</h2>
              <p className="text-xs text-muted-foreground">Click a call to rank candidates, direct-book, or confirm applicants · drag between days to reschedule</p>
            </div>
            <RosterBoard event={ev} selectedShiftId={selectedId} onSelectShift={(s) => setSelectedId(s.id)} onMoveShift={moveShift} />
          </CardContent>
        </Card>

        <Card className="lg:sticky lg:top-20">
          <CardContent className="p-4">
            {selected && company && profile ? (
              <CandidatesPanel
                shift={selected}
                companyId={company.id}
                managerId={profile.id}
                onChanged={refresh}
                onEdit={(s) => setShiftDialog({ open: true, editing: s })}
              />
            ) : (
              <div className="text-center text-muted-foreground py-12 text-sm">
                {ev.shifts?.length ? 'Select a call on the board to staff it.' : 'Add your first call — e.g. “4 Ground Riggers, load-in 08:00–16:00”.'}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={shiftDialog.open} onOpenChange={(o) => setShiftDialog({ open: o })}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{shiftDialog.editing ? 'Edit shift' : 'Add shift'}</DialogTitle></DialogHeader>
          <ShiftForm
            key={shiftDialog.editing?.id ?? 'new'}
            eventDate={ev.starts_on}
            skills={(skills.data ?? []) as Skill[]}
            certTypes={certTypes.data}
            initial={shiftDialog.editing}
            onSubmit={saveShift}
            submitting={submitting}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default EventDetailPage;
