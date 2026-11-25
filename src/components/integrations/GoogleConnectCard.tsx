import React, { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CalendarDays, CheckCircle2, Loader2, RefreshCw, Unplug } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Native Google Calendar connect — OAuth runs through our google-connect
 * edge function, so the user gets Google's own account chooser (no One
 * hosted page, no One account). Tokens stay server-side; this card only
 * knows connected/not-connected plus the Google email for display.
 */
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
      toast.success(successMsg);
      await refresh();
    } catch (e) {
      toast.error(`Google connect failed: ${e instanceof Error ? e.message : 'unknown error'}`);
    }
    setBusy(null);
  };

  return (
    <div className="rounded-lg border border-border/60 bg-card/50 p-4">
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
          <CalendarDays className="h-5 w-5 text-muted-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium flex items-center gap-1.5">
            Google Calendar
            {connected && <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
            {connected && <Badge variant="secondary" className="text-[10px]">Native</Badge>}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {connected
              ? `Connected as ${email ?? 'your Google account'} — shifts, reminders, and notes push to your calendar automatically.`
              : 'Sign in with Google once — Flexzora shifts and reminders appear on your Google Calendar. No extra account.'}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2 mt-3">
        {connected === null ? (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        ) : connected ? (
          <>
            <Button size="sm" variant="outline" disabled={busy !== null}
              onClick={() => call('sync', 'Calendar synced')}>
              {busy === 'sync' ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <RefreshCw className="h-4 w-4 mr-1" />}
              Sync now
            </Button>
            <Button size="sm" variant="ghost" disabled={busy !== null}
              onClick={() => call('disconnect', 'Google Calendar disconnected')}>
              {busy === 'disconnect' ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Unplug className="h-4 w-4 mr-1" />}
              Disconnect
            </Button>
          </>
        ) : (
          <Button size="sm" disabled={busy !== null} onClick={() => call('start', '')}>
            {busy === 'start' ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
            Connect Google Calendar
          </Button>
        )}
      </div>
    </div>
  );
};

export default GoogleConnectCard;
