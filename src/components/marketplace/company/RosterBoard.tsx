import React, { useMemo } from 'react';
import { eachDayOfInterval, format, isSameDay, parseISO } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { ProductionEvent, Shift } from '@/lib/types';
import { Clock, Users } from 'lucide-react';
import { confirmedCount } from '../format';

interface Props {
  event: ProductionEvent;
  selectedShiftId?: string | null;
  onSelectShift: (shift: Shift) => void;
}

const stageLabel: Record<Shift['broadcast_stage'], string> = { none: 'Draft', roster: 'Roster only', public: 'Public' };

const fillTone = (confirmed: number, headcount: number) => {
  if (confirmed >= headcount) return 'border-green-500/40 bg-green-500/10';
  if (confirmed > 0) return 'border-amber-300 bg-amber-50';
  return 'border-border bg-card';
};

/** Multi-lane schedule: one column per event day, one card per call. */
const RosterBoard: React.FC<Props> = ({ event, selectedShiftId, onSelectShift }) => {
  const days = useMemo(
    () => eachDayOfInterval({ start: parseISO(event.starts_on), end: parseISO(event.ends_on) }),
    [event.starts_on, event.ends_on],
  );
  const shifts = event.shifts ?? [];

  return (
    <div className="overflow-x-auto">
      <div className="flex gap-3 min-w-max pb-2">
        {days.map((day) => {
          const dayShifts = shifts
            .filter((s) => isSameDay(new Date(s.starts_at), day))
            .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
          const required = dayShifts.reduce((n, s) => n + s.headcount, 0);
          const filled = dayShifts.reduce((n, s) => n + confirmedCount(s), 0);
          return (
            <div key={day.toISOString()} className="w-64 flex-shrink-0">
              <div className="flex items-center justify-between mb-2 px-1">
                <div>
                  <p className="text-sm font-semibold">{format(day, 'EEE, MMM d')}</p>
                  <p className="text-xs text-muted-foreground">{dayShifts.length} call{dayShifts.length === 1 ? '' : 's'}</p>
                </div>
                <Badge variant="outline" className="text-xs">
                  <Users className="w-3 h-3 mr-1" />
                  {filled}/{required}
                </Badge>
              </div>
              <div className="space-y-2 min-h-[120px] rounded-md bg-muted/50 p-2 border border-dashed">
                {dayShifts.length === 0 && <p className="text-xs text-muted-foreground/70 text-center py-6">No calls</p>}
                {dayShifts.map((shift) => {
                  const confirmed = confirmedCount(shift);
                  const pending = (shift.assignments ?? []).filter((a) => a.status === 'applied' || a.status === 'offered').length;
                  return (
                    <button
                      type="button"
                      key={shift.id}
                      onClick={() => onSelectShift(shift)}
                      className={`w-full text-left rounded-md border p-2.5 shadow-sm transition ${fillTone(confirmed, shift.headcount)} ${selectedShiftId === shift.id ? 'ring-2 ring-primary' : 'hover:shadow'}`}
                      style={{ borderLeftWidth: 4, borderLeftColor: event.color }}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-medium leading-tight">{shift.title}</p>
                        <span className="text-xs font-semibold whitespace-nowrap">
                          {confirmed}/{shift.headcount}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{shift.role_name}</p>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                        <Clock className="w-3 h-3" />
                        {format(new Date(shift.starts_at), 'HH:mm')}–{format(new Date(shift.ends_at), 'HH:mm')} · ${Number(shift.hourly_rate).toFixed(0)}/hr
                      </div>
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{stageLabel[shift.broadcast_stage]}</Badge>
                        {pending > 0 && <Badge variant="outline" className="text-[10px] px-1.5 py-0">{pending} pending</Badge>}
                        {shift.required_cert_codes.map((c) => (
                          <Badge key={c} variant="outline" className="text-[10px] px-1.5 py-0 border-amber-300 text-amber-800">{c.replace(/_/g, ' ')}</Badge>
                        ))}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default RosterBoard;
