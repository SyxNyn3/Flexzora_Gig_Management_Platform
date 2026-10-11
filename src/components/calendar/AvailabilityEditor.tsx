import React, { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Calendar, Clock, Plus, Trash2, CheckCircle, XCircle, RefreshCw, Link2 } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { useAvailability } from '@/hooks/useSupabaseQuery';
import { DatabaseService } from '@/lib/supabase';
import { CalendarImportService } from '@/lib/calendar/service';
import { CalendarImport } from '@/lib/types';

const AvailabilityEditor: React.FC = () => {
  const { profile } = useAuth();
  const { data: windows = [], loading, refetch } = useAvailability(profile?.id);

  useEffect(() => {
    if (!profile?.id) return;
    CalendarImportService.list(profile.id).then(({ data }) => setImports(data));
  }, [profile?.id]);

  const addImport = async () => {
    if (!profile?.id || !feedUrl.trim()) return;
    if (!/^(https?|webcal):\/\//i.test(feedUrl.trim())) {
      toast.error('Paste an https:// or webcal:// calendar URL');
      return;
    }
    setSaving(true);
    const { data, error } = await CalendarImportService.add(profile.id, feedName || 'Personal calendar', feedUrl);
    setSaving(false);
    if (error) return toast.error(error);
    setFeedName('');
    setFeedUrl('');
    if (data) {
      setImports((prev) => [...prev, data]);
      toast.success('Calendar added — syncing now');
      syncImport(data.id);
    }
  };

  const syncImport = async (id: string) => {
    setSyncing(id);
    const { data, error } = await CalendarImportService.syncNow(id);
    setSyncing(null);
    if (error) {
      toast.error(`Sync failed: ${error}`);
    } else {
      toast.success(`Synced — ${data} busy block${data === 1 ? '' : 's'} imported`);
    }
    const { data: refreshed } = await CalendarImportService.list(profile?.id ?? '');
    setImports(refreshed);
    refetch();
  };

  const removeImport = async (id: string) => {
    const { error } = await CalendarImportService.remove(id);
    if (error) return toast.error(error);
    setImports((prev) => prev.filter((i) => i.id !== id));
    refetch();
    toast.success('Calendar removed — its busy blocks were cleared');
  };

  const [startDate, setStartDate] = useState('');
  const [startTime, setStartTime] = useState('08:00');
  const [endDate, setEndDate] = useState('');
  const [endTime, setEndTime] = useState('18:00');
  const [isAvailable, setIsAvailable] = useState(false);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [imports, setImports] = useState<CalendarImport[]>([]);
  const [feedName, setFeedName] = useState('');
  const [feedUrl, setFeedUrl] = useState('');
  const [syncing, setSyncing] = useState<string | null>(null);

  const upcoming = useMemo(
    () => (windows ?? [])
      .filter(w => new Date(w.end_time) >= new Date(new Date().toDateString()))
      .sort((a, b) => +new Date(a.start_time) - +new Date(b.start_time)),
    [windows]
  );

  const addWindow = async () => {
    if (!profile?.id || !startDate || !endDate) {
      toast.error('Pick a start and end date');
      return;
    }
    const start = new Date(`${startDate}T${startTime}`);
    const end = new Date(`${endDate}T${endTime}`);
    if (end <= start) {
      toast.error('End must be after start');
      return;
    }
    setSaving(true);
    const { error } = await DatabaseService.addAvailability({
      worker_id: profile.id,
      start_time: start.toISOString(),
      end_time: end.toISOString(),
      is_available: isAvailable,
      notes: notes || undefined,
    });
    setSaving(false);
    if (error) {
      toast.error(error);
      return;
    }
    toast.success(isAvailable ? 'Available window added' : 'Blocked window added');
    setNotes('');
    refetch();
  };

  const removeWindow = async (id: string) => {
    const { error } = await DatabaseService.deleteAvailability(id);
    if (error) {
      toast.error(error);
      return;
    }
    refetch();
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Availability</h1>
        <p className="text-muted-foreground mt-1">
          Mark when you can work and when you're blocked — companies and the conflict checker use these windows when booking you.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Plus className="h-5 w-5 mr-2" />
            Add a window
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="start-date">Start date</Label>
              <Input id="start-date" type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="start-time">Start time</Label>
              <Input id="start-time" type="time" value={startTime} onChange={e => setStartTime(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="end-date">End date</Label>
              <Input id="end-date" type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="end-time">End time</Label>
              <Input id="end-time" type="time" value={endTime} onChange={e => setEndTime(e.target.value)} />
            </div>
          </div>

          <div className="flex items-center space-x-3">
            <Switch id="available" checked={isAvailable} onCheckedChange={setIsAvailable} />
            <Label htmlFor="available" className="cursor-pointer">
              {isAvailable ? 'Available — I can take calls in this window' : 'Blocked — I am NOT available in this window'}
            </Label>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes (optional)</Label>
            <Textarea id="notes" value={notes} onChange={e => setNotes(e.target.value)} placeholder="e.g. Travel day to Sacramento, desk work only" />
          </div>

          <Button onClick={addWindow} disabled={saving}>
            {saving ? 'Saving…' : 'Add window'}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Link2 className="h-5 w-5 mr-2" />
            Sync a calendar
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Paste a personal iCal feed (Google Calendar → "Secret address in iCal format", Outlook → "Publish a calendar").
            Events become blocked windows here, so offers that clash with your real calendar never reach you.
          </p>
          <div className="grid sm:grid-cols-[1fr_2fr_auto] gap-2">
            <Input placeholder="Name (e.g. Personal)" value={feedName} onChange={e => setFeedName(e.target.value)} />
            <Input placeholder="https:// or webcal:// feed URL" value={feedUrl} onChange={e => setFeedUrl(e.target.value)} />
            <Button onClick={addImport} disabled={saving || !feedUrl.trim()}>Add feed</Button>
          </div>
          {imports.length > 0 && (
            <div className="space-y-2 border-t pt-3">
              {imports.map((imp) => (
                <div key={imp.id} className="flex items-center justify-between gap-3 text-sm">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{imp.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {imp.last_error
                        ? <span className="text-destructive">{imp.last_error}</span>
                        : imp.synced_at
                          ? `${imp.block_count} busy blocks · synced ${format(parseISO(imp.synced_at), 'MMM d, h:mm a')}`
                          : 'Not synced yet'}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button size="sm" variant="ghost" className="h-7" disabled={syncing !== null} onClick={() => syncImport(imp.id)} title="Re-fetch the feed">
                      <RefreshCw className={`w-3.5 h-3.5 ${syncing === imp.id ? 'animate-spin' : ''}`} />
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7" onClick={() => removeImport(imp.id)} title="Remove feed and its busy blocks">
                      <Trash2 className="w-3.5 h-3.5 text-muted-foreground" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Calendar className="h-5 w-5 mr-2" />
            Your windows
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : upcoming.length === 0 ? (
            <div className="text-center py-8">
              <Clock className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground">No windows set — you're assumed available unless a booking conflicts.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {upcoming.map(w => (
                <div key={w.id} className="flex items-center justify-between p-3 rounded-lg border border-border bg-card">
                  <div className="flex items-center space-x-3">
                    {w.is_available
                      ? <CheckCircle className="h-5 w-5 text-emerald-500" />
                      : <XCircle className="h-5 w-5 text-destructive" />}
                    <div>
                      <p className="font-medium text-sm">
                        {format(parseISO(w.start_time), 'EEE, MMM d, h:mm a')} – {format(parseISO(w.end_time), 'MMM d, h:mm a')}
                      </p>
                      {w.notes && <p className="text-xs text-muted-foreground">{w.notes}</p>}
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    {w.import_id && <Badge variant="secondary">Synced</Badge>}
                    <Badge variant={w.is_available ? 'outline' : 'destructive'}>
                      {w.is_available ? 'Available' : 'Blocked'}
                    </Badge>
                    <Button variant="ghost" size="sm" onClick={() => removeWindow(w.id)}>
                      <Trash2 className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AvailabilityEditor;
