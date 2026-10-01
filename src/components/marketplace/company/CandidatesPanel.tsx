import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Shift, ShiftAssignment, Profile } from '@/lib/types';
import { MarketplaceService } from '@/lib/marketplace/service';
import { MatchResult } from '@/lib/marketplace/matchScore';
import MatchScoreBadge from '../MatchScoreBadge';
import { confirmedCount, shiftWindow } from '../format';
import { Radio, Globe, Star, UserCheck, UserX, Send, Pencil } from 'lucide-react';

interface Props {
  shift: Shift;
  companyId: string;
  managerId: string;
  onChanged: () => void;
  onEdit: (shift: Shift) => void;
}

type Candidate = MatchResult & { worker: Profile };

const initials = (p?: Profile) => (p?.full_name ?? '?').split(' ').map((s) => s[0]).join('').slice(0, 2).toUpperCase();

const CandidatesPanel: React.FC<Props> = ({ shift, companyId, managerId, onChanged, onEdit }) => {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const assignments = shift.assignments ?? [];
  const confirmed = confirmedCount(shift);
  const applicants = assignments.filter((a) => a.status === 'applied');
  const offered = assignments.filter((a) => a.status === 'offered');
  const crew = assignments.filter((a) => a.status === 'confirmed' || a.status === 'completed');
  const engagedIds = new Set(assignments.filter((a) => !['declined', 'rejected', 'withdrawn'].includes(a.status)).map((a) => a.worker_id));

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    MarketplaceService.rankCandidates(shift, companyId).then(({ data, error }) => {
      if (cancelled) return;
      if (error) toast.error(error);
      setCandidates(data);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [shift.id, shift.updated_at, companyId, shift]);

  const run = async (key: string, fn: () => Promise<{ error: string | null }>, success: string) => {
    setBusy(key);
    const { error } = await fn();
    setBusy(null);
    if (error) toast.error(error);
    else {
      toast.success(success);
      onChanged();
    }
  };

  const decide = (a: ShiftAssignment, decision: 'confirmed' | 'rejected') =>
    run(a.id, () => MarketplaceService.decideApplication(a.id, decision), decision === 'confirmed' ? 'Crew confirmed' : 'Application declined');

  const book = (c: Candidate) => run(c.worker.id, () => MarketplaceService.directBook(shift.id, c.worker.id, c), `Offer sent to ${c.worker.full_name}`);

  const addToRoster = (workerId: string) =>
    run(`roster-${workerId}`, () => MarketplaceService.setRosterTier(companyId, workerId, 'preferred', managerId), 'Added to trusted roster');

  const broadcast = (stage: 'roster' | 'public') =>
    run(`bc-${stage}`, () => MarketplaceService.broadcastShift(shift.id, stage), stage === 'roster' ? 'Broadcast to trusted roster' : 'Released to public marketplace');

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-semibold text-lg leading-tight">{shift.title}</h3>
          <p className="text-sm text-gray-600">
            {shift.role_name} · {shiftWindow(shift.starts_at, shift.ends_at)} · ${Number(shift.hourly_rate).toFixed(2)}/hr
          </p>
          <div className="flex flex-wrap gap-1 mt-1">
            <Badge variant={confirmed >= shift.headcount ? 'default' : 'secondary'}>
              {confirmed}/{shift.headcount} confirmed
            </Badge>
            {shift.required_cert_codes.map((c) => (
              <Badge key={c} variant="outline" className="border-amber-300 text-amber-800">{c.replace(/_/g, ' ')} required</Badge>
            ))}
          </div>
        </div>
        <Button variant="ghost" size="icon" onClick={() => onEdit(shift)} aria-label="Edit shift">
          <Pencil className="w-4 h-4" />
        </Button>
      </div>

      <div className="flex gap-2">
        <Button size="sm" variant={shift.broadcast_stage === 'none' ? 'default' : 'outline'} disabled={busy !== null || shift.broadcast_stage !== 'none'} onClick={() => broadcast('roster')}>
          <Radio className="w-3.5 h-3.5 mr-1" /> Broadcast to roster
        </Button>
        <Button size="sm" variant={shift.broadcast_stage === 'roster' ? 'default' : 'outline'} disabled={busy !== null || shift.broadcast_stage === 'public'} onClick={() => broadcast('public')}>
          <Globe className="w-3.5 h-3.5 mr-1" /> Open to public
        </Button>
      </div>

      <Tabs defaultValue={applicants.length ? 'applicants' : 'candidates'}>
        <TabsList className="w-full">
          <TabsTrigger value="candidates" className="flex-1">Smart match ({candidates.filter((c) => c.breakdown.gatekeeperPassed).length})</TabsTrigger>
          <TabsTrigger value="applicants" className="flex-1">Applicants ({applicants.length})</TabsTrigger>
          <TabsTrigger value="crew" className="flex-1">Crew ({crew.length + offered.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="candidates" className="space-y-2 mt-3">
          {loading && [0, 1, 2].map((i) => <Skeleton key={i} className="h-14 w-full" />)}
          {!loading && candidates.length === 0 && <p className="text-sm text-gray-500 py-4 text-center">No available workers found.</p>}
          {!loading &&
            candidates.map((c) => {
              const engaged = engagedIds.has(c.worker.id);
              return (
                <div key={c.worker.id} className={`flex items-center gap-3 p-2.5 rounded-md border ${c.breakdown.gatekeeperPassed ? 'bg-white' : 'bg-gray-50 opacity-70'}`}>
                  <Avatar className="h-9 w-9">
                    <AvatarImage src={c.worker.avatar_url} />
                    <AvatarFallback>{initials(c.worker)}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium truncate">{c.worker.full_name}</p>
                      {c.breakdown.roster >= 80 && <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-400" />}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <MatchScoreBadge score={c.score} breakdown={c.breakdown} reasons={c.reasons} size="sm" />
                      {c.breakdown.distanceKm != null && <span className="text-xs text-gray-500">{c.breakdown.distanceKm} km</span>}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    {c.breakdown.roster === 0 && c.breakdown.gatekeeperPassed && (
                      <Button size="sm" variant="ghost" disabled={busy !== null} onClick={() => addToRoster(c.worker.id)} title="Add to trusted roster">
                        <Star className="w-3.5 h-3.5" />
                      </Button>
                    )}
                    <Button size="sm" disabled={!c.breakdown.gatekeeperPassed || engaged || busy !== null || confirmed >= shift.headcount} onClick={() => book(c)}>
                      <Send className="w-3.5 h-3.5 mr-1" /> {engaged ? 'Sent' : 'Direct book'}
                    </Button>
                  </div>
                </div>
              );
            })}
        </TabsContent>

        <TabsContent value="applicants" className="space-y-2 mt-3">
          {applicants.length === 0 && <p className="text-sm text-gray-500 py-4 text-center">No pending applications.</p>}
          {applicants.map((a) => (
            <div key={a.id} className="flex items-center gap-3 p-2.5 rounded-md border bg-white">
              <Avatar className="h-9 w-9">
                <AvatarImage src={a.worker?.avatar_url} />
                <AvatarFallback>{initials(a.worker)}</AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{a.worker?.full_name}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  {a.match_score != null && <MatchScoreBadge score={a.match_score} breakdown={a.match_breakdown} size="sm" />}
                  <span className="text-xs text-gray-500">via {a.source.replace(/_/g, ' ')}</span>
                </div>
              </div>
              <div className="flex gap-1">
                <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => decide(a, 'rejected')}>
                  <UserX className="w-3.5 h-3.5" />
                </Button>
                <Button size="sm" disabled={busy !== null || confirmed >= shift.headcount} onClick={() => decide(a, 'confirmed')}>
                  <UserCheck className="w-3.5 h-3.5 mr-1" /> Confirm
                </Button>
              </div>
            </div>
          ))}
        </TabsContent>

        <TabsContent value="crew" className="space-y-2 mt-3">
          {crew.length + offered.length === 0 && <p className="text-sm text-gray-500 py-4 text-center">Nobody booked yet.</p>}
          {[...crew, ...offered].map((a) => (
            <div key={a.id} className="flex items-center gap-3 p-2.5 rounded-md border bg-white">
              <Avatar className="h-9 w-9">
                <AvatarImage src={a.worker?.avatar_url} />
                <AvatarFallback>{initials(a.worker)}</AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{a.worker?.full_name}</p>
                <p className="text-xs text-gray-500">{a.worker?.phone ?? a.worker?.email}</p>
              </div>
              <Badge variant={a.status === 'offered' ? 'outline' : 'default'}>{a.status === 'offered' ? 'Awaiting reply' : a.status}</Badge>
            </div>
          ))}
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default CandidatesPanel;
