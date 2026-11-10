import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Plug, Mail, CalendarDays, Building2, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { ConnectButton } from './ConnectButton';

/**
 * Integrations surface backed by One Connect (WithOne). Users authorize
 * Gmail / Google Calendar through One's hosted consent page; the grant is
 * stored per-profile in `one_connections` by the one-connect edge
 * function. No third-party credentials ever touch Flexzora.
 */
const IntegrationsPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const [connected, setConnected] = useState(false);
  const [checking, setChecking] = useState(true);

  // Surface the OAuth outcome once, then clean the URL param.
  useEffect(() => {
    const result = searchParams.get('one_connect');
    if (!result) return;
    if (result === 'connected') toast.success('Google account connected');
    else if (result === 'expired') toast.error('That connect link expired — please try again');
    else toast.error('Connection failed — please try again');
    searchParams.delete('one_connect');
    setSearchParams(searchParams, { replace: true });
  }, [searchParams, setSearchParams]);

  // Connection status for this profile.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!user) { setChecking(false); return; }
      const { data: profile } = await supabase
        .from('profiles').select('id').eq('user_id', user.id).single();
      if (!profile || cancelled) { setChecking(false); return; }
      const { data } = await supabase
        .from('one_connections').select('profile_id').eq('profile_id', profile.id).maybeSingle();
      if (!cancelled) { setConnected(!!data); setChecking(false); }
    })();
    return () => { cancelled = true; };
  }, [user]);

  const upcoming = [
    {
      icon: CalendarDays,
      title: 'Calendar sync',
      description: 'Push shifts and bookings to Google Calendar once connected — the .ics feed already works as a fallback.',
    },
    {
      icon: Mail,
      title: 'Email notifications',
      description: 'Booking confirmations and reminders delivered to your inbox.',
    },
    {
      icon: Building2,
      title: 'Company connections',
      description: 'Companies you work with appear automatically when they book you — no manual linking.',
    },
  ];

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
          <Plug className="h-7 w-7" />
          Integrations
        </h1>
        <p className="text-muted-foreground mt-2">
          Flexzora is your system of record for schedules, hours, and payments —
          connect Google to take it with you.
        </p>
      </div>

      <Card className="mb-6 border-primary/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Google account
            {connected && <CheckCircle2 className="h-5 w-5 text-emerald-500" />}
          </CardTitle>
          <CardDescription>
            {connected
              ? 'Your Google account is connected. Calendar sync and Gmail features activate as they ship.'
              : 'Link Google Calendar and Gmail through One Connect. You\'ll approve access on One\'s secure page — Flexzora never sees your password.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!checking && (connected
            ? <p className="text-sm text-muted-foreground">Connected — manage access from your One account dashboard.</p>
            : <ConnectButton />)}
        </CardContent>
      </Card>

      <h2 className="text-lg font-semibold mb-3">On the roadmap</h2>
      <div className="space-y-3">
        {upcoming.map(({ icon: Icon, title, description }) => (
          <Card key={title}>
            <CardContent className="pt-6 flex items-start gap-4">
              <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
                <Icon className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <p className="font-medium">{title}</p>
                <p className="text-sm text-muted-foreground mt-1">{description}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default IntegrationsPage;
