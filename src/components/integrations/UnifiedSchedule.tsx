import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/contexts/AuthContext';
import { AuthKitButton } from './AuthKitButton';
import { Calendar, AlertTriangle, Clock, MapPin, Building2, DollarSign, CheckCircle, XCircle, FolderSync as Sync, Filter, Download, Eye, EyeOff } from 'lucide-react';
import { format, isWithinInterval, parseISO, startOfWeek, endOfWeek, addDays } from 'date-fns';
import { toast } from 'sonner';

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
  const [selectedWeek, setSelectedWeek] = useState(new Date());
  const [viewMode, setViewMode] = useState<'week' | 'month'>('week');
  const [showConflicts, setShowConflicts] = useState(true);
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadUnifiedSchedule();
  }, []);

  useEffect(() => {
    filterGigs();
  }, [gigs, selectedWeek, viewMode, sourceFilter, showConflicts]);

  const loadUnifiedSchedule = () => {
    // Mock unified schedule from multiple sources
    const mockGigs: UnifiedGig[] = [
      {
        id: '1',
        title: 'Corporate Event Setup',
        company_name: 'Rhino Staging',
        company_logo: '🦏',
        location: 'San Francisco, CA',
        start_date: '2024-01-15T08:00:00Z',
        end_date: '2024-01-15T18:00:00Z',
        hourly_rate: 45,
        status: 'confirmed',
        source: 'rhino',
        conflict_level: 'none',
        sync_status: 'synced'
      },
      {
        id: '2',
        title: 'Concert Sound Check',
        company_name: 'Giglife',
        company_logo: '🎵',
        location: 'Oakland, CA',
        start_date: '2024-01-15T19:00:00Z',
        end_date: '2024-01-15T23:00:00Z',
        hourly_rate: 50,
        status: 'confirmed',
        source: 'giglife',
        conflict_level: 'medium',
        travel_time: 45,
        notes: 'Tight schedule - 1 hour travel time between venues',
        sync_status: 'synced'
      },
      {
        id: '3',
        title: 'Theater Production',
        company_name: 'Stagehands, Inc.',
        company_logo: '🎭',
        location: 'San Francisco, CA',
        start_date: '2024-01-16T14:00:00Z',
        end_date: '2024-01-16T22:00:00Z',
        hourly_rate: 48,
        status: 'pending',
        source: 'stagehands',
        conflict_level: 'none',
        sync_status: 'pending'
      },
      {
        id: '4',
        title: 'Wedding Photography',
        company_name: 'Dream Weddings',
        company_logo: '💒',
        location: 'Napa Valley, CA',
        start_date: '2024-01-17T10:00:00Z',
        end_date: '2024-01-17T20:00:00Z',
        hourly_rate: 55,
        status: 'confirmed',
        source: 'other',
        conflict_level: 'none',
        sync_status: 'synced'
      },
      {
        id: '5',
        title: 'Equipment Load-in',
        company_name: 'PCE',
        company_logo: '🌊',
        location: 'San Jose, CA',
        start_date: '2024-01-18T06:00:00Z',
        end_date: '2024-01-18T10:00:00Z',
        hourly_rate: 42,
        status: 'confirmed',
        source: 'pce',
        conflict_level: 'low',
        travel_time: 60,
        notes: 'Early morning start - plan travel time',
        sync_status: 'synced'
      },
      {
        id: '6',
        title: 'Festival Setup',
        company_name: 'Giglife',
        company_logo: '🎵',
        location: 'Golden Gate Park, SF',
        start_date: '2024-01-18T12:00:00Z',
        end_date: '2024-01-18T20:00:00Z',
        hourly_rate: 50,
        status: 'confirmed',
        source: 'giglife',
        conflict_level: 'high',
        travel_time: 30,
        notes: 'CONFLICT: Overlaps with PCE gig - need to choose',
        sync_status: 'error'
      }
    ];

    setGigs(mockGigs);
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
      case 'high': return 'border-l-red-500 bg-red-50';
      case 'medium': return 'border-l-yellow-500 bg-yellow-50';
      case 'low': return 'border-l-blue-500 bg-blue-50';
      default: return 'border-l-green-500 bg-white';
    }
  };

  const getSourceColor = (source: string) => {
    switch (source) {
      case 'rhino': return 'bg-purple-100 text-purple-800';
      case 'giglife': return 'bg-blue-100 text-blue-800';
      case 'stagehands': return 'bg-green-100 text-green-800';
      case 'pce': return 'bg-cyan-100 text-cyan-800';
      case 'flexora': return 'bg-indigo-100 text-indigo-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'confirmed': return 'bg-green-100 text-green-800';
      case 'pending': return 'bg-yellow-100 text-yellow-800';
      case 'completed': return 'bg-gray-100 text-gray-800';
      case 'cancelled': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getSyncIcon = (status: string) => {
    switch (status) {
      case 'synced': return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'pending': return <Sync className="h-4 w-4 text-yellow-500 animate-spin" />;
      case 'error': return <XCircle className="h-4 w-4 text-red-500" />;
      default: return <Clock className="h-4 w-4 text-gray-500" />;
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
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Unified Schedule</h2>
          <p className="text-gray-600 mt-2">
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
              <Calendar className="h-8 w-8 text-blue-600" />
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">This Week</p>
                <p className="text-2xl font-bold">{filteredGigs.length} gigs</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center">
              <DollarSign className="h-8 w-8 text-green-600" />
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Potential Earnings</p>
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
                <p className="text-sm font-medium text-gray-600">Conflicts</p>
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
                <p className="text-sm font-medium text-gray-600">Companies</p>
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
              <Filter className="h-4 w-4 text-gray-500" />
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
        <Alert className="border-yellow-200 bg-yellow-50">
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
                      
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-gray-600">
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
                        <div className="mt-3 p-3 bg-gray-50 rounded-lg">
                          <p className="text-sm text-gray-700">{gig.notes}</p>
                        </div>
                      )}

                      {gig.conflict_level !== 'none' && (
                        <div className="mt-3">
                          <Badge className="bg-red-100 text-red-800">
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
                    <div className="text-sm text-gray-500">
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
              <Calendar className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No Gigs Scheduled</h3>
              <p className="text-gray-600">
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