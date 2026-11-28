import React, { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CalendarDays, CheckCircle2, HardDrive, Loader2, Mail, RefreshCw, FileSpreadsheet, Unplug } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Native Google connect — one OAuth grant covers every Google app
 * Flexzora uses (Calendar push/pull, Gmail offer ingestion, Drive,
 * Sheets). Replaces One Connect for Google entirely: the user gets
 * Google's own account chooser, tokens stay server-side, and no One
 * account or hosted page is involved. Slack/QuickBooks remain on One.
 */
const GOOGLE_APPS = [
  { icon: CalendarDays, name: 'Google Calendar', desc: 'Shifts, reminders, and notes sync both ways.' },
  { icon: Mail, name: 'Gmail', desc: 'Gig offers from production companies are parsed into your Offers inbox.' },
  { icon: HardDrive, name: 'Google Drive', desc: 'Deal memos, W-9s, and receipts can live in your Drive.' },
  { icon: FileSpreadsheet, name: 'Google Sheets', desc: 'Roster import and timesheet export.' },
];

const GoogleConnectCard: React.FC = () => {
  const { user } = useAuth();
  const [connected, setConnected] = useState<boolean | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!user) { setConnected(false); return; }
    const { data, error } = await supabase.functions.invoke('google-connect', {
      body: { action: 'status' },
    });
    if (!error && data) {
      setConnected(!!data.connected);
      setEmail(data.google_email ?? null);
    } else {
      setConnected(false);
    }
  }, [user]);

  useEffect(() => { refresh(); }, [refresh]);

  const call = async (action: string, successMsg: string) => {
    setBusy(action);
    try {
      const { data, error } = await supabase.functions.invoke('google-connect', {
        body: { action, return_to: window.location.pathname },
      });
      if (error) throw error;
      if (action === 'start') {
        if (!data?.url) throw new Error('No authorize URL returned');
        window.location.href = data.url;
        return; // navigating away — keep spinner state
      }
      if (successMsg) toast.success(successMsg);
      await refresh();
    } catch (e) {
      toast.error(`Google connect failed: ${e instanceof Error ? e.message : 'unknown error'}`);
    }
    setBusy(null);
  };

  return (
    <div className="rounded-lg border border-primary/30 bg-card/50 p-4">
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
          <Mail className="h-5 w-5 text-muted-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium flex items-center gap-1.5">
            Google account
            {connected && <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
            {connected && <Badge variant="secondary" className="text-[10px]">Native</Badge>}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {connected
              ? `Connected as ${email ?? 'your Google account'} — one sign-in powers all four apps below.`
              : 'One Google sign-in connects Calendar, Gmail, Drive, and Sheets — no extra account, no middleman.'}
          </p>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-2 mt-3">
        {GOOGLE_APPS.map(({ icon: Icon, name, desc }) => (
          <div key={name} className="flex items-start gap-2 rounded-md bg-muted/40 p-2.5">
            <Icon className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
            <div className="min-w-0">
              <p className="text-xs font-medium flex items-center gap-1">
                {name}
                {connected && <CheckCircle2 className="h-3 w-3 text-emerald-500" />}
              </p>
              <p className="text-[11px] text-muted-foreground leading-snug">{desc}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2 mt-3">
        {connected === null ? (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        ) : connected ? (
          <>
            <Button size="sm" variant="outline" disabled={busy !== null}
              onClick={() => call('sync', 'Pushed to Google Calendar')}>
              {busy === 'sync' ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <RefreshCw className="h-4 w-4 mr-1" />}
              Push calendar
            </Button>
            <Button size="sm" variant="outline" disabled={busy !== null}
              onClick={() => call('pull', 'Google events imported')}>
              {busy === 'pull' ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <CalendarDays className="h-4 w-4 mr-1" />}
              Import calendar
            </Button>
            <Button size="sm" variant="outline" disabled={busy !== null}
              onClick={() => call('gmail-sync', 'Gmail scanned for offers')}>
              {busy === 'gmail-sync' ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Mail className="h-4 w-4 mr-1" />}
              Scan Gmail
            </Button>
            <Button size="sm" variant="ghost" disabled={busy !== null}
              onClick={() => call('disconnect', 'Google account disconnected')}>
              {busy === 'disconnect' ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Unplug className="h-4 w-4 mr-1" />}
              Disconnect
            </Button>
          </>
        ) : (
          <Button size="sm" disabled={busy !== null} onClick={() => call('start', '')}>
            {busy === 'start' ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
            Connect Google account
          </Button>
        )}
      </div>
    </div>
  );
};

export default GoogleConnectCard;
