import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';

interface ConnectButtonProps {
  label?: string;
  /** One catalog slug ("gmail", "google-calendar", …). Opens that app's
   *  connect screen first on One's hosted page instead of the full list. */
  app?: string;
  variant?: 'default' | 'outline' | 'secondary' | 'ghost';
  size?: 'default' | 'sm' | 'lg' | 'icon';
}

/**
 * Starts the One Connect (WithOne) OAuth flow. POSTs to the one-connect
 * edge function with the user's Supabase JWT — the function creates the
 * PKCE/state row and returns One's authorize URL, which we navigate to.
 * The grant itself is stored server-side; the UI learns the outcome from
 * the ?one_connect=… redirect params on /integrations.
 *
 * One's hosted page is unavoidable — Google/Slack/QuickBooks OAuth consent
 * cannot be iframed — but the permission set limits it to the six apps
 * Flexzora asks for, and `app` deep-links straight to one app's screen.
 */
export function ConnectButton({
  label = 'Connect your apps',
  app,
  variant = 'default',
  size = 'default',
}: ConnectButtonProps) {
  const [busy, setBusy] = useState(false);

  const start = async () => {
    setBusy(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { toast.error('Please sign in first'); setBusy(false); return; }
      // functions.invoke attaches apikey + the user's JWT automatically —
      // a raw fetch without apikey gets 401'd at the gateway.
      const { data, error } = await supabase.functions.invoke('one-connect', {
        body: { action: 'start', app, theme: 'dark' },
      });
      if (error) throw error;
      if (!data?.url) throw new Error('No authorize URL returned');
      window.location.href = data.url;
    } catch (e) {
      toast.error(`Could not start connection: ${e instanceof Error ? e.message : 'unknown error'}`);
      setBusy(false);
    }
  };

  return (
    <Button onClick={start} disabled={busy} variant={variant} size={size}>
      {busy ? 'Redirecting…' : label}
    </Button>
  );
}
