import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { format, parseISO, isPast } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CalendarDays, KanbanSquare, Plus, Trash2, Zap } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useEvents, useMyCompany } from '@/hooks/useMarketplace';
import { OpsService } from '@/lib/ops/service';
import { StaffService } from '@/lib/staff/service';
import { OpsColumn, OpsPriority, OpsTask, StaffMember } from '@/lib/types';

const COLUMNS: { key: OpsColumn; label: string }[] = [
  { key: 'todo', label: 'To do' },
  { key: 'in_progress', label: 'In progress' },
  { key: 'done', label: 'Done' },
];

const PRIORITY_STYLE: Record<OpsPriority, string> = {
  urgent: 'bg-red-600 text-white',
  high: 'bg-orange-500 text-white',
  normal: 'bg-zinc-500 text-white',
  low: 'bg-zinc-400 text-white',
};

const OpsBoardPage: React.FC = () => {
  const { profile } = useAuth();
  const { company } = useMyCompany();
  const events = useEvents(company?.id);
  const [tasks, setTasks] = useState<OpsTask[]>([]);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [dragOver, setDragOver] = useState<OpsColumn | null>(null);
  const [form, setForm] = useState({ title: '', notes: '', priority: 'normal' as OpsPriority, event_id: '', assigned_staff_id: '', due_at: '' });
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    if (!company?.id) {
      setLoading(false);
      return;
    }
    // The board mirrors reality: sweep creates/resolves unfilled-call cards.
    const sweep = await OpsService.sweepUnfilled(company.id);
    if (sweep.data.created > 0) toast.info(`${sweep.data.created} unfilled-call card${sweep.data.created === 1 ? '' : 's'} added`);
    if (sweep.data.noShows > 0) toast.warning(`${sweep.data.noShows} no-show${sweep.data.noShows === 1 ? '' : 's'} flagged — backfill offers sent`);
    const { data, error } = await OpsService.listTasks(company.id);
    if (error) toast.error(error);
    setTasks(data);
    setLoading(false);
  }, [company?.id]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (company?.id) StaffService.listMembers(company.id).then(({ data }) => setStaff(data));
  }, [company?.id]);

  const byColumn = useMemo(() => {
    const map: Record<OpsColumn, OpsTask[]> = { todo: [], in_progress: [], done: [] };
    for (const t of tasks) map[t.column_key]?.push(t);
    const prio = (p: OpsPriority) => ({ urgent: 0, high: 1, normal: 2, low: 3 })[p];
    for (const col of COLUMNS) {
      map[col.key].sort((a, b) => prio(a.priority) - prio(b.priority) || a.sort_order - b.sort_order);
    }
    return map;
  }, [tasks]);

  const move = async (taskId: string, column: OpsColumn) => {
    const task = tasks.find((t) => t.id === taskId);
    if (!task || task.column_key === column) return;
    setTasks((ts) => ts.map((t) => (t.id === taskId ? { ...t, column_key: column, done_at: column === 'done' ? new Date().toISOString() : null } : t)));
    const { error } = await OpsService.moveTask(taskId, column);
    if (error) {
      toast.error(error);
      refresh();
    }
  };

  const createTask = async () => {
    if (!company?.id || !profile?.id || !form.title.trim()) {
      toast.error('Title is required');
      return;
    }
    setSaving(true);
    const { data, error } = await OpsService.createTask({
      company_id: company.id,
      created_by: profile.id,
      title: form.title.trim(),
      notes: form.notes.trim() || null,
      priority: form.priority,
      event_id: form.event_id || null,
      assigned_staff_id: form.assigned_staff_id || null,
      due_at: form.due_at ? new Date(form.due_at).toISOString() : null,
    });
    setSaving(false);
    if (error || !data) return toast.error(error ?? 'Could not add task');
    setTasks((ts) => [...ts, data]);
    setAddOpen(false);
    setForm({ title: '', notes: '', priority: 'normal', event_id: '', assigned_staff_id: '', due_at: '' });
  };

  const remove = async (t: OpsTask) => {
    setTasks((ts) => ts.filter((x) => x.id !== t.id));
    const { error } = await OpsService.deleteTask(t.id);
    if (error) {
      toast.error(error);
      refresh();
    }
  };

  const card = (t: OpsTask) => {
    const overdue = t.due_at && t.column_key !== 'done' && isPast(parseISO(t.due_at));
    return (
      <div
        key={t.id}
        draggable
        onDragStart={(e) => e.dataTransfer.setData('text/ops-task', t.id)}
        className={`rounded-md border bg-card p-3 space-y-1.5 cursor-grab active:cursor-grabbing group ${
          t.column_key === 'done' ? 'opacity-60' : ''
        } ${t.priority === 'urgent' && t.column_key !== 'done' ? 'border-red-500/60' : ''}`}
      >
        <div className="flex items-start justify-between gap-2">
          <div className={`text-sm font-medium leading-snug ${t.column_key === 'done' ? 'line-through' : ''}`}>{t.title}</div>
          <div className="flex items-center gap-1 shrink-0">
            {t.source === 'auto_unfilled' && (
              <Badge variant="outline" className="text-[10px] border-orange-500 text-orange-500">
                <Zap className="w-2.5 h-2.5 mr-0.5" /> auto
              </Badge>
            )}
            <Badge className={`${PRIORITY_STYLE[t.priority]} text-[10px]`}>{t.priority}</Badge>
            <Button
              size="sm"
              variant="ghost"
              className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100"
              onClick={() => remove(t)}
            >
              <Trash2 className="w-3.5 h-3.5 text-destructive" />
            </Button>
          </div>
        </div>
        {t.notes && <p className="text-xs text-muted-foreground whitespace-pre-wrap line-clamp-2">{t.notes}</p>}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
          {t.event && (
            <Link to={`/events/${t.event.id}`} className="text-primary hover:underline" onClick={(e) => e.stopPropagation()}>
              {t.event.name}
            </Link>
          )}
          {t.due_at && (
            <span className={`inline-flex items-center gap-1 ${overdue ? 'text-red-500 font-medium' : ''}`}>
              <CalendarDays className="w-3 h-3" />
              {format(parseISO(t.due_at), 'MMM d, h:mm a')}
              {overdue && ' — overdue'}
            </span>
          )}
          {t.assignee && <span>→ {t.assignee.full_name}</span>}
        </div>
      </div>
    );
  };

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <KanbanSquare className="w-6 h-6" /> Ops board
          </h1>
          <p className="text-sm text-muted-foreground">
            The office board — urgent cards for unfilled calls appear here on their own and resolve when the call fills.
          </p>
        </div>
        <Button onClick={() => setAddOpen(true)}>
          <Plus className="w-4 h-4 mr-1" /> Add task
        </Button>
      </div>

      {loading ? (
        <div className="grid grid-cols-3 gap-4">
          {COLUMNS.map((c) => (
            <Skeleton key={c.key} className="h-64 w-full" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
          {COLUMNS.map((col) => (
            <div
              key={col.key}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(col.key);
              }}
              onDragLeave={() => setDragOver((d) => (d === col.key ? null : d))}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(null);
                move(e.dataTransfer.getData('text/ops-task'), col.key);
              }}
              className={`rounded-lg border bg-accent/20 min-h-40 transition-colors ${dragOver === col.key ? 'border-primary bg-primary/5' : ''}`}
            >
              <div className="flex items-center justify-between px-3 py-2 border-b">
                <span className="text-sm font-medium">{col.label}</span>
                <Badge variant="outline" className="text-xs">{byColumn[col.key].length}</Badge>
              </div>
              <div className="p-2 space-y-2">
                {byColumn[col.key].map(card)}
                {!byColumn[col.key].length && (
                  <div className="text-xs text-muted-foreground text-center py-6">
                    {col.key === 'done' ? 'Nothing finished yet' : 'Drop a card here'}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add task</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="ot-title">Title</Label>
              <Input id="ot-title" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="Confirm dock access with venue" />
            </div>
            <div>
              <Label htmlFor="ot-notes">Notes</Label>
              <Textarea id="ot-notes" rows={2} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Priority</Label>
                <Select value={form.priority} onValueChange={(v) => setForm((f) => ({ ...f, priority: v as OpsPriority }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="urgent">Urgent</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="low">Low</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Event</Label>
                <Select value={form.event_id || 'none'} onValueChange={(v) => setForm((f) => ({ ...f, event_id: v === 'none' ? '' : v }))}>
                  <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No event</SelectItem>
                    {events.data?.map((e) => (
                      <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Assign to staff</Label>
                <Select value={form.assigned_staff_id || 'none'} onValueChange={(v) => setForm((f) => ({ ...f, assigned_staff_id: v === 'none' ? '' : v }))}>
                  <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Unassigned</SelectItem>
                    {staff.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.full_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="ot-due">Due</Label>
                <Input id="ot-due" type="datetime-local" value={form.due_at} onChange={(e) => setForm((f) => ({ ...f, due_at: e.target.value }))} />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setAddOpen(false)}>Cancel</Button>
              <Button onClick={createTask} disabled={saving}>{saving ? 'Adding…' : 'Add task'}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default OpsBoardPage;
