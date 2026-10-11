import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { formatDistanceToNow, parseISO } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  AlertTriangle, BadgeCheck, BellOff, CalendarClock, Check, ClipboardList,
  RefreshCw, Users,
} from 'lucide-react';
import { useMyCompany } from '@/hooks/useMarketplace';
import { AlertService } from '@/lib/alerts/service';
import type { AlertKind, AlertStatus, CompanyAlert } from '@/lib/types';

const KIND_META: Record<AlertKind, { label: string; icon: React.ElementType }> = {
  unfilled_call: { label: 'Unfilled call', icon: Users },
  cert_expiring: { label: 'Cert expiring', icon: BadgeCheck },
  timesheet_pending: { label: 'Timesheet', icon: ClipboardList },
  shift_tomorrow: { label: 'Call soon', icon: CalendarClock },
  cert_review: { label: 'Review queue', icon: BadgeCheck },
};

const SEVERITY_ORDER = { urgent: 0, warning: 1, info: 2 } as const;

const severityClass = (s: CompanyAlert['severity']) =>
  s === 'urgent'
    ? 'border-destructive/60 bg-destructive/5'
    : s === 'warning'
      ? 'border-amber-500/50 bg-amber-500/5'
      : '';

const severityBadge = (s: CompanyAlert['severity']) =>
  s === 'urgent' ? 'destructive' : s === 'warning' ? 'default' : 'secondary';

const AlertsPage: React.FC = () => {
  const { company } = useMyCompany();
  const [alerts, setAlerts] = useState<CompanyAlert[]>([]);
  const [tab, setTab] = useState<AlertStatus | 'all'>('open');
  const [loading, setLoading] = useState(true);
  const [sweeping, setSweeping] = useState(false);

  const load = useCallback(async () => {
    if (!company?.id) return;
    setAlerts(await AlertService.list(company.id, tab));
    setLoading(false);
  }, [company?.id, tab]);

  // On first mount run the sweep so the inbox reflects right now.
  useEffect(() => {
    if (!company?.id) return;
    setLoading(true);
    AlertService.sweep(company.id).then(() => load());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [company?.id]);

  useEffect(() => { load(); }, [load]);

  const reSweep = async () => {
    if (!company?.id) return;
    setSweeping(true);
    await AlertService.sweep(company.id);
    await load();
    setSweeping(false);
  };

  const act = async (a: CompanyAlert, status: AlertStatus) => {
    if (!(await AlertService.setStatus(a.id, status))) return toast.error('Could not update alert');
    setAlerts((xs) =>
      tab === 'all' ? xs.map((x) => (x.id === a.id ? { ...x, status } : x)) : xs.filter((x) => x.id !== a.id),
    );
    toast.success(status === 'dismissed' ? 'Dismissed' : 'Reopened');
  };

  const sorted = useMemo(
    () => [...alerts].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]),
    [alerts],
  );

  const counts = useMemo(() => {
    const c = { urgent: 0, warning: 0, info: 0 };
    for (const a of alerts) if (a.status === 'open') c[a.severity] += 1;
    return c;
  }, [alerts]);

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <AlertTriangle className="w-6 h-6" /> Alerts
          </h1>
          <p className="text-sm text-muted-foreground">
            The things about to go wrong — unfilled calls, certs lapsing on booked crew, timesheets
            waiting on you, calls landing tomorrow. The sweep keeps this list honest: conditions
            that clear resolve themselves.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={reSweep} disabled={sweeping}>
          <RefreshCw className={`w-4 h-4 mr-1 ${sweeping ? 'animate-spin' : ''}`} /> Rescan
        </Button>
      </div>

      {tab === 'open' && counts.urgent > 0 && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-2 text-sm font-medium">
          {counts.urgent} urgent — handle these before anything else today.
        </div>
      )}

      <Tabs value={tab} onValueChange={(v) => setTab(v as AlertStatus | 'all')}>
        <TabsList>
          <TabsTrigger value="open">Open</TabsTrigger>
          <TabsTrigger value="resolved">Resolved</TabsTrigger>
          <TabsTrigger value="dismissed">Dismissed</TabsTrigger>
        </TabsList>
      </Tabs>

      {loading ? (
        <p className="text-sm text-muted-foreground">Scanning…</p>
      ) : sorted.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            {tab === 'open'
              ? 'Inbox zero — nothing needs you right now.'
              : `No ${tab} alerts.`}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {sorted.map((a) => {
            const meta = KIND_META[a.kind];
            const Icon = meta.icon;
            return (
              <Card key={a.id} className={a.status === 'open' ? severityClass(a.severity) : 'opacity-75'}>
                <CardContent className="p-4 flex items-start gap-3">
                  <Icon className="w-5 h-5 mt-0.5 shrink-0 text-muted-foreground" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`font-medium text-sm ${a.status !== 'open' ? 'line-through' : ''}`}>{a.title}</span>
                      <Badge variant={severityBadge(a.severity)} className="text-[10px]">{a.severity}</Badge>
                      <Badge variant="outline" className="text-[10px]">{meta.label}</Badge>
                    </div>
                    {a.body && <p className="text-xs text-muted-foreground mt-1">{a.body}</p>}
                    <div className="flex items-center gap-3 mt-1.5 text-[11px] text-muted-foreground">
                      {a.event && <span>{a.event.name}</span>}
                      {a.due_at && (
                        <span>{a.status === 'open' ? 'due' : 'was due'} {formatDistanceToNow(parseISO(a.due_at), { addSuffix: true })}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {a.kind === 'cert_review' ? (
                      <Button variant="ghost" size="sm" asChild>
                        <Link to="/cert-reviews">Open</Link>
                      </Button>
                    ) : a.event_id ? (
                      <Button variant="ghost" size="sm" asChild>
                        <Link to={`/events/${a.event_id}`}>Open</Link>
                      </Button>
                    ) : null}
                    {a.status === 'open' ? (
                      <Button variant="ghost" size="sm" onClick={() => act(a, 'dismissed')} title="Dismiss">
                        <BellOff className="w-4 h-4" />
                      </Button>
                    ) : (
                      <Button variant="ghost" size="sm" onClick={() => act(a, 'open')} title="Reopen">
                        <Check className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default AlertsPage;
