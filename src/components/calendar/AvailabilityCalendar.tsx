import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { CalendarDays, ChevronLeft, ChevronRight, Paintbrush, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import {
  AvailabilityDay,
  AvailabilityDayStatus,
  clearAvailabilityDay,
  fetchAvailabilityDays,
  setAvailabilityDay,
  usFederalHolidays,
} from '@/lib/availabilityDays';

// Year-at-a-glance availability calendar. Sits above the time-window editor on
// /availability: windows handle "8a–6p Tuesday", this handles "out Dec 24–Jan
// 2". One row per day in worker_availability_days; notes are worker-private.
//
// Two interaction modes:
//   browse/edit — click a day, set status + note in the editor card
//   paint      — pick a status once, then click days to stamp it (fastest way
//                to mark a vacation week or a string of personal dates)

const STATUS_META: Record<AvailabilityDayStatus, { label: string; cell: string; dot: string }> = {
  available: { label: 'Available', cell: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300', dot: 'bg-emerald-500' },
  unavailable: { label: 'Unavailable', cell: 'bg-red-500/15 text-red-700 dark:text-red-300', dot: 'bg-red-500' },
  tentative: { label: 'Tentative', cell: 'bg-amber-500/15 text-amber-700 dark:text-amber-300', dot: 'bg-amber-500' },
};

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const AvailabilityCalendar: React.FC = () => {
  const { profile } = useAuth();
  const [year, setYear] = useState(() => new Date().getFullYear());
  // 'year' shows all 12 months small; 'month' zooms into one month with
  // bigger cells so statuses are easy to read at a glance.
  const [view, setView] = useState<'year' | 'month'>('year');
  const [month, setMonth] = useState(() => new Date().getMonth());
  const [days, setDays] = useState<Map<string, AvailabilityDay>>(new Map());
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [paintMode, setPaintMode] = useState(false);
  const [paintStatus, setPaintStatus] = useState<AvailabilityDayStatus>('unavailable');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!profile?.id) return;
    setLoading(true);
    try {
      const map = await fetchAvailabilityDays(profile.id, `${year}-01-01`, `${year}-12-31`);
      setDays(map);
    } catch {
      toast.error('Could not load your availability calendar');
    } finally {
      setLoading(false);
    }
  }, [profile?.id, year]);

  useEffect(() => { load(); }, [load]);

  // Holiday names for tooltip/subtitle this year — holidays aren't stored as
  // rows until the worker confirms the preset, so they're computed, not fetched.
  const holidays = useMemo(() => new Map(usFederalHolidays(year).map((h) => [h.day, h.name])), [year]);

  const upsert = async (day: string, status: AvailabilityDayStatus, dayNote?: string | null) => {
    if (!profile?.id) return;
    setSaving(true);
    try {
      const rowId = await setAvailabilityDay(profile.id, day, status, dayNote);
      // Optimistic local update — refetch would flicker the whole grid.
      setDays((prev) => {
        const next = new Map(prev);
        const existing = next.get(day);
        next.set(day, {
          id: rowId,
          worker_id: profile.id,
          day,
          status,
          note: dayNote ?? existing?.note ?? null,
        });
        return next;
      });
      return true;
    } catch {
      toast.error('Could not save that day');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleDayClick = async (dayStr: string) => {
    if (paintMode) {
      // Paint keeps the day's existing note — stamping "unavailable" over
      // "sister's wedding" shouldn't erase why.
      const existing = days.get(dayStr);
      if (await upsert(dayStr, paintStatus, existing?.note)) {
        toast.success(`${format(new Date(dayStr + 'T12:00:00'), 'EEE, MMM d')} → ${STATUS_META[paintStatus].label.toLowerCase()}`);
      }
      return;
    }
    setSelected(dayStr);
    setNote(days.get(dayStr)?.note ?? '');
  };

  const saveSelected = async (status: AvailabilityDayStatus | null) => {
    if (!selected) return;
    if (status === null) {
      const row = days.get(selected);
      if (!row) return;
      setSaving(true);
      try {
        await clearAvailabilityDay(row.id);
      } catch {
        setSaving(false);
        return toast.error('Could not clear that day');
      }
      setSaving(false);
      setDays((prev) => { const n = new Map(prev); n.delete(selected); return n; });
      setSelected(null);
      toast.success('Day cleared');
      return;
    }
    if (await upsert(selected, status, note.trim() || null)) {
      setSelected(null);
      toast.success('Day saved');
    }
  };

  // Federal-holiday preset, both directions. "Mark" stamps every holiday not
  // already unavailable (existing notes/statuses are kept). "Restore" clears
  // only the rows this preset created — identified by an empty note or the
  // holiday's own name — so a worker's hand-marked "sister's wedding"
  // unavailable day is never deleted by the toggle.
  const holidayRows = usFederalHolidays(year);
  const holidayBlocked = holidayRows.filter((h) => days.get(h.day)?.status === 'unavailable').length;

  const toggleHolidays = async () => {
    if (holidayBlocked > 0) {
      // Restore: delete only preset-created rows (note empty or = holiday name)
      // so the day returns to the default "assumed available" state.
      let cleared = 0;
      for (const h of holidayRows) {
        const row = days.get(h.day);
        if (row?.status === 'unavailable' && (!row.note || row.note === h.name)) {
          try {
            await clearAvailabilityDay(row.id);
            setDays((prev) => { const n = new Map(prev); n.delete(h.day); return n; });
            cleared++;
          } catch { /* leave it; toast below reports the count */ }
        }
      }
      toast.success(cleared ? `Restored ${cleared} holiday${cleared === 1 ? '' : 's'} to available` : 'No preset holiday marks to restore');
      return;
    }
    const targets = holidayRows.filter((h) => days.get(h.day)?.status !== 'unavailable');
    if (!targets.length) return toast.info('All federal holidays already marked unavailable');
    let ok = 0;
    for (const h of targets) {
      // Keep an existing note ("maybe a gig") over the generic holiday name.
      if (await upsert(h.day, 'unavailable', days.get(h.day)?.note ?? h.name)) ok++;
    }
    toast.success(`Marked ${ok} federal holiday${ok === 1 ? '' : 's'} unavailable`);
  };

  const stepMonth = (delta: number) => {
    setMonth((m) => {
      const next = m + delta;
      if (next < 0) { setYear((y) => y - 1); return 11; }
      if (next > 11) { setYear((y) => y + 1); return 0; }
      return next;
    });
  };

  const todayStr = ymd(new Date());

  // One month grid — shared by the year-at-a-glance and the zoomed month
  // view; `large` bumps cell size/type for the single-month view.
  const monthGrid = (mi: number, large = false) => {
    const first = new Date(year, mi, 1);
    const daysInMonth = new Date(year, mi + 1, 0).getDate();
    const leadBlanks = first.getDay();
    const cells: (string | null)[] = [
      ...Array.from({ length: leadBlanks }, () => null),
      ...Array.from({ length: daysInMonth }, (_, i) => ymd(new Date(year, mi, i + 1))),
    ];
    return (
      <div className={large ? 'border border-border/60 rounded-lg p-3' : 'border border-border/60 rounded-lg p-2'}>
        {large && <p className="text-sm font-semibold text-foreground mb-2 px-1">{MONTHS[mi]} {year}</p>}
        <div className="grid grid-cols-7 gap-0.5 text-center">
          {WEEKDAYS.map((w) => (
            <span key={w} className={`${large ? 'text-xs' : 'text-[10px]'} text-muted-foreground/70 py-0.5`}>{w}</span>
          ))}
          {cells.map((dayStr, idx) => {
            if (!dayStr) return <span key={`b${idx}`} />;
            const row = days.get(dayStr);
            const isToday = dayStr === todayStr;
            const isHoliday = holidays.has(dayStr);
            const isSelected = dayStr === selected;
            const dayNum = Number(dayStr.slice(8));
            return (
              <button
                key={dayStr}
                type="button"
                onClick={() => handleDayClick(dayStr)}
                title={row?.note || (isHoliday ? holidays.get(dayStr) : undefined) || undefined}
                className={`relative ${large ? 'h-11 text-sm' : 'h-7 text-[11px]'} rounded-sm transition-colors ${
                  row ? STATUS_META[row.status].cell : 'hover:bg-accent'
                } ${isToday ? 'ring-1 ring-primary' : ''} ${isSelected ? 'ring-2 ring-foreground' : ''} ${
                  !row && isHoliday ? 'underline decoration-dotted decoration-amber-500/70' : ''
                }`}
              >
                {dayNum}
                {row?.note && <span className="absolute bottom-0.5 right-0.5 w-1 h-1 rounded-full bg-current opacity-70" />}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between flex-wrap gap-2">
          <span className="flex items-center">
            <CalendarDays className="h-5 w-5 mr-2" />
            Availability calendar
          </span>
          <div className="flex items-center gap-2">
            <div className="flex rounded-md border border-border overflow-hidden">
              {(['year', 'month'] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setView(v)}
                  className={`px-3 py-1 text-xs font-medium capitalize ${view === v ? 'bg-primary text-primary-foreground' : 'bg-transparent text-muted-foreground hover:bg-accent'}`}
                >
                  {v === 'year' ? 'Year' : 'Month'}
                </button>
              ))}
            </div>
            {view === 'year' ? (
              <>
                <Button variant="outline" size="sm" onClick={() => setYear((y) => y - 1)}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm font-semibold w-16 text-center">{year}</span>
                <Button variant="outline" size="sm" onClick={() => setYear((y) => y + 1)}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" size="sm" onClick={() => stepMonth(-1)}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="sm" onClick={() => stepMonth(1)}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </>
            )}
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={toggleHolidays} disabled={loading || saving}>
            {holidayBlocked > 0 ? 'Make holidays available again' : 'Mark federal holidays unavailable'}
          </Button>
          <Button
            variant={paintMode ? 'default' : 'outline'}
            size="sm"
            onClick={() => setPaintMode((p) => !p)}
          >
            <Paintbrush className="h-4 w-4 mr-1" />
            {paintMode ? 'Painting…' : 'Paint days'}
          </Button>
          {paintMode && (
            <div className="flex gap-1">
              {(Object.keys(STATUS_META) as AvailabilityDayStatus[]).map((s) => (
                <Button
                  key={s}
                  size="sm"
                  variant={paintStatus === s ? 'default' : 'outline'}
                  onClick={() => setPaintStatus(s)}
                >
                  <span className={`inline-block w-2 h-2 rounded-full mr-1 ${STATUS_META[s].dot}`} />
                  {STATUS_META[s].label}
                </Button>
              ))}
            </div>
          )}
        </div>

        {paintMode && (
          <p className="text-xs text-muted-foreground">
            Click any day to stamp it {STATUS_META[paintStatus].label.toLowerCase()}. Notes are kept — use a day's editor to add the reason.
          </p>
        )}

        {loading ? (
          <p className="text-sm text-muted-foreground py-8 text-center">Loading your calendar…</p>
        ) : view === 'month' ? (
          <div className="max-w-md mx-auto">{monthGrid(month, true)}</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {MONTHS.map((monthName, mi) => (
              <div key={monthName}>
                <p className="text-xs font-semibold text-muted-foreground mb-1 px-1">{monthName}</p>
                {monthGrid(mi)}
              </div>
            ))}
          </div>
        )}

        {/* Selected-day editor */}
        {selected && (
          <div className="border border-border/60 rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">
                {format(new Date(selected + 'T12:00:00'), 'EEEE, MMMM d, yyyy')}
                {holidays.has(selected) && (
                  <Badge variant="outline" className="ml-2 text-[10px]">{holidays.get(selected)}</Badge>
                )}
              </p>
              <Button variant="ghost" size="sm" onClick={() => setSelected(null)}>Close</Button>
            </div>
            {days.get(selected)?.note && (
              <p className="text-xs text-muted-foreground">Current note: {days.get(selected)!.note}</p>
            )}
            <Input
              placeholder="Why? e.g. sister's wedding, doctor's appointment, vacation"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <div className="flex flex-wrap gap-2">
              {(Object.keys(STATUS_META) as AvailabilityDayStatus[]).map((s) => (
                <Button key={s} size="sm" variant="outline" disabled={saving} onClick={() => saveSelected(s)}>
                  <span className={`inline-block w-2 h-2 rounded-full mr-1.5 ${STATUS_META[s].dot}`} />
                  {STATUS_META[s].label}
                </Button>
              ))}
              {days.get(selected) && (
                <Button size="sm" variant="ghost" disabled={saving} onClick={() => saveSelected(null)}>
                  <Trash2 className="h-4 w-4 mr-1" /> Clear
                </Button>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground">
              Notes are private to you — companies only see that a day is blocked, never the reason.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default AvailabilityCalendar;
