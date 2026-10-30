import React, { useEffect, useState } from 'react';
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
  const { user, profile } = useAuth();
  const [items, setItems] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || !profile) return;
    (async () => {
      const isCompany = profile.role === 'company' || profile.role === 'admin';
      const merged: FeedItem[] = [];

      const { data: notifs } = await supabase
        .from('notifications').select('*').eq('user_id', user.id)
        .order('created_at', { ascending: false }).limit(100);
      for (const n of notifs ?? []) {
        merged.push({ id: `n-${n.id}`, at: n.created_at, title: n.title, body: n.message, kind: n.type ?? 'info', actionUrl: n.action_url, read: !!n.read });
      }

      if (isCompany) {
        const { data: alerts } = await supabase
          .from('company_alerts').select('*').eq('company_id', profile.id)
          .order('created_at', { ascending: false }).limit(100);
        for (const a of alerts ?? []) {
          merged.push({ id: `ca-${a.id}`, at: a.created_at, title: a.title, body: a.body, kind: a.kind, read: !!a.resolved_at });
        }
      } else {
        const { data: alerts } = await supabase
          .from('crew_alerts').select('*').eq('worker_id', profile.id)
          .order('created_at', { ascending: false }).limit(100);
        for (const a of alerts ?? []) {
          merged.push({ id: `wa-${a.id}`, at: a.created_at, title: a.title, body: a.body, kind: a.kind, read: !!a.read_at });
        }
      }

      // Outbound SMS/email log — proof the message was sent.
      const { data: outbound } = await supabase
        .from('outbound_messages').select('*').eq('recipient_profile_id', profile.id)
        .order('created_at', { ascending: false }).limit(50);
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
      setLoading(false);

      // Mark the visible window as read — opening the feed reads it.
      const unreadNotifIds = (notifs ?? []).filter((n) => !n.read).map((n) => n.id);
      if (unreadNotifIds.length) {
        await supabase.from('notifications').update({ read: true }).in('id', unreadNotifIds);
      }
    })();
  }, [user, profile]);

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-foreground mb-1">Feed</h1>
      <p className="text-muted-foreground text-sm mb-6">
        Every call, alert and message — one place.
      </p>
      {loading && <p className="text-muted-foreground">Loading…</p>}
      {!loading && items.length === 0 && (
        <Card><CardContent className="py-8 text-center text-muted-foreground">
          Nothing yet — when calls, alerts and messages come in, they land here.
        </CardContent></Card>
      )}
      <div className="space-y-2">
        {items.map((i) => (
          <Link key={i.id} to={i.actionUrl ?? '#'} className="block">
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
          </Link>
        ))}
      </div>
    </div>
  );
}
