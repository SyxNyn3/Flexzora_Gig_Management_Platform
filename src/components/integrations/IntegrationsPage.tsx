import React, { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Plug, Mail, CalendarDays, HardDrive, FileSpreadsheet, Calculator,
  MessagesSquare, Building2, CheckCircle2, Loader2,
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { ConnectButton } from './ConnectButton';

/**
 * Integrations surface backed by One Connect (WithOne). The Connect app's
 * permission set scopes One's consent page to exactly these six apps —
 * users can narrow each level but never widen past what we asked for.
 * Per-app buttons deep-link to that app's connect screen; the grant is
 * stored per-profile in `one_connections` by the one-connect edge
 * function. No third-party credentials ever touch Flexzora.
 */

interface OneApp {
  slug: string;
  name: string;
  access: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}

const ONE_APPS: OneApp[] = [
  { slug: 'gmail', name: 'Gmail', access: 'Read only', description: 'Booking confirmations and crew email surfaced in your feed.', icon: Mail },
  { slug: 'google-calendar', name: 'Google Calendar', access: 'Read & write', description: 'Push shifts to your calendar and check conflicts before booking.', icon: CalendarDays },
  { slug: 'google-drive', name: 'Google Drive', access: 'Full access', description: 'Deal memos, W-9s, receipts, and contracts stored in your Drive.', icon: HardDrive },
  { slug: 'google-sheets', name: 'Google Sheets', access: 'Full access', description: 'Import company roster sheets and export timesheets.', icon: FileSpreadsheet },
  { slug: 'quickbooks', name: 'QuickBooks', access: 'Full access', description: 'Invoices and expenses flow into your company\'s books.', icon: Calculator },
  { slug: 'slack', name: 'Slack', access: 'Read & write', description: 'Shift alerts and call notifications in your team channels.', icon: MessagesSquare },
];

// Rows from One's /connections/reachable: match on any slug-ish field so a
// shape change on their side degrades to "not connected" instead of a crash.
const rowMatches = (row: Record<string, unknown>, slug: string) =>
  [row.platform, row.key, row.app, row.slug, row.name]
    .some((v) => typeof v === 'string' && v.toLowerCase().replace(/[^a-z0-9]+/g, '-') === slug);

const IntegrationsPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const [hasGrant, setHasGrant] = useState<boolean | null>(null);
  const [connectedSlugs, setConnectedSlugs] = useState<Set<string>>(new Set());
  const [checking, setChecking] = useState(true);

  // Surface the OAuth outcome once, then clean the URL param.
  useEffect(() => {
    const result = searchParams.get('one_connect');
    if (!result) return;
    if (result === 'connected') toast.success('Apps connected');
    else if (result === 'expired') toast.error('That connect link expired — please try again');
    else if (result === 'declined') toast('Connection cancelled');
    else toast.error('Connection failed — please try again');
    searchParams.delete('one_connect');
    setSearchParams(searchParams, { replace: true });
  }, [searchParams, setSearchParams]);

  const refresh = useCallback(async () => {
    if (!user) { setChecking(false); return; }
    setChecking(true);
    const { data, error } = await supabase.functions.invoke('one-connect', {
      body: { action: 'connections' },
    });
    if (!error && data) {
      setHasGrant(!!data.connected);
      const rows: Record<string, unknown>[] = Array.isArray(data.rows) ? data.rows : [];
      setConnectedSlugs(new Set(
        ONE_APPS.filter((a) => rows.some((r) => rowMatches(r, a.slug)))
          .map((a) => a.slug),
      ));
    } else {
      setHasGrant(false);
    }
    setChecking(false);
  }, [user]);

  useEffect(() => { refresh(); }, [refresh]);

  const upcoming = [
    {
      icon: CalendarDays,
      title: 'Calendar sync',
      description: 'Push shifts and bookings to Google Calendar — the .ics feed already works as a fallback today.',
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

  const connectedCount = connectedSlugs.size;

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
          <Plug className="h-7 w-7" />
          Integrations
        </h1>
        <p className="text-muted-foreground mt-2">
          Flexzora is your system of record for schedules, hours, and payments —
          connect your apps to take it with you.
        </p>
      </div>

      <Card className="mb-6 border-primary/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Connected apps
            {connectedCount > 0 && <CheckCircle2 className="h-5 w-5 text-emerald-500" />}
          </CardTitle>
          <CardDescription>
            {checking
              ? 'Checking your connections…'
              : hasGrant
                ? `${connectedCount} of ${ONE_APPS.length} connected. Connect the rest below — each opens straight to that app's approval screen.`
                : 'Connect the apps Flexzora can work with. You approve access on One\'s secure page — Flexzora never sees your passwords.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!checking && !hasGrant && <ConnectButton label="Connect your apps" />}
          <div className="grid sm:grid-cols-2 gap-3 mt-2">
            {ONE_APPS.map(({ slug, name, access, description, icon: Icon }) => {
              const isConnected = connectedSlugs.has(slug);
              return (
                <div
                  key={slug}
                  className="flex items-start gap-3 rounded-lg border border-border/60 bg-card/50 p-3"
                >
                  <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center shrink-0">
                    <Icon className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm flex items-center gap-1.5">
                      {name}
                      {isConnected && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />}
                    </p>
                    <p className="text-xs text-muted-foreground">{access} · {description}</p>
                  </div>
                  <ConnectButton
                    app={slug}
                    label={isConnected ? 'Reconnect' : 'Connect'}
                    variant={isConnected ? 'outline' : 'secondary'}
                    size="sm"
                  />
                </div>
              );
            })}
          </div>
          {checking && (
            <p className="text-sm text-muted-foreground flex items-center gap-2 mt-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Checking…
            </p>
          )}
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
