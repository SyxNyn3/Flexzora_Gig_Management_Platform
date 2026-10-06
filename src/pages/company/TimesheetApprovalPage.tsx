import React, { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { format, startOfISOWeek } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { useCompanyTimesheets, useMyCompany, useOvertimeRules } from '@/hooks/useMarketplace';
import { MarketplaceService } from '@/lib/marketplace/service';
import { calculateShiftPay, FLSA_DEFAULT } from '@/lib/marketplace/overtime';
import { PayoutMethod, Timesheet } from '@/lib/types';
import { money } from '@/components/marketplace/format';
import { CheckCircle2, MapPinCheck, MapPinOff, AlertTriangle, Zap, Landmark } from 'lucide-react';

const statusTone: Record<Timesheet['status'], string> = {
  open: 'bg-muted text-foreground/80',
  submitted: 'bg-amber-100 text-amber-800',
  approved: 'bg-primary/15 text-blue-800',
  disputed: 'bg-red-500/15 text-red-600 dark:text-red-400',
  paid: 'bg-green-500/15 text-green-600 dark:text-green-400',
};

const Geo: React.FC<{ verified: boolean; distance?: number }> = ({ verified, distance }) => (
  <span className={`inline-flex items-center gap-1 text-xs ${verified ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
    {verified ? <MapPinCheck className="w-3.5 h-3.5" /> : <MapPinOff className="w-3.5 h-3.5" />}
    {distance != null ? `${Math.round(distance)} m` : 'no GPS'}
  </span>
);

const TimesheetApprovalPage: React.FC = () => {
  const { company } = useMyCompany();
  const sheets = useCompanyTimesheets(company?.id);
  const rules = useOvertimeRules();
  const [breaks, setBreaks] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [dispute, setDispute] = useState<{ sheet: Timesheet; notes: string } | null>(null);

  const ruleFor = (code?: string) => rules.data.find((r) => r.code === code) ?? FLSA_DEFAULT;

  const grouped = useMemo(() => {
    const by = (statuses: Timesheet['status'][]) => sheets.data.filter((t) => statuses.includes(t.status));
    return { review: by(['submitted', 'disputed']), live: by(['open']), settled: by(['approved', 'paid']) };
  }, [sheets.data]);

  const rateFor = (t: Timesheet) => Number(t.assignment?.offered_rate ?? t.shift?.hourly_rate ?? 0);

  /** Regular hours already approved for this worker in the same ISO workweek — mirrors approve_timesheet(). */
  const weeklyHoursBefore = (t: Timesheet) => {
    if (!t.clock_in_at) return 0;
    const week = startOfISOWeek(new Date(t.clock_in_at)).getTime();
    return sheets.data
      .filter((o) => o.id !== t.id && o.worker_id === t.worker_id && (o.status === 'approved' || o.status === 'paid') && o.clock_in_at)
      .filter((o) => startOfISOWeek(new Date(o.clock_in_at!)).getTime() === week)
      .reduce((sum, o) => sum + Number(o.regular_hours ?? 0), 0);
  };

  const preview = (t: Timesheet) => {
    if (!t.clock_in_at || !t.clock_out_at) return null;
    const brk = breaks[t.id] != null ? Number(breaks[t.id]) : t.break_minutes;
    const rule = { ...ruleFor(t.shift?.event?.overtime_rule_code), weekly_hours_before_shift: weeklyHoursBefore(t) };
    return calculateShiftPay(t.clock_in_at, t.clock_out_at, brk, rateFor(t), rule);
  };

  const approve = async (t: Timesheet, method: PayoutMethod) => {
    setBusy(t.id);
    const brk = breaks[t.id] != null ? Number(breaks[t.id]) : null;
    const { data, error } = await MarketplaceService.approveTimesheet(t.id, brk, method);
    setBusy(null);
    if (error) return toast.error(error);
    toast.success(`Approved — invoice ${data?.invoice_number ?? ''} issued, ${method === 'instant' ? 'instant' : 'ACH'} payout initiated`);
    sheets.refetch();
  };

  const submitDispute = async () => {
    if (!dispute) return;
    setBusy(dispute.sheet.id);
    const { error } = await MarketplaceService.disputeTimesheet(dispute.sheet.id, dispute.notes);
    setBusy(null);
    if (error) return toast.error(error);
    toast.success('Timesheet flagged for review');
    setDispute(null);
    sheets.refetch();
  };

  const totalPending = grouped.review.reduce((n, t) => n + (preview(t)?.grossPay ?? 0), 0);

  const Row: React.FC<{ t: Timesheet; actions?: boolean }> = ({ t, actions }) => {
    const p = preview(t);
    const scheduledEnd = t.shift ? new Date(t.shift.ends_at) : null;
    const ranLong = scheduledEnd && t.clock_out_at && new Date(t.clock_out_at).getTime() - scheduledEnd.getTime() > 15 * 60_000;
    return (
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-[220px]">
              <p className="font-medium">{t.worker?.full_name}</p>
              <p className="text-sm text-muted-foreground">
                {t.shift?.title} · {t.shift?.event?.name}
              </p>
              <p className="text-xs text-muted-foreground">{t.clock_in_at && format(new Date(t.clock_in_at), 'EEE MMM d')} · ${rateFor(t).toFixed(2)}/hr{t.assignment?.offered_rate != null && ' (negotiated)'}</p>
            </div>
            <div className="text-sm space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground w-8">In</span>
                <span>{t.clock_in_at ? format(new Date(t.clock_in_at), 'HH:mm') : '—'}</span>
                <Geo verified={t.clock_in_verified} distance={t.clock_in_distance_m} />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground w-8">Out</span>
                <span>{t.clock_out_at ? format(new Date(t.clock_out_at), 'HH:mm') : '—'}</span>
                {t.clock_out_at && <Geo verified={t.clock_out_verified} distance={t.clock_out_distance_m} />}
              </div>
              {ranLong && (
                <p className="text-xs text-amber-700 inline-flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" /> Ran past scheduled wrap — OT applied automatically
                </p>
              )}
            </div>
            {p && (
              <div className="text-sm">
                <div className="grid grid-cols-[auto_auto] gap-x-3 text-xs text-muted-foreground">
                  <span>Regular</span><span className="text-right">{p.regularHours.toFixed(2)} h</span>
                  {p.overtimeHours > 0 && <><span>Overtime</span><span className="text-right">{p.overtimeHours.toFixed(2)} h</span></>}
                  {p.doubletimeHours > 0 && <><span>Double time</span><span className="text-right">{p.doubletimeHours.toFixed(2)} h</span></>}
                  {p.minimumCallApplied && <span className="col-span-2 text-amber-700">Minimum call applied</span>}
                </div>
                <p className="font-semibold text-base mt-1">{money(t.status === 'approved' || t.status === 'paid' ? t.gross_pay : p.grossPay)}</p>
              </div>
            )}
            <div className="flex flex-col items-end gap-2">
              <Badge variant="outline" className={statusTone[t.status]}>{t.status}</Badge>
              {actions && t.clock_out_at && (
                <>
                  <div className="flex items-center gap-1 text-xs">
                    <span className="text-muted-foreground">Break</span>
                    <Input
                      type="number"
                      min={0}
                      className="h-7 w-16 text-xs"
                      value={breaks[t.id] ?? String(t.break_minutes)}
                      onChange={(e) => setBreaks({ ...breaks, [t.id]: e.target.value })}
                    />
                    <span className="text-muted-foreground">min</span>
                  </div>
                  <div className="flex gap-1">
                    <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => setDispute({ sheet: t, notes: '' })}>Dispute</Button>
                    <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => approve(t, 'ach')} title="Approve & pay via ACH (1–2 business days)">
                      <Landmark className="w-3.5 h-3.5 mr-1" /> ACH
                    </Button>
                    <Button size="sm" disabled={busy !== null} onClick={() => approve(t, 'instant')} title="Approve & release escrow instantly">
                      <Zap className="w-3.5 h-3.5 mr-1" /> Approve & pay
                    </Button>
                  </div>
                </>
              )}
            </div>
          </div>
          {t.worker_notes && <p className="text-xs text-muted-foreground mt-2 border-t pt-2">Crew note: {t.worker_notes}</p>}
          {t.manager_notes && <p className="text-xs text-red-600 dark:text-red-400 mt-1">Manager: {t.manager_notes}</p>}
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Timesheets</h1>
          <p className="text-sm text-muted-foreground">Geofenced clock records with automatic overtime. Approval releases escrow, issues the contractor invoice and starts the payout.</p>
        </div>
        <Card>
          <CardContent className="p-3 text-right">
            <p className="text-xs text-muted-foreground">Awaiting approval</p>
            <p className="text-lg font-semibold">{money(totalPending)}</p>
          </CardContent>
        </Card>
      </div>

      {sheets.loading ? (
        <Skeleton className="h-40 w-full" />
      ) : (
        <Tabs defaultValue="review">
          <TabsList>
            <TabsTrigger value="review">Needs review ({grouped.review.length})</TabsTrigger>
            <TabsTrigger value="live">On the clock ({grouped.live.length})</TabsTrigger>
            <TabsTrigger value="settled">Approved & paid ({grouped.settled.length})</TabsTrigger>
          </TabsList>
          <TabsContent value="review" className="space-y-3 mt-4">
            {grouped.review.length === 0 && (
              <p className="text-center text-muted-foreground py-10 text-sm inline-flex items-center gap-2 w-full justify-center">
                <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-400" /> All caught up.
              </p>
            )}
            {grouped.review.map((t) => <Row key={t.id} t={t} actions />)}
          </TabsContent>
          <TabsContent value="live" className="space-y-3 mt-4">
            {grouped.live.length === 0 && <p className="text-center text-muted-foreground py-10 text-sm">Nobody is clocked in right now.</p>}
            {grouped.live.map((t) => <Row key={t.id} t={t} />)}
          </TabsContent>
          <TabsContent value="settled" className="space-y-3 mt-4">
            {grouped.settled.map((t) => <Row key={t.id} t={t} />)}
          </TabsContent>
        </Tabs>
      )}

      <Dialog open={dispute !== null} onOpenChange={(o) => !o && setDispute(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Dispute timesheet</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">The worker will be notified and can respond. Nothing is paid until you approve.</p>
          <Textarea rows={3} placeholder="e.g. Clock-out shows 02:10 but load-out wrapped at 00:30" value={dispute?.notes ?? ''} onChange={(e) => dispute && setDispute({ ...dispute, notes: e.target.value })} />
          <Button variant="destructive" disabled={!dispute?.notes || busy !== null} onClick={submitDispute}>Flag for review</Button>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default TimesheetApprovalPage;
