import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

/**
 * The "one feed" — every call, alert and outbound message for the
 * signed-in user merged into a single chronological stream. Sources:
 *   notifications    — generic app notifications
 *   crew_alerts      — worker-scoped (call offers, swap/IOU updates)
 *   company_alerts   — company-scoped (approvals, disputes, funding)
 *   outbound_messages — every SMS/email the system sent (the "we texted
 *                       you at 4:12pm" proof trail)
 * Read state: notifications.read + crew_alerts.read_at are marked when
 * the feed is opened — opening the feed IS reading it.
 */

interface FeedItem {
  id: string;
  at: string;
  title: string;
  body?: string | null;
  kind: string;
  actionUrl?: string | null;
  read: boolean;
  channel?: 'app' | 'sms' | 'email' | 'push';
}

export default function FeedPage() {
  const { profile } = useAuth();
  const [items, setItems] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!profile) return;
    (async () => {
      const errors: string[] = [];
      const merged: FeedItem[] = [];

      // notifications.user_id stores PROFILES.id, not the auth uid — the
      // previous version queried by user.id and silently returned nothing.
      const { data: notifs, error: notifErr } = await supabase
        .from('notifications').select('*').eq('user_id', profile.id)
        .order('created_at', { ascending: false }).limit(100);
      if (notifErr) errors.push('notifications');
      for (const n of notifs ?? []) {
        merged.push({ id: `n-${n.id}`, at: n.created_at, title: n.title, body: n.message, kind: n.type ?? 'info', actionUrl: n.action_url, read: !!n.read });
      }

      // Company alerts key on companies.id — resolve memberships first so
      // dual-role accounts (worker profile + company member) see both sides.
      const { data: memberships } = await supabase.rpc('my_company_memberships');
      const companyIds = (memberships ?? []).map((m: { company_id: string }) => m.company_id);
      const isCompany = profile.role === 'company' || profile.role === 'admin' || companyIds.length > 0;

      if (isCompany && companyIds.length > 0) {
        const { data: alerts, error: alertErr } = await supabase
          .from('company_alerts').select('*').in('company_id', companyIds)
          .order('created_at', { ascending: false }).limit(100);
        if (alertErr) errors.push('company alerts');
        for (const a of alerts ?? []) {
          merged.push({ id: `ca-${a.id}`, at: a.created_at, title: a.title, body: a.body, kind: a.kind, read: !!a.resolved_at });
        }
      }

      if (!isCompany || companyIds.length === 0 || profile.role === 'worker') {
        const { data: alerts, error: alertErr } = await supabase
          .from('crew_alerts').select('*').eq('worker_id', profile.id)
          .order('created_at', { ascending: false }).limit(100);
        if (alertErr) errors.push('crew alerts');
        for (const a of alerts ?? []) {
          merged.push({ id: `wa-${a.id}`, at: a.created_at, title: a.title, body: a.body, kind: a.kind, read: !!a.read_at });
        }
      }

      // Outbound SMS/email log — proof the message was sent.
      const { data: outbound, error: outErr } = await supabase
        .from('outbound_messages').select('*').eq('recipient_profile_id', profile.id)
        .order('created_at', { ascending: false }).limit(50);
      if (outErr) errors.push('messages');
      for (const m of outbound ?? []) {
        merged.push({
          id: `om-${m.id}`, at: m.created_at,
          title: `${m.channel === 'sms' ? 'Text' : m.channel === 'push' ? 'Push' : 'Email'} — ${m.template ?? m.subject ?? 'message'}`,
          body: m.status === 'sent' ? m.body_preview : `Failed: ${m.error ?? 'unsent'}`,
          kind: 'outbound', channel: m.channel, read: true,
        });
      }

      merged.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
      setItems(merged);
      setLoadError(errors.length ? `Some feed sources failed to load (${errors.join(', ')})` : null);
      setLoading(false);

      // Mark the visible window as read — opening the feed reads it.
      const unreadNotifIds = (notifs ?? []).filter((n) => !n.read).map((n) => n.id);
      if (unreadNotifIds.length) {
        await supabase.from('notifications').update({ read: true }).in('id', unreadNotifIds);
      }
      // crew_alerts read state lives in read_at — the old code never cleared it.
      await supabase.from('crew_alerts').update({ read_at: new Date().toISOString() })
        .eq('worker_id', profile.id).is('read_at', null);
    })();
  }, [profile]);

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-foreground mb-1">Feed</h1>
      <p className="text-muted-foreground text-sm mb-6">
        Every call, alert and message — one place.
      </p>
      {loading && <p className="text-muted-foreground">Loading…</p>}
      {loadError && <p className="text-sm text-amber-600 dark:text-amber-400 mb-4">{loadError}</p>}
      {!loading && items.length === 0 && (
        <Card><CardContent className="py-8 text-center text-muted-foreground">
          Nothing yet — when calls, alerts and messages come in, they land here.
        </CardContent></Card>
      )}
      <div className="space-y-2">
        {items.map((i) => {
          const card = (
            <Card className={i.read ? 'opacity-70' : 'border-primary/40'}>
              <CardHeader className="py-3 px-4">
                <div className="flex items-center justify-between gap-3">
                  <CardTitle className="text-sm font-medium leading-5">{i.title}</CardTitle>
                  <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                    {new Date(i.at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                  </span>
                </div>
                {i.body && <p className="text-xs text-muted-foreground mt-1">{i.body}</p>}
                <div className="flex gap-2 mt-1">
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70">{i.kind}</span>
                  {i.channel && <span className="text-[10px] uppercase tracking-wider text-primary/80">via {i.channel}</span>}
                </div>
              </CardHeader>
            </Card>
          );
          // Items without an action_url render as plain cards — a dead '#'
          // link used to swallow the click and do nothing.
          return i.actionUrl ? (
            <Link key={i.id} to={i.actionUrl} className="block">{card}</Link>
          ) : (
            <div key={i.id}>{card}</div>
          );
        })}
      </div>
    </div>
  );
}
