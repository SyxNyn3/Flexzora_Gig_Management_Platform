import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AuthKitButton } from './AuthKitButton';
import { Calendar, AlertTriangle, Clock, MapPin, Building2, DollarSign, CheckCircle, XCircle, FolderSync as Sync, Filter, Download, Eye, EyeOff } from 'lucide-react';
import { format, isWithinInterval, parseISO, startOfWeek, endOfWeek } from 'date-fns';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

interface UnifiedGig {
  id: string;
  title: string;
  company_name: string;
  company_logo: string;
  location: string;
  start_date: string;
  end_date: string;
  hourly_rate?: number;
  status: 'confirmed' | 'pending' | 'completed' | 'cancelled';
  source: 'flexora' | 'rhino' | 'giglife' | 'stagehands' | 'pce' | 'other';
  conflict_level: 'none' | 'low' | 'medium' | 'high';
  travel_time?: number;
  notes?: string;
  sync_status: 'synced' | 'pending' | 'error';
}

const UnifiedSchedule: React.FC = () => {
  const { profile } = useAuth();
  const [gigs, setGigs] = useState<UnifiedGig[]>([]);
  const [filteredGigs, setFilteredGigs] = useState<UnifiedGig[]>([]);
  const [selectedWeek] = useState(new Date());
  const [viewMode, setViewMode] = useState<'week' | 'month'>('week');
  const [showConflicts, setShowConflicts] = useState(true);
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (profile?.id) loadUnifiedSchedule();
    else setLoading(false);
  }, [profile?.id]);

  useEffect(() => {
    filterGigs();
  }, [gigs, selectedWeek, viewMode, sourceFilter, showConflicts]);

  const loadUnifiedSchedule = async () => {
    setLoading(true);
    const rows: UnifiedGig[] = [];

    // Marketplace shifts the worker is booked on
    const { data: assignments } = await supabase
      .from('shift_assignments')
      .select('id, status, offered_rate, shift:shifts(id, title, starts_at, ends_at, status, event:events(title, company:companies(name), venue:venues(name, city)))')
      .eq('worker_id', profile!.id)
      .in('status', ['offered', 'confirmed', 'completed']);

    for (const a of assignments ?? []) {
      const shift = a.shift?.[0];
      const event = shift?.event?.[0];
      if (!shift || !event) continue;
      rows.push({
        id: shift.id,
        title: shift.title ?? event.title,
        company_name: event.company?.[0]?.name ?? 'Company',
        company_logo: '',
        location: event.venue?.[0] ? [event.venue[0].name, event.venue[0].city].filter(Boolean).join(', ') : 'TBD',
        start_date: shift.starts_at,
        end_date: shift.ends_at,
        hourly_rate: a.offered_rate ?? undefined,
        status: a.status === 'offered' ? 'pending' : a.status === 'completed' ? 'completed' : 'confirmed',
        source: 'flexora',
        conflict_level: 'none',
        sync_status: 'synced',
      });
    }

    // Legacy gig applications the worker has been accepted for
    const { data: applications } = await supabase
      .from('gig_applications')
      .select('id, status, proposed_rate, gig:gigs(id, title, location, start_date, end_date, hourly_rate, status, company:companies(name))')
      .eq('worker_id', profile!.id)
      .eq('status', 'accepted');

    for (const a of applications ?? []) {
      const gig = a.gig?.[0];
      if (!gig) continue;
      rows.push({
        id: gig.id,
        title: gig.title,
        company_name: gig.company?.[0]?.name ?? 'Company',
        company_logo: '',
        location: gig.location ?? 'TBD',
        start_date: gig.start_date,
        end_date: gig.end_date,
        hourly_rate: a.proposed_rate ?? gig.hourly_rate,
        status: 'confirmed',
        source: 'flexora',
        conflict_level: 'none',
        sync_status: 'synced',
      });
    }

    rows.sort((x, y) => new Date(x.start_date).getTime() - new Date(y.start_date).getTime());

    // Compute conflicts from real overlaps: overlapping windows are 'high',
    // different-venue gaps under 2h are 'medium' travel risks.
    for (let i = 0; i < rows.length; i++) {
      for (let j = i + 1; j < rows.length; j++) {
        const a = rows[i], b = rows[j];
        const aStart = +new Date(a.start_date), aEnd = +new Date(a.end_date);
        const bStart = +new Date(b.start_date), bEnd = +new Date(b.end_date);
        if (aStart < bEnd && bStart < aEnd) {
          a.conflict_level = 'high';
          b.conflict_level = 'high';
          b.notes = [b.notes, `Overlaps with "${a.title}"`].filter(Boolean).join(' · ');
          continue;
        }
        const gap = Math.abs(bStart - aEnd) / 3600000;
        if (gap < 2 && a.location !== b.location && a.conflict_level === 'none') {
          a.conflict_level = 'medium';
          a.travel_time = Math.round(gap * 60);
          a.notes = [a.notes, `Tight turnaround to "${b.title}"`].filter(Boolean).join(' · ');
        }
      }
    }

    setGigs(rows);
    setLoading(false);
  };

  const filterGigs = () => {
    let filtered = gigs;

    // Filter by date range
    if (viewMode === 'week') {
      const weekStart = startOfWeek(selectedWeek);
      const weekEnd = endOfWeek(selectedWeek);
      filtered = filtered.filter(gig => {
        const gigDate = parseISO(gig.start_date);
        return isWithinInterval(gigDate, { start: weekStart, end: weekEnd });
      });
    }

    // Filter by source
    if (sourceFilter !== 'all') {
      filtered = filtered.filter(gig => gig.source === sourceFilter);
    }

    // Filter conflicts
    if (!showConflicts) {
      filtered = filtered.filter(gig => gig.conflict_level === 'none');
    }

    setFilteredGigs(filtered);
  };

  const syncAllSources = async () => {
    setGigs(prev => prev.map(gig => ({ ...gig, sync_status: 'pending' as const })));
    
    // Simulate sync
    setTimeout(() => {
      setGigs(prev => prev.map(gig => ({ ...gig, sync_status: 'synced' as const })));
      toast.success('All sources synced successfully!');
    }, 2000);
  };

  const getConflictColor = (level: string) => {
    switch (level) {
      case 'high': return 'border-l-red-500 bg-destructive/10';
      case 'medium': return 'border-l-yellow-500 bg-amber-500/10';
      case 'low': return 'border-l-blue-500 bg-primary/10';
      default: return 'border-l-green-500 bg-card';
    }
  };

  const getSourceColor = (source: string) => {
    switch (source) {
      case 'rhino': return 'bg-purple-100 text-purple-800';
      case 'giglife': return 'bg-primary/10 text-primary';
      case 'stagehands': return 'bg-emerald-500/10 text-green-800';
      case 'pce': return 'bg-cyan-100 text-cyan-800';
      case 'flexora': return 'bg-indigo-100 text-indigo-800';
      default: return 'bg-muted text-foreground';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'confirmed': return 'bg-emerald-500/10 text-green-800';
      case 'pending': return 'bg-amber-500/10 text-yellow-800';
      case 'completed': return 'bg-muted text-foreground';
      case 'cancelled': return 'bg-destructive/10 text-red-800';
      default: return 'bg-muted text-foreground';
    }
  };

  const getSyncIcon = (status: string) => {
    switch (status) {
      case 'synced': return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'pending': return <Sync className="h-4 w-4 text-yellow-500 animate-spin" />;
      case 'error': return <XCircle className="h-4 w-4 text-red-500" />;
      default: return <Clock className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const totalEarnings = filteredGigs
    .filter(gig => gig.status === 'confirmed' && gig.hourly_rate)
    .reduce((sum, gig) => {
      const hours = (new Date(gig.end_date).getTime() - new Date(gig.start_date).getTime()) / (1000 * 60 * 60);
      return sum + (hours * (gig.hourly_rate || 0));
    }, 0);

  const conflictCount = filteredGigs.filter(gig => gig.conflict_level !== 'none').length;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Unified Schedule</h2>
          <p className="text-muted-foreground mt-2">
            All your gigs from connected companies in one view
          </p>
        </div>
        <div className="flex space-x-2">
          <Button variant="outline" onClick={syncAllSources}>
            <Sync className="h-4 w-4 mr-2" />
            Sync All
          </Button>
          <Button variant="outline">
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center">
              <Calendar className="h-8 w-8 text-primary" />
              <div className="ml-4">
                <p className="text-sm font-medium text-muted-foreground">This Week</p>
                <p className="text-2xl font-bold">{filteredGigs.length} gigs</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center">
              <DollarSign className="h-8 w-8 text-emerald-500" />
              <div className="ml-4">
                <p className="text-sm font-medium text-muted-foreground">Potential Earnings</p>
                <p className="text-2xl font-bold">${totalEarnings.toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center">
              <AlertTriangle className="h-8 w-8 text-yellow-600" />
              <div className="ml-4">
                <p className="text-sm font-medium text-muted-foreground">Conflicts</p>
                <p className="text-2xl font-bold text-yellow-600">{conflictCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center">
              <Building2 className="h-8 w-8 text-purple-600" />
              <div className="ml-4">
                <p className="text-sm font-medium text-muted-foreground">Companies</p>
                <p className="text-2xl font-bold">
                  {new Set(filteredGigs.map(g => g.company_name)).size}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center space-x-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Filters:</span>
            </div>
            
            <select 
              value={sourceFilter} 
              onChange={(e) => setSourceFilter(e.target.value)}
              className="px-3 py-1 border rounded-md text-sm"
            >
              <option value="all">All Sources</option>
              <option value="rhino">Rhino Staging</option>
              <option value="giglife">Giglife</option>
              <option value="stagehands">Stagehands Inc.</option>
              <option value="pce">PCE</option>
              <option value="flexora">Flexora</option>
              <option value="other">Other</option>
            </select>

            <Button
              variant={showConflicts ? "default" : "outline"}
              size="sm"
              onClick={() => setShowConflicts(!showConflicts)}
            >
              {showConflicts ? <Eye className="h-4 w-4 mr-1" /> : <EyeOff className="h-4 w-4 mr-1" />}
              {showConflicts ? 'Hide' : 'Show'} Conflicts
            </Button>

            <div className="flex items-center space-x-2">
              <Button
                variant={viewMode === 'week' ? "default" : "outline"}
                size="sm"
                onClick={() => setViewMode('week')}
              >
                Week
              </Button>
              <Button
                variant={viewMode === 'month' ? "default" : "outline"}
                size="sm"
                onClick={() => setViewMode('month')}
              >
                Month
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Conflicts Alert */}
      {conflictCount > 0 && (
        <Alert className="border-yellow-200 bg-amber-500/10">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription className="text-yellow-800">
            <strong>{conflictCount} scheduling conflict{conflictCount !== 1 ? 's' : ''} detected.</strong> 
            Review your schedule to resolve overlapping commitments.
          </AlertDescription>
        </Alert>
      )}

      {/* Schedule Grid */}
      <div className="space-y-4">
        {filteredGigs.length > 0 ? (
          filteredGigs.map((gig) => (
            <Card key={gig.id} className={`border-l-4 ${getConflictColor(gig.conflict_level)}`}>
              <CardContent className="pt-6">
                <div className="flex items-start justify-between">
                  <div className="flex items-start space-x-4 flex-1">
                    <div className="text-2xl">{gig.company_logo}</div>
                    <div className="flex-1">
                      <div className="flex items-center space-x-2 mb-2">
                        <h3 className="font-semibold text-lg">{gig.title}</h3>
                        <Badge className={getSourceColor(gig.source)}>
                          {gig.company_name}
                        </Badge>
                        <Badge className={getStatusColor(gig.status)}>
                          {gig.status}
                        </Badge>
                        {getSyncIcon(gig.sync_status)}
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-muted-foreground">
                        <div className="flex items-center">
                          <Clock className="h-4 w-4 mr-2" />
                          {format(parseISO(gig.start_date), 'MMM d, h:mm a')} - {format(parseISO(gig.end_date), 'h:mm a')}
                        </div>
                        <div className="flex items-center">
                          <MapPin className="h-4 w-4 mr-2" />
                          {gig.location}
                        </div>
                        {gig.hourly_rate && (
                          <div className="flex items-center">
                            <DollarSign className="h-4 w-4 mr-2" />
                            ${gig.hourly_rate}/hour
                          </div>
                        )}
                      </div>

                      {gig.notes && (
                        <div className="mt-3 p-3 bg-muted/40 rounded-lg">
                          <p className="text-sm text-foreground">{gig.notes}</p>
                        </div>
                      )}

                      {gig.conflict_level !== 'none' && (
                        <div className="mt-3">
                          <Badge className="bg-destructive/10 text-red-800">
                            <AlertTriangle className="h-3 w-3 mr-1" />
                            {gig.conflict_level.toUpperCase()} CONFLICT
                          </Badge>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="text-right">
                    {gig.hourly_rate && (
                      <div className="text-lg font-semibold">
                        ${((new Date(gig.end_date).getTime() - new Date(gig.start_date).getTime()) / (1000 * 60 * 60) * gig.hourly_rate).toLocaleString()}
                      </div>
                    )}
                    <div className="text-sm text-muted-foreground">
                      {Math.round((new Date(gig.end_date).getTime() - new Date(gig.start_date).getTime()) / (1000 * 60 * 60))} hours
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        ) : (
          <Card>
            <CardContent className="text-center py-12">
              <Calendar className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium text-foreground mb-2">No Gigs Scheduled</h3>
              <p className="text-muted-foreground">
                No gigs found for the selected time period and filters.
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* External Tool Connections */}
      <div className="mt-8">
        <AuthKitButton 
          onConnectionSuccess={(connection) => {
            console.log('Schedule integration connected:', connection);
            toast.success(`Connected ${connection.provider} to your schedule!`);
          }}
        />
      </div>
    </div>
  );
};

export default UnifiedSchedule;