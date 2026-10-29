import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { format, parseISO } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ChevronDown, ChevronRight, Mail, Megaphone, Send, Users } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useEvents, useMyCompany } from '@/hooks/useMarketplace';
import { supabase } from '@/lib/supabase';
import { BroadcastService } from '@/lib/broadcast/service';
import { Broadcast, BroadcastAudience, BroadcastRecipient } from '@/lib/types';

const AUDIENCE_LABELS: Record<BroadcastAudience, string> = {
  all: 'Whole roster + staff',
  event: 'Everyone on an event',
  shift: 'Crew on one call',
};

interface ShiftOption {
  id: string;
  title: string;
  event_id: string;
}

const BroadcastPage: React.FC = () => {
  const { profile } = useAuth();
  const { company } = useMyCompany();
  const events = useEvents(company?.id);
  const [params] = useSearchParams();

  const [audience, setAudience] = useState<BroadcastAudience>((params.get('audience') as BroadcastAudience) || 'all');
  const [eventId, setEventId] = useState(params.get('event_id') ?? '');
  const [shiftId, setShiftId] = useState(params.get('shift_id') ?? '');
  const [includeStaff, setIncludeStaff] = useState(true);
  const [subject, setSubject] = useState(params.get('subject') ?? '');
  const [body, setBody] = useState(params.get('body') ?? '');
  const [shifts, setShifts] = useState<ShiftOption[]>([]);
  const [preview, setPreview] = useState<{ workers: number; staff: number; names: string[]; total: number } | null>(null);
  const [sending, setSending] = useState(false);
  const [history, setHistory] = useState<Broadcast[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [recipients, setRecipients] = useState<BroadcastRecipient[]>([]);

  // Calls for the shift picker — only needed when targeting a call.
  useEffect(() => {
    if (audience !== 'shift' || !events.data?.length) return;
    const ids = events.data.map((e) => e.id);
    supabase
      .from('shifts')
      .select('id, title, event_id')
      .in('event_id', ids)
      .order('starts_at')
      .limit(200)
      .then(({ data }) => setShifts((data ?? []) as ShiftOption[]));
  }, [audience, events.data]);

  // Live preview — same server-side resolver the send uses.
  useEffect(() => {
    if (!company?.id) return;
    if (audience === 'event' && !eventId) return setPreview(null);
    if (audience === 'shift' && !shiftId) return setPreview(null);
    let cancelled = false;
    const t = setTimeout(async () => {
      const { data, error } = await BroadcastService.previewAudience(
        { audience, event_id: eventId || null, shift_id: shiftId || null, include_staff: includeStaff },
        company.id,
      );
      if (cancelled) return;
      if (error) {
        setPreview(null);
      } else {
        setPreview({
          workers: data.workers.length,
          staff: data.staff.length,
          names: [...data.workers, ...data.staff].map((p) => p.name).slice(0, 6),
          total: data.total,
        });
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [company?.id, audience, eventId, shiftId, includeStaff]);

  const refresh = useCallback(async () => {
    if (!company?.id) {
      setLoadingHistory(false);
      return;
    }
    const { data, error } = await BroadcastService.list(company.id);
    if (error) toast.error(error);
    setHistory(data);
    setLoadingHistory(false);
  }, [company?.id]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const canSend = useMemo(
    () => body.trim().length > 0 && !!preview?.total && !sending,
    [body, preview, sending],
  );

  const send = async () => {
    if (!company?.id || !profile?.id || !canSend) return;
    setSending(true);
    const { data, error } = await BroadcastService.createAndSend(company.id, profile.id, {
      subject,
      body: body.trim(),
      audience,
      event_id: eventId || null,
      shift_id: shiftId || null,
      include_staff: includeStaff,
    });
    setSending(false);
    if (error || !data) return toast.error(error ?? 'Send failed');
    toast.success(`Broadcast sent — ${data.recipient_count} recipient${data.recipient_count === 1 ? '' : 's'}`);
    setBody('');
    setSubject('');
    refresh();
  };

  const toggleExpand = async (id: string) => {
    if (expanded === id) return setExpanded(null);
    setExpanded(id);
    const { data, error } = await BroadcastService.recipients(id);
    if (error) toast.error(error);
    setRecipients(data);
  };

  const eventName = (b: Broadcast) => events.data?.find((e) => e.id === b.event_id)?.name;
  const shiftName = (b: Broadcast) => shifts.find((s) => s.id === b.shift_id)?.title ?? b.shift_id?.slice(0, 8);

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Megaphone className="w-6 h-6" /> Broadcast
        </h1>
        <p className="text-sm text-muted-foreground">
          One message to a call's crew, everyone on an event, or the whole company — workers get it in-app, staff queue for email.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Compose</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label>Audience</Label>
                <Select value={audience} onValueChange={(v) => setAudience(v as BroadcastAudience)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{AUDIENCE_LABELS.all}</SelectItem>
                    <SelectItem value="event">{AUDIENCE_LABELS.event}</SelectItem>
                    <SelectItem value="shift">{AUDIENCE_LABELS.shift}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {audience !== 'all' && (
                <div>
                  <Label>Event</Label>
                  <Select value={eventId} onValueChange={setEventId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Pick an event…" />
                    </SelectTrigger>
                    <SelectContent>
                      {events.data?.map((e) => (
                        <SelectItem key={e.id} value={e.id}>
                          {e.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {audience === 'shift' && (
                <div>
                  <Label>Call</Label>
                  <Select value={shiftId} onValueChange={setShiftId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Pick a call…" />
                    </SelectTrigger>
                    <SelectContent>
                      {shifts
                        .filter((s) => !eventId || s.event_id === eventId)
                        .map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.title}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            <label className="flex items-center gap-2 text-sm">
              <Switch checked={includeStaff} onCheckedChange={setIncludeStaff} />
              Include internal staff
            </label>

            <div>
              <Label htmlFor="bc-subject">Subject (optional)</Label>
              <Input id="bc-subject" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Call time update" />
            </div>
            <div>
              <Label htmlFor="bc-body">Message</Label>
              <Textarea
                id="bc-body"
                rows={4}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Call time for tomorrow's load-in moved to 7am — dock door 3."
              />
            </div>
          </CardContent>
        </Card>

        <Card className="lg:sticky lg:top-20">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="w-4 h-4" /> Preview
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {preview ? (
              <>
                <div className="text-2xl font-semibold">{preview.total}</div>
                <div className="text-xs text-muted-foreground">
                  {preview.workers} crew in-app{includeStaff ? ` · ${preview.staff} staff` : ''}
                </div>
                {preview.names.length > 0 && (
                  <div className="text-xs text-muted-foreground">
                    {preview.names.join(', ')}
                    {preview.total > preview.names.length ? `, +${preview.total - preview.names.length} more` : ''}
                  </div>
                )}
              </>
            ) : (
              <p className="text-xs text-muted-foreground">
                {audience === 'event' && !eventId
                  ? 'Pick an event to preview the audience.'
                  : audience === 'shift' && !shiftId
                    ? 'Pick a call to preview the audience.'
                    : 'Nobody matches that audience yet.'}
              </p>
            )}
            <Button className="w-full" onClick={send} disabled={!canSend}>
              {sending ? 'Sending…' : (
                <>
                  <Send className="w-4 h-4 mr-2" /> Send broadcast
                </>
              )}
            </Button>
            <p className="text-[10px] text-muted-foreground">
              Workers are notified in-app immediately. Staff without a Flexzora account queue for email delivery.
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">History</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loadingHistory ? (
            <div className="p-4 space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : history.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">Nothing sent yet.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8" />
                  <TableHead>Message</TableHead>
                  <TableHead>Audience</TableHead>
                  <TableHead>Recipients</TableHead>
                  <TableHead>Sent</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.map((b) => (
                  <React.Fragment key={b.id}>
                    <TableRow className="cursor-pointer" onClick={() => toggleExpand(b.id)}>
                      <TableCell>{expanded === b.id ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}</TableCell>
                      <TableCell>
                        <div className="text-sm font-medium">{b.subject || 'Broadcast'}</div>
                        <div className="text-xs text-muted-foreground line-clamp-1">{b.body}</div>
                      </TableCell>
                      <TableCell className="text-xs">
                        {AUDIENCE_LABELS[b.audience]}
                        {b.audience === 'event' && eventName(b) && <div className="text-muted-foreground">{eventName(b)}</div>}
                        {b.audience === 'shift' && <div className="text-muted-foreground">{shiftName(b)}</div>}
                      </TableCell>
                      <TableCell>{b.recipient_count}</TableCell>
                      <TableCell className="text-xs">{b.sent_at ? format(parseISO(b.sent_at), 'MMM d, h:mm a') : '—'}</TableCell>
                      <TableCell>
                        <Badge className={b.status === 'sent' ? 'bg-green-600' : b.status === 'failed' ? 'bg-red-600' : 'bg-zinc-500'}>
                          {b.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                    {expanded === b.id && (
                      <TableRow>
                        <TableCell colSpan={6} className="bg-accent/20">
                          <div className="px-4 py-2 space-y-1">
                            {recipients.map((r) => (
                              <div key={r.id} className="flex items-center gap-3 text-xs">
                                {r.channel === 'email' ? <Mail className="w-3.5 h-3.5" /> : <Megaphone className="w-3.5 h-3.5" />}
                                <span className="font-medium">{r.worker_name ?? r.staff_name ?? '—'}</span>
                                <Badge variant="outline" className="text-[10px]">{r.channel}</Badge>
                                <Badge
                                  variant="outline"
                                  className={`text-[10px] ${r.status === 'sent' ? 'border-green-600 text-green-600' : r.status === 'failed' ? 'border-red-600 text-red-600' : ''}`}
                                >
                                  {r.status}
                                </Badge>
                                {r.error && <span className="text-muted-foreground italic">{r.error}</span>}
                              </div>
                            ))}
                            {!recipients.length && <div className="text-xs text-muted-foreground">Loading…</div>}
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </React.Fragment>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default BroadcastPage;
