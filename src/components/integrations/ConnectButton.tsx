import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';

interface ConnectButtonProps {
  label?: string;
}

/**
 * Starts the One Connect (WithOne) OAuth flow. POSTs to the one-connect
 * edge function with the user's Supabase JWT — the function creates the
 * PKCE/state row and returns One's authorize URL, which we navigate to.
 * The grant itself is stored server-side; the UI learns the outcome from
 * the ?one_connect=… redirect params on /integrations.
 */
export function ConnectButton({ label = 'Connect your apps' }: ConnectButtonProps) {
  const [busy, setBusy] = useState(false);

  const start = async () => {
    setBusy(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { toast.error('Please sign in first'); setBusy(false); return; }
      // functions.invoke attaches apikey + the user's JWT automatically —
      // a raw fetch without apikey gets 401'd at the gateway.
      const { data, error } = await supabase.functions.invoke('one-connect', {
        body: { action: 'start' },
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
    <Button onClick={start} disabled={busy}>
      {busy ? 'Redirecting…' : label}
    </Button>
  );
}
