// Staff on an event — the internal-team half of the crew+staff picture.
// Marketplace crew fill shifts; staff hold the event together (PM, site lead,
// FOH manager). Both show up here so the manager sees everybody working.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { format, parseISO } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CheckCheck, Clock, Trash2, UserPlus, UserRound, X } from 'lucide-react';
import { StaffService } from '@/lib/staff/service';
import { StaffAssignment, StaffMember } from '@/lib/types';

interface Props {
  eventId: string;
  companyId: string;
}

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  assigned: { label: 'assigned', cls: 'bg-blue-600' },
  confirmed: { label: 'confirmed', cls: 'bg-green-600' },
  declined: { label: 'declined', cls: 'bg-zinc-500' },
};

const StaffPanel: React.FC<Props> = ({ eventId, companyId }) => {
  const [assignments, setAssignments] = useState<StaffAssignment[]>([]);
  const [members, setMembers] = useState<StaffMember[]>([]);
  const [adding, setAdding] = useState(false);
  const [staffId, setStaffId] = useState('');
  const [roleLabel, setRoleLabel] = useState('');
  const [callTime, setCallTime] = useState('');
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const [a, m] = await Promise.all([
      StaffService.listEventStaff(eventId),
      StaffService.listMembers(companyId),
    ]);
    if (a.error) toast.error(a.error);
    if (m.error) toast.error(m.error);
    setAssignments(a.data);
    setMembers(m.data);
  }, [eventId, companyId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const assignedIds = useMemo(() => new Set(assignments.map((a) => a.staff_id)), [assignments]);
  const available = useMemo(() => members.filter((m) => !assignedIds.has(m.id)), [members, assignedIds]);

  const add = async () => {
    if (!staffId) return;
    setBusy(true);
    const { data, error } = await StaffService.assignToEvent({
      company_id: companyId,
      staff_id: staffId,
      event_id: eventId,
      role_label: roleLabel.trim() || null,
      call_time: callTime ? new Date(callTime).toISOString() : null,
    });
    setBusy(false);
    if (error) return toast.error(error);
    setAssignments((as) => [...as, data!]);
    setAdding(false);
    setStaffId('');
    setRoleLabel('');
    setCallTime('');
    toast.success('Staff assigned');
  };

  const setStatus = async (a: StaffAssignment, status: StaffAssignment['status']) => {
    const { error } = await StaffService.updateAssignment(a.id, { status });
    if (error) return toast.error(error);
    setAssignments((as) => as.map((x) => (x.id === a.id ? { ...x, status } : x)));
  };

  const remove = async (a: StaffAssignment) => {
    const { error } = await StaffService.removeAssignment(a.id);
    if (error) return toast.error(error);
    setAssignments((as) => as.filter((x) => x.id !== a.id));
  };

  return (
    <div className="space-y-3">
      {assignments.length === 0 && !adding && (
        <p className="text-sm text-muted-foreground">
          No internal staff on this event yet — assign your PM, site lead, or coordinators.
        </p>
      )}

      {assignments.length > 0 && (
        <div className="divide-y border rounded-md">
          {assignments.map((a) => (
            <div key={a.id} className="flex items-center gap-3 px-3 py-2.5 group">
              <UserRound className="w-4 h-4 text-muted-foreground shrink-0" />
              <div className="min-w-0 flex-1">
                <span className="text-sm font-medium">{a.member?.full_name ?? '—'}</span>
                {a.role_label && <span className="text-xs text-muted-foreground"> · {a.role_label}</span>}
                {a.call_time && (
                  <span className="text-xs text-muted-foreground inline-flex items-center gap-1 ml-2">
                    <Clock className="w-3 h-3" /> {format(parseISO(a.call_time), 'EEE MMM d, h:mm a')}
                  </span>
                )}
              </div>
              <Badge className={`${STATUS_BADGE[a.status]?.cls ?? 'bg-zinc-500'} text-xs`}>{a.status}</Badge>
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                {a.status !== 'confirmed' && (
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0" title="Confirm" onClick={() => setStatus(a, 'confirmed')}>
                    <CheckCheck className="w-3.5 h-3.5 text-green-600" />
                  </Button>
                )}
                {a.status !== 'declined' && (
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0" title="Declined" onClick={() => setStatus(a, 'declined')}>
                    <X className="w-3.5 h-3.5" />
                  </Button>
                )}
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0" title="Remove" onClick={() => remove(a)}>
                  <Trash2 className="w-3.5 h-3.5 text-destructive" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {adding ? (
        <div className="border rounded-md p-3 space-y-2 bg-accent/20">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <Select value={staffId} onValueChange={setStaffId}>
              <SelectTrigger>
                <SelectValue placeholder="Staff member…" />
              </SelectTrigger>
              <SelectContent>
                {available.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.full_name}{m.title ? ` — ${m.title}` : ''}
                  </SelectItem>
                ))}
                {!available.length && <SelectItem value="__none" disabled>Everyone is assigned</SelectItem>}
              </SelectContent>
            </Select>
            <Input placeholder="Role on event (PM, Site lead…)" value={roleLabel} onChange={(e) => setRoleLabel(e.target.value)} />
            <Input type="datetime-local" value={callTime} onChange={(e) => setCallTime(e.target.value)} title="Call time (optional)" />
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={add} disabled={!staffId || busy}>
              {busy ? 'Assigning…' : 'Assign'}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <Button size="sm" variant="outline" onClick={() => setAdding(true)} disabled={!members.length}>
          <UserPlus className="w-3.5 h-3.5 mr-1" /> Assign staff
        </Button>
      )}
      {!members.length && (
        <p className="text-xs text-muted-foreground">
          No staff members yet — add them on the Staff page or import a staff sheet.
        </p>
      )}
    </div>
  );
};

export default StaffPanel;
