import { useState } from 'react';
import { useAuthKit } from '@picahq/authkit';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';

interface AuthKitButtonProps {
  /** Button text, e.g. "Connect Google Calendar". */
  label: string;
  /** Shown as the modal title so users know what they're connecting. */
  title?: string;
  onConnected?: () => void;
}

/**
 * Real Pica AuthKit connect button. Opens Pica's hosted modal; our
 * authkit-token edge function mints the session token from the caller's
 * Supabase JWT, so connections are scoped to the signed-in user. Pica
 * stores the third-party credentials — we only ever receive a
 * connection record back.
 */
export function AuthKitButton({ label, title, onConnected }: AuthKitButtonProps) {
  const { session } = useAuth();
  const [busy, setBusy] = useState(false);

  const { open } = useAuthKit({
    title,
    appTheme: 'dark',
    token: {
      url: `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/authkit-token`,
      headers: {
        'Authorization': `Bearer ${session?.access_token ?? ''}`,
        'Content-Type': 'application/json',
      },
    },
    onSuccess: () => {
      setBusy(false);
      toast.success(`${label} connected`);
      onConnected?.();
    },
    onError: (error) => {
      setBusy(false);
      toast.error(`Could not connect: ${error || 'unknown error'}`);
    },
    onClose: () => setBusy(false),
  });

  return (
    <Button
      variant="outline"
      disabled={busy || !session}
      onClick={() => { setBusy(true); open(); }}
    >
      {busy ? 'Opening…' : label}
    </Button>
  );
}
