import React, { useEffect, useMemo, useState } from 'react';
import { Download, Search } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useWaitlistStats } from '@/hooks/useWaitlistStats';
import { supabase } from '@/lib/supabase';
import { WaitlistEntry, WaitlistStatus } from '@/lib/types';

const STATUSES: WaitlistStatus[] = ['pending', 'verified', 'whitelisted', 'invited'];

const WaitlistAdminPage: React.FC = () => {
  const stats = useWaitlistStats();
  const [entries, setEntries] = useState<WaitlistEntry[]>([]);
  const [role, setRole] = useState('all');
  const [status, setStatus] = useState('all');
  const [betaOnly, setBetaOnly] = useState(false);
  const [search, setSearch] = useState('');

  const loadEntries = async () => {
    const { data, error } = await supabase.from('waiting_list').select('*').order('created_at', { ascending: false });
    if (error) toast.error(error.message);
    else setEntries((data || []) as WaitlistEntry[]);
  };
  useEffect(() => {
    loadEntries();
  }, []);

  const filtered = useMemo(
    () =>
      entries.filter((entry) => {
        const matchesRole = role === 'all' || entry.role_interest === role;
        const matchesStatus = status === 'all' || entry.status === status;
        const matchesBeta = !betaOnly || entry.beta_tester;
        const term = search.toLowerCase();
        const matchesSearch =
          !term || entry.email.toLowerCase().includes(term) || (entry.market_city || '').toLowerCase().includes(term);
        return matchesRole && matchesStatus && matchesBeta && matchesSearch;
      }),
    [entries, role, status, betaOnly, search],
  );

  const updateStatus = async (id: string, nextStatus: WaitlistStatus) => {
    const { error } = await supabase.from('waiting_list').update({ status: nextStatus }).eq('id', id);
    if (error) toast.error(error.message);
    else setEntries((current) => current.map((entry) => (entry.id === id ? { ...entry, status: nextStatus } : entry)));
  };

  const exportCsv = () => {
    const headers = [
      'email',
      'role',
      'market',
      'crew_roles',
      'company_type',
      'pain_points',
      'beta_tester',
      'referrals',
      'status',
      'created_at',
    ];
    const quote = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
    const rows = filtered.map((entry) =>
      [
        entry.email,
        entry.role_interest,
        entry.market_city,
        entry.crew_roles?.join(';'),
        entry.company_type,
        entry.pain_points?.join(';'),
        entry.beta_tester,
        entry.referral_count,
        entry.status,
        entry.created_at,
      ]
        .map(quote)
        .join(','),
    );
    const blob = new Blob([[headers.map(quote).join(','), ...rows].join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'flexzora-waitlist.csv';
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Waitlist triage</h1>
          <p className="text-muted-foreground">Manage the founding crew cohort.</p>
        </div>
        <Button onClick={exportCsv}>
          <Download className="mr-2 h-4 w-4" />
          Export CSV
        </Button>
      </div>
      <div className="grid gap-4 sm:grid-cols-4">
        <Stat title="Total" value={stats.total} />
        <Stat title="Companies" value={stats.companies} />
        <Stat title="Workers" value={stats.workers} />
        <Stat title="Beta testers" value={stats.betaTesters} />
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Filters</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Select value={role} onValueChange={setRole}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Role" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All roles</SelectItem>
              <SelectItem value="worker">Workers</SelectItem>
              <SelectItem value="company">Companies</SelectItem>
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {STATUSES.map((item) => (
                <SelectItem key={item} value={item}>
                  {item}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            variant={betaOnly ? 'default' : 'outline'}
            onClick={() => setBetaOnly((value) => !value)}
          >
            Beta testers only
          </Button>
          <div className="relative min-w-56 flex-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Search email or city"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Market</TableHead>
                <TableHead>Roles / company</TableHead>
                <TableHead>Pain points</TableHead>
                <TableHead>Beta</TableHead>
                <TableHead>Referrals</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell className="font-medium">{entry.email}</TableCell>
                  <TableCell>{entry.role_interest}</TableCell>
                  <TableCell>{entry.market_city || '—'}</TableCell>
                  <TableCell>
                    {entry.role_interest === 'worker' ? entry.crew_roles?.join(', ') || '—' : entry.company_type || '—'}
                  </TableCell>
                  <TableCell>
                    <div className="flex max-w-56 flex-wrap gap-1">
                      {(entry.pain_points || []).map((point) => (
                        <Badge key={point} variant="outline">
                          {point}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>{entry.beta_tester ? <Badge>Yes</Badge> : '—'}</TableCell>
                  <TableCell>{entry.referral_count}</TableCell>
                  <TableCell>
                    <Select
                      value={entry.status}
                      onValueChange={(value) => updateStatus(entry.id, value as WaitlistStatus)}
                    >
                      <SelectTrigger className="w-32">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {STATUSES.map((item) => (
                          <SelectItem key={item} value={item}>
                            {item}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>{new Date(entry.created_at).toLocaleDateString()}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {filtered.length === 0 && (
            <p className="p-8 text-center text-muted-foreground">No waitlist entries match these filters.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

const Stat: React.FC<{ title: string; value: number }> = ({ title, value }) => (
  <Card>
    <CardContent className="p-4">
      <p className="text-sm text-muted-foreground">{title}</p>
      <p className="text-2xl font-bold">{value.toLocaleString()}</p>
    </CardContent>
  </Card>
);

export default WaitlistAdminPage;
