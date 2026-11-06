import React, { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { UserPlus, UserRound } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useCompanyMemberships, useMyCompany } from '@/hooks/useMarketplace';
import { MembershipService } from '@/lib/membership/service';
import { CompanyMemberEntry, CompanyMemberRole } from '@/lib/types';

const ROLE_LABELS: Record<CompanyMemberRole, string> = {
  owner: 'Owner',
  admin: 'Admin',
  staff: 'Staff',
};

const ROLE_VARIANTS: Record<CompanyMemberRole, 'default' | 'secondary' | 'outline'> = {
  owner: 'default',
  admin: 'secondary',
  staff: 'outline',
};

const ALL_ROLES: CompanyMemberRole[] = ['owner', 'admin', 'staff'];

const TeamPage: React.FC = () => {
  const { profile } = useAuth();
  const { company, loading: companyLoading } = useMyCompany();
  const { memberships } = useCompanyMemberships();

  const [members, setMembers] = useState<CompanyMemberEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [newRole, setNewRole] = useState<CompanyMemberRole>('staff');
  const [adding, setAdding] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  // The caller's own role in THIS company decides whether management controls
  // render at all. useMyCompany picks the first membership, so match on
  // company_id rather than trusting array position.
  const myRole =
    memberships?.find((m) => m.company_id === company?.id)?.member_role ?? null;
  const canManage = myRole === 'owner' || myRole === 'admin';

  const refresh = useCallback(async () => {
    if (!company?.id) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await MembershipService.listMembers(company.id);
    if (error) toast.error(error);
    setMembers(data);
    setLoading(false);
  }, [company?.id]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const addMember = async () => {
    if (!company?.id) return;
    const trimmed = email.trim();
    if (!trimmed) {
      toast.error('Enter an email address');
      return;
    }
    setAdding(true);
    const { error } = await MembershipService.addMember(company.id, trimmed, newRole);
    setAdding(false);
    if (error) {
      toast.error(error);
      return;
    }
    toast.success(`Added ${trimmed} as ${ROLE_LABELS[newRole].toLowerCase()}`);
    setEmail('');
    setNewRole('staff');
    refresh();
  };

  const changeRole = async (member: CompanyMemberEntry, role: CompanyMemberRole) => {
    if (!company?.id || role === member.member_role) return;
    setBusyId(member.profile_id);
    const { error } = await MembershipService.updateMemberRole(company.id, member.profile_id, role);
    setBusyId(null);
    if (error) {
      toast.error(error);
      return;
    }
    toast.success(`${member.full_name || member.email} is now ${ROLE_LABELS[role].toLowerCase()}`);
    refresh();
  };

  const removeMember = async (member: CompanyMemberEntry) => {
    if (!company?.id) return;
    const label = member.full_name || member.email;
    if (!window.confirm(`Remove ${label} from ${company.name}? They will lose access to the company.`)) {
      return;
    }
    setBusyId(member.profile_id);
    const { error } = await MembershipService.removeMember(company.id, member.profile_id);
    setBusyId(null);
    if (error) {
      toast.error(error);
      return;
    }
    toast.success(`${label} removed`);
    refresh();
  };

  if (companyLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!company) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-muted-foreground">
          You are not a member of any company yet.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Team</h1>
        <p className="text-muted-foreground">
          People who can operate {company.name}. Owners and admins manage the team;
          staff see the roster read-only.
        </p>
      </div>

      {canManage && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Add a member</CardTitle>
          </CardHeader>
          <CardContent>
            {/* Invite-by-email only works for existing accounts — the RPC
                errors clearly when the email has no Flexzora profile yet. */}
            <p className="mb-3 text-sm text-muted-foreground">
              They must already have a Flexzora account with that email.
            </p>
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-64 flex-1 space-y-1">
                <Label htmlFor="member-email">Email</Label>
                <Input
                  id="member-email"
                  type="email"
                  placeholder="teammate@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addMember()}
                />
              </div>
              <div className="w-36 space-y-1">
                <Label>Role</Label>
                <Select value={newRole} onValueChange={(v) => setNewRole(v as CompanyMemberRole)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ALL_ROLES.map((r) => (
                      <SelectItem key={r} value={r}>
                        {ROLE_LABELS[r]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={addMember} disabled={adding}>
                <UserPlus className="mr-2 h-4 w-4" />
                {adding ? 'Adding…' : 'Add member'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="pt-6">
          {loading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : members.length === 0 ? (
            <p className="py-6 text-center text-muted-foreground">No members found.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Member</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Joined</TableHead>
                  {canManage && <TableHead className="w-40" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.map((m) => {
                  const isSelf = m.profile_id === profile?.id;
                  const busy = busyId === m.profile_id;
                  return (
                    <TableRow key={m.profile_id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <UserRound className="h-5 w-5 text-muted-foreground" />
                          <div>
                            <div className="font-medium">
                              {m.full_name || 'Unnamed'}
                              {isSelf && <span className="ml-2 text-xs text-muted-foreground">(you)</span>}
                            </div>
                            <div className="text-sm text-muted-foreground">{m.email}</div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        {canManage ? (
                          <Select
                            value={m.member_role}
                            onValueChange={(v) => changeRole(m, v as CompanyMemberRole)}
                            disabled={busy}
                          >
                            <SelectTrigger className="w-28">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {ALL_ROLES.map((r) => (
                                <SelectItem key={r} value={r}>
                                  {ROLE_LABELS[r]}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <Badge variant={ROLE_VARIANTS[m.member_role]}>{ROLE_LABELS[m.member_role]}</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {new Date(m.created_at).toLocaleDateString()}
                      </TableCell>
                      {canManage && (
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={busy}
                            onClick={() => removeMember(m)}
                          >
                            Remove
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default TeamPage;
