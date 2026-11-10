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
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/one-connect`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ action: 'start' }),
        },
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.url) throw new Error(body.error || `HTTP ${res.status}`);
      window.location.href = body.url;
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
