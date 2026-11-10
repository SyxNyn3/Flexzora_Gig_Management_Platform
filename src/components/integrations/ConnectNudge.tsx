import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Plug } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { ConnectButton } from './ConnectButton';

/**
 * Connect prompt: renders only while the profile has no One Connect
 * grant. Used on surfaces where an integration is contextually useful
 * (calendar, dashboard) rather than only on /integrations. Re-checks
 * when the window regains focus so returning from the OAuth redirect
 * flips it to connected without a manual refresh.
 */
const ConnectNudge: React.FC<{ className?: string }> = ({ className }) => {
  const { user } = useAuth();
  const [connected, setConnected] = useState<boolean | null>(null);

  const check = useCallback(async () => {
    if (!user) { setConnected(true); return; } // no user → render nothing
    const { data: profile } = await supabase
      .from('profiles').select('id').eq('user_id', user.id).single();
    if (!profile) { setConnected(true); return; }
    const { data } = await supabase
      .from('one_connections').select('profile_id')
      .eq('profile_id', profile.id).maybeSingle();
    setConnected(!!data);
  }, [user]);

  useEffect(() => {
    check();
    const onFocus = () => check();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [check]);

  if (connected !== false) return null;

  return (
    <Card className={className ?? 'border-primary/30'}>
      <CardContent className="pt-6 flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
          <Plug className="h-5 w-5 text-muted-foreground" />
        </div>
        <div className="flex-1">
          <p className="font-medium">Connect your apps</p>
          <p className="text-sm text-muted-foreground mt-1">
            Link Gmail, Calendar, Drive, Sheets, QuickBooks, and Slack — takes about a minute.
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <ConnectButton label="Connect" />
          <Link to="/integrations" className="text-sm text-muted-foreground hover:text-foreground">
            Details
          </Link>
        </div>
      </CardContent>
    </Card>
  );
};

export default ConnectNudge;
