// Calendar feeds — capability URLs anyone can subscribe to: whole company,
// one event, one staff member, or one crew worker's confirmed calls.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { format, parseISO } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { CalendarDays, CheckCheck, ClipboardCopy, Plus } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { CalendarFeedService } from '@/lib/calendar/service';
import { StaffService } from '@/lib/staff/service';
import { CalendarFeed, CalendarFeedScope, ProductionEvent, StaffMember } from '@/lib/types';

interface Props {
  companyId: string;
  profileId: string;
  events: ProductionEvent[];
}

const SCOPE_LABELS: Record<CalendarFeedScope, string> = {
  company: 'Whole company',
  event: 'One event',
  staff: 'One staff member',
  worker: 'One crew member',
};

const FeedManager: React.FC<Props> = ({ companyId, profileId, events }) => {
  const [feeds, setFeeds] = useState<CalendarFeed[]>([]);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [workers, setWorkers] = useState<{ id: string; name: string }[]>([]);
  const [scope, setScope] = useState<CalendarFeedScope>('company');
  const [eventId, setEventId] = useState('');
  const [staffId, setStaffId] = useState('');
  const [workerId, setWorkerId] = useState('');
  const [label, setLabel] = useState('');
  const [creating, setCreating] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const { data, error } = await CalendarFeedService.list(companyId);
    if (error) toast.error(error);
    setFeeds(data);
  }, [companyId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Lazy-load pickers when the scope needs them.
  useEffect(() => {
    if (scope === 'staff' && !staff.length) {
      StaffService.listMembers(companyId).then(({ data }) => setStaff(data));
    }
    if (scope === 'worker' && !workers.length) {
      supabase
        .from('preferred_rosters')
        .select('worker_id, worker:profiles(full_name)')
        .eq('company_id', companyId)
        .then(({ data }) => {
          setWorkers(
            ((data ?? []) as { worker_id: string; worker?: { full_name: string } | null }[]).map((r) => ({
              id: r.worker_id,
              name: r.worker?.full_name ?? r.worker_id.slice(0, 8),
            })),
          );
        });
    }
  }, [scope, companyId, staff.length, workers.length]);

  const canCreate = useMemo(
    () =>
      scope === 'company' ||
      (scope === 'event' && !!eventId) ||
      (scope === 'staff' && !!staffId) ||
      (scope === 'worker' && !!workerId),
    [scope, eventId, staffId, workerId],
  );

  const create = async () => {
    if (!canCreate) return;
    setCreating(true);
    const { data, error } = await CalendarFeedService.create({
      company_id: companyId,
      created_by: profileId,
      scope,
      event_id: eventId || undefined,
      staff_id: staffId || undefined,
      worker_id: workerId || undefined,
      label: label || undefined,
    });
    setCreating(false);
    if (error || !data) return toast.error(error ?? 'Could not create feed');
    setFeeds((f) => [data, ...f]);
    setLabel('');
    toast.success('Feed created — copy the URL into any calendar app');
  };

  const copy = async (feed: CalendarFeed) => {
    try {
      await navigator.clipboard.writeText(CalendarFeedService.feedUrl(feed));
      setCopied(feed.id);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      toast.error('Copy failed — select the URL manually');
    }
  };

  const setActive = async (feed: CalendarFeed, active: boolean) => {
    const { error } = await CalendarFeedService.setActive(feed.id, active);
    if (error) return toast.error(error);
    setFeeds((fs) => fs.map((x) => (x.id === feed.id ? { ...x, is_active: active } : x)));
  };

  const describe = (f: CalendarFeed) => {
    const parts: string[] = [SCOPE_LABELS[f.scope]];
    if (f.event_id) parts.push(events.find((e) => e.id === f.event_id)?.name ?? 'event');
    if (f.staff_id) parts.push(staff.find((s) => s.id === f.staff_id)?.full_name ?? 'staff');
    if (f.worker_id) parts.push(workers.find((w) => w.id === f.worker_id)?.name ?? 'crew');
    return parts.join(' · ');
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2 border rounded-md p-3 bg-accent/20">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div>
            <Label>Feed scope</Label>
            <Select value={scope} onValueChange={(v) => setScope(v as CalendarFeedScope)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(SCOPE_LABELS) as CalendarFeedScope[]).map((s) => (
                  <SelectItem key={s} value={s}>
                    {SCOPE_LABELS[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {scope === 'event' && (
            <div>
              <Label>Event</Label>
              <Select value={eventId} onValueChange={setEventId}>
                <SelectTrigger>
                  <SelectValue placeholder="Pick an event…" />
                </SelectTrigger>
                <SelectContent>
                  {events.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {scope === 'staff' && (
            <div>
              <Label>Staff member</Label>
              <Select value={staffId} onValueChange={setStaffId}>
                <SelectTrigger>
                  <SelectValue placeholder="Pick a member…" />
                </SelectTrigger>
                <SelectContent>
                  {staff.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {scope === 'worker' && (
            <div>
              <Label>Crew member</Label>
              <Select value={workerId} onValueChange={setWorkerId}>
                <SelectTrigger>
                  <SelectValue placeholder="Pick a roster member…" />
                </SelectTrigger>
                <SelectContent>
                  {workers.map((w) => (
                    <SelectItem key={w.id} value={w.id}>
                      {w.name}
                    </SelectItem>
                  ))}
                  {!workers.length && <SelectItem value="__none" disabled>No roster members</SelectItem>}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className={scope === 'company' ? 'sm:col-span-1' : ''}>
            <Label>Label (optional)</Label>
            <Input placeholder="e.g. PM calendar" value={label} onChange={(e) => setLabel(e.target.value)} />
          </div>
        </div>
        <Button size="sm" onClick={create} disabled={!canCreate || creating}>
          <Plus className="w-3.5 h-3.5 mr-1" /> {creating ? 'Creating…' : 'Create feed'}
        </Button>
      </div>

      {feeds.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-4">
          No feeds yet — create one and subscribe from Google Calendar, Apple Calendar, or Outlook.
        </p>
      ) : (
        <div className="divide-y border rounded-md">
          {feeds.map((f) => (
            <div key={f.id} className="px-3 py-2.5 space-y-1.5">
              <div className="flex items-center gap-2">
                <CalendarDays className="w-4 h-4 text-muted-foreground shrink-0" />
                <span className="text-sm font-medium">{f.label ?? describe(f)}</span>
                <Badge variant="outline" className="text-[10px]">{f.scope}</Badge>
                {!f.is_active && <Badge variant="outline" className="text-[10px] border-red-500 text-red-500">revoked</Badge>}
                <span className="flex-1" />
                <Switch checked={f.is_active} onCheckedChange={(v) => setActive(f, v)} />
              </div>
              <div className="flex items-center gap-2">
                <Input readOnly value={CalendarFeedService.feedUrl(f)} className="text-[10px] h-7 font-mono" />
                <Button size="sm" variant="outline" className="h-7 shrink-0" onClick={() => copy(f)}>
                  {copied === f.id ? <CheckCheck className="w-3.5 h-3.5" /> : <ClipboardCopy className="w-3.5 h-3.5" />}
                </Button>
              </div>
              <div className="text-[10px] text-muted-foreground">
                {describe(f)} · created {format(parseISO(f.created_at), 'MMM d')}
                {f.last_accessed_at && ` · last fetched ${format(parseISO(f.last_accessed_at), 'MMM d, h:mm a')}`}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default FeedManager;
