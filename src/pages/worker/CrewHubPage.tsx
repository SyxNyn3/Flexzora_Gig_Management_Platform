import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Users, Car, BedDouble, UtensilsCrossed, MessageSquare, ArrowRight, CalendarDays } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { useAuth } from '@/contexts/AuthContext';
import { useWorkerAssignments } from '@/hooks/useMarketplace';
import type { ShiftAssignment } from '@/lib/types';

/**
 * Crew hub — the left-nav entry point to the per-shift crew boards.
 * Each board carries the crew-life features: ride shares, bunks
 * ("don't sleep alone" lodging pools), food runs, IOUs, ride buddies,
 * and the shift message board. Boards are scoped to a shift because the
 * crew only exists once you're booked on it.
 */
const CrewHubPage: React.FC = () => {
  const { profile } = useAuth();
  const { data: assignments = [], loading } = useWorkerAssignments(profile?.id);

  // Boards matter once you're actually on the shift — confirmed first,
  // then offers/applied so workers can see what's coming. Past shifts drop
  // off: the board is for coordinating live work, not archives.
  const boards = useMemo(() => {
    const now = Date.now();
    return (assignments as ShiftAssignment[])
      .filter((a) => a.shift && ['confirmed', 'offered', 'applied'].includes(a.status))
      .filter((a) => new Date(a.shift!.ends_at).getTime() >= now - 86400000)
      .sort((a, b) => +new Date(a.shift!.starts_at) - +new Date(b.shift!.starts_at));
  }, [assignments]);

  const statusVariant = (s: string) =>
    s === 'confirmed' ? 'default' : s === 'offered' ? 'secondary' : 'outline';

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center">
          <Users className="h-6 w-6 mr-2 text-primary" />
          Crew
        </h1>
        <p className="text-muted-foreground mt-1">
          Your shifts' crew boards — rides, bunks, food runs, IOUs, and the shift chat. Pick a shift to open its board.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">What a crew board gives you</CardTitle>
          <CardDescription>
            Everything below lives inside each shift's board once you're booked on it.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <div className="flex items-center gap-2"><Car className="h-4 w-4 text-primary" /> Ride shares</div>
            <div className="flex items-center gap-2"><BedDouble className="h-4 w-4 text-primary" /> Bunks — don't sleep alone</div>
            <div className="flex items-center gap-2"><UtensilsCrossed className="h-4 w-4 text-primary" /> Food runs</div>
            <div className="flex items-center gap-2"><MessageSquare className="h-4 w-4 text-primary" /> Shift board</div>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      ) : boards.length === 0 ? (
        <Card>
          <CardContent className="text-center py-10">
            <CalendarDays className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">
              No upcoming shifts yet — once a company books you, its crew board appears here.
            </p>
            <Button asChild variant="outline" className="mt-4">
              <Link to="/shifts">Browse shifts</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {boards.map((a) => {
            const shift = a.shift!;
            const eventName = shift.event?.name ?? 'Production event';
            const venue = shift.event?.venue;
            return (
              <Card key={a.id}>
                <CardContent className="flex items-center justify-between gap-4 p-4 flex-wrap">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold truncate">{eventName}</p>
                      <Badge variant={statusVariant(a.status)} className="capitalize">{a.status}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      {shift.title} · {format(parseISO(shift.starts_at), 'EEE, MMM d · h:mm a')}
                      {venue?.name ? ` · ${venue.name}` : ''}
                    </p>
                  </div>
                  <Button asChild size="sm">
                    <Link to={`/shifts/${shift.id}/crew`}>
                      Open crew board <ArrowRight className="h-4 w-4 ml-1" />
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default CrewHubPage;
