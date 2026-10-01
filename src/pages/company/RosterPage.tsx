import React, { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/contexts/AuthContext';
import { useMyCompany, useRoster } from '@/hooks/useMarketplace';
import { MarketplaceService } from '@/lib/marketplace/service';
import { RosterTier } from '@/lib/types';
import { Star, Trash2 } from 'lucide-react';

const tierTone: Record<RosterTier, string> = {
  core: 'bg-amber-100 text-amber-800 border-amber-200',
  preferred: 'bg-blue-100 text-blue-800 border-blue-200',
  blocked: 'bg-red-100 text-red-800 border-red-200',
};

const RosterPage: React.FC = () => {
  const { profile } = useAuth();
  const { company } = useMyCompany();
  const roster = useRoster(company?.id);
  const [busy, setBusy] = useState<string | null>(null);

  const setTier = async (workerId: string, tier: RosterTier) => {
    if (!company || !profile) return;
    setBusy(workerId);
    const { error } = await MarketplaceService.setRosterTier(company.id, workerId, tier, profile.id);
    setBusy(null);
    if (error) return toast.error(error);
    roster.refetch();
  };

  const remove = async (workerId: string) => {
    if (!company) return;
    setBusy(workerId);
    const { error } = await MarketplaceService.removeFromRoster(company.id, workerId);
    setBusy(null);
    if (error) return toast.error(error);
    roster.refetch();
  };

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Trusted roster</h1>
        <p className="text-sm text-gray-600">
          Core crew rank highest in smart matching and see your calls first. Blocked workers never see your shifts. Add people from any shift's Smart match tab.
        </p>
      </div>
      {roster.loading && <Skeleton className="h-32 w-full" />}
      {!roster.loading && roster.data.length === 0 && (
        <Card><CardContent className="p-10 text-center text-gray-500"><Star className="w-8 h-8 mx-auto mb-2 text-gray-300" />Your roster is empty.</CardContent></Card>
      )}
      <div className="space-y-2">
        {roster.data.map((entry) => (
          <Card key={entry.id}>
            <CardContent className="p-3 flex items-center gap-3">
              <Avatar className="h-10 w-10">
                <AvatarImage src={entry.worker?.avatar_url} />
                <AvatarFallback>{(entry.worker?.full_name ?? '?').slice(0, 2).toUpperCase()}</AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{entry.worker?.full_name}</p>
                <p className="text-xs text-gray-500 truncate">{entry.worker?.location ?? entry.worker?.email}</p>
              </div>
              <Badge variant="outline" className={tierTone[entry.tier]}>{entry.tier}</Badge>
              <Select value={entry.tier} onValueChange={(v) => setTier(entry.worker_id, v as RosterTier)} disabled={busy === entry.worker_id}>
                <SelectTrigger className="w-32 h-8"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="core">Core</SelectItem>
                  <SelectItem value="preferred">Preferred</SelectItem>
                  <SelectItem value="blocked">Blocked</SelectItem>
                </SelectContent>
              </Select>
              <Button size="icon" variant="ghost" disabled={busy === entry.worker_id} onClick={() => remove(entry.worker_id)} aria-label="Remove from roster">
                <Trash2 className="w-4 h-4" />
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default RosterPage;
