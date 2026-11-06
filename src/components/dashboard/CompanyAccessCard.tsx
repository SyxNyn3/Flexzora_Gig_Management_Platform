import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Building2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { invalidateCompanyMemberships, useCompanyMemberships } from '@/hooks/useMarketplace';

/**
 * Dual-role entry point on the worker dashboard: a worker-profile account can
 * create and operate a production company under the same login. Company
 * access is membership-based (company_members), so this card keys off the
 * my_company_memberships RPC — not profiles.role.
 */
const CompanyAccessCard: React.FC = () => {
  const navigate = useNavigate();
  const { memberships, loading } = useCompanyMemberships();
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);

  if (loading) return null;

  const first = memberships[0];

  const handleCreate = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setCreating(true);
    // create_company RPC writes the company row + owner membership atomically
    // (direct INSERT on companies is closed by RLS).
    const { error } = await supabase.rpc('create_company', { p_name: trimmed });
    setCreating(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    // Drop the cached membership list so RoleRoute/Navbar pick it up immediately.
    invalidateCompanyMemberships();
    toast.success('Company created — welcome aboard');
    navigate('/events');
  };

  return (
    <Card className="border-primary/30">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center text-base">
          <Building2 className="h-5 w-5 mr-2 text-primary" />
          Run a production company
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {first ? (
          <>
            <p className="text-sm text-muted-foreground">
              You're a member of <span className="font-medium text-foreground">{first.company_name}</span> ({first.member_role}).
            </p>
            <Button className="w-full" onClick={() => navigate('/events')}>
              Open company dashboard
            </Button>
          </>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              Hiring crew for your own shows? Create a company profile — it lives alongside your worker profile.
            </p>
            <Input
              placeholder="Company name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); }}
            />
            <Button className="w-full" disabled={!name.trim() || creating} onClick={handleCreate}>
              {creating ? 'Creating…' : 'Create company'}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default CompanyAccessCard;
