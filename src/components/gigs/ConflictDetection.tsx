import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Calendar, 
  AlertTriangle, 
  Clock,
  MapPin,
  Users,
  CheckCircle,
  XCircle,
  Info
} from 'lucide-react';
import { format, parseISO } from 'date-fns';

interface ScheduleConflict {
  id: string;
  worker_id: string;
  worker_name: string;
  conflicting_gigs: Array<{
    id: string;
    title: string;
    company: string;
    start_date: string;
    end_date: string;
    location: string;
    status: string;
  }>;
  conflict_type: 'overlap' | 'travel_time' | 'back_to_back';
  severity: 'low' | 'medium' | 'high' | 'critical';
  auto_resolvable: boolean;
  suggested_resolution?: string;
}

interface ConflictDetectionProps {
  gigId: string;
  gigTitle: string;
  gigStartDate: string;
  gigEndDate: string;
  gigLocation: string;
  workers: Array<{
    id: string;
    name: string;
    email: string;
    avatar_url?: string;
  }>;
}

const ConflictDetection: React.FC<ConflictDetectionProps> = ({ 
  gigId, 
  gigTitle, 
  gigStartDate, 
  gigEndDate, 
  gigLocation, 
  workers 
}) => {
  const [conflicts, setConflicts] = useState<ScheduleConflict[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    detectConflicts();
  }, [gigId, workers]);

  const detectConflicts = async () => {
    setLoading(true);
    
    // Mock conflict detection
    const mockConflicts: ScheduleConflict[] = [
      {
        id: '1',
        worker_id: 'worker-1',
        worker_name: 'Marcus Delgado',
        conflicting_gigs: [
          {
            id: 'gig-2',
            title: 'Ballroom AV Build',
            company: 'Encore',
            start_date: '2026-10-12T14:00:00Z',
            end_date: '2026-10-12T22:00:00Z',
            location: 'Convention Center Ballroom C, Anaheim, CA',
            status: 'confirmed'
          }
        ],
        conflict_type: 'overlap',
        severity: 'high',
        auto_resolvable: false,
        suggested_resolution: 'Contact worker to choose between gigs or adjust schedule'
      },
      {
        id: '2',
        worker_id: 'worker-2',
        worker_name: 'Tom Okafor',
        conflicting_gigs: [
          {
            id: 'gig-3',
            title: 'LED Wall Calibration',
            company: 'Freeman AV',
            start_date: '2026-10-12T05:00:00Z',
            end_date: '2026-10-12T08:00:00Z',
            location: 'Long Beach Arena, Long Beach, CA',
            status: 'confirmed'
          }
        ],
        conflict_type: 'travel_time',
        severity: 'medium',
        auto_resolvable: true,
        suggested_resolution: 'Allow 90 minutes travel time between Long Beach Arena and the stadium'
      },
      {
        id: '3',
        worker_id: 'worker-3',
        worker_name: 'Jesse Kowalski',
        conflicting_gigs: [
          {
            id: 'gig-4',
            title: 'Strike & Load-Out',
            company: 'Rhino Staging',
            start_date: '2026-10-11T22:00:00Z',
            end_date: '2026-10-12T06:00:00Z',
            location: 'Greek Theatre, Los Angeles, CA',
            status: 'confirmed'
          }
        ],
        conflict_type: 'back_to_back',
        severity: 'low',
        auto_resolvable: true,
        suggested_resolution: 'Schedule allows adequate rest time between gigs'
      }
    ];

    // Simulate API delay
    setTimeout(() => {
      setConflicts(mockConflicts);
      setLoading(false);
    }, 1000);
  };

  const resolveConflict = async (conflictId: string, resolution: 'accept' | 'reject' | 'modify') => {
    setConflicts(prev => prev.filter(c => c.id !== conflictId));
    
    switch (resolution) {
      case 'accept':
        // Accept the suggested resolution
        break;
      case 'reject':
        // Reject and keep conflict
        break;
      case 'modify':
        // Open modification dialog
        break;
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30';
      case 'high': return 'bg-amber-500/15 text-orange-800 border-orange-200';
      case 'medium': return 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30';
      case 'low': return 'bg-primary/15 text-blue-800 border-primary/30';
      default: return 'bg-muted text-foreground/90 border-border';
    }
  };

  const getConflictIcon = (type: string) => {
    switch (type) {
      case 'overlap': return <XCircle className="h-5 w-5 text-red-500" />;
      case 'travel_time': return <Clock className="h-5 w-5 text-yellow-500" />;
      case 'back_to_back': return <Info className="h-5 w-5 text-primary" />;
      default: return <AlertTriangle className="h-5 w-5 text-orange-500" />;
    }
  };

  const getConflictDescription = (conflict: ScheduleConflict) => {
    switch (conflict.conflict_type) {
      case 'overlap':
        return 'Schedule overlap detected - worker has conflicting commitments';
      case 'travel_time':
        return 'Insufficient travel time between locations';
      case 'back_to_back':
        return 'Back-to-back gigs may cause fatigue';
      default:
        return 'Schedule conflict detected';
    }
  };

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
      <div>
        <h2 className="text-2xl font-bold text-foreground">Schedule Conflict Detection</h2>
        <p className="text-muted-foreground mt-2">
          Automatically detect and resolve scheduling conflicts for {gigTitle}
        </p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center">
              <Users className="h-8 w-8 text-primary" />
              <div className="ml-4">
                <p className="text-sm font-medium text-muted-foreground">Total Workers</p>
                <p className="text-2xl font-bold">{workers.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center">
              <AlertTriangle className="h-8 w-8 text-red-600 dark:text-red-400" />
              <div className="ml-4">
                <p className="text-sm font-medium text-muted-foreground">Conflicts Found</p>
                <p className="text-2xl font-bold text-red-600 dark:text-red-400">{conflicts.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center">
              <CheckCircle className="h-8 w-8 text-green-600 dark:text-green-400" />
              <div className="ml-4">
                <p className="text-sm font-medium text-muted-foreground">Auto-Resolvable</p>
                <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                  {conflicts.filter(c => c.auto_resolvable).length}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center">
              <XCircle className="h-8 w-8 text-amber-600 dark:text-amber-400" />
              <div className="ml-4">
                <p className="text-sm font-medium text-muted-foreground">Needs Attention</p>
                <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">
                  {conflicts.filter(c => !c.auto_resolvable).length}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Conflicts List */}
      {conflicts.length > 0 ? (
        <div className="space-y-4">
          {conflicts.map((conflict) => (
            <Card key={conflict.id} className="border-l-4 border-l-orange-400">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex items-start space-x-3">
                    {getConflictIcon(conflict.conflict_type)}
                    <div>
                      <CardTitle className="text-lg">{conflict.worker_name}</CardTitle>
                      <CardDescription>
                        {getConflictDescription(conflict)}
                      </CardDescription>
                    </div>
                  </div>
                  <Badge className={getSeverityColor(conflict.severity)}>
                    {conflict.severity.toUpperCase()}
                  </Badge>
                </div>
              </CardHeader>
              
              <CardContent>
                <div className="space-y-4">
                  {/* Current Gig Info */}
                  <div className="bg-primary/10 p-4 rounded-lg">
                    <h4 className="font-medium text-blue-900 mb-2">Current Gig</h4>
                    <div className="space-y-1 text-sm text-blue-800">
                      <div className="flex items-center">
                        <Calendar className="h-4 w-4 mr-2" />
                        {format(parseISO(gigStartDate), 'MMM d, yyyy h:mm a')} - {format(parseISO(gigEndDate), 'MMM d, yyyy h:mm a')}
                      </div>
                      <div className="flex items-center">
                        <MapPin className="h-4 w-4 mr-2" />
                        {gigLocation}
                      </div>
                    </div>
                  </div>

                  {/* Conflicting Gigs */}
                  <div>
                    <h4 className="font-medium mb-2">Conflicting Commitments</h4>
                    <div className="space-y-2">
                      {conflict.conflicting_gigs.map((gig) => (
                        <div key={gig.id} className="bg-red-500/10 p-3 rounded-lg">
                          <div className="flex items-center justify-between">
                            <div>
                              <h5 className="font-medium text-red-900">{gig.title}</h5>
                              <p className="text-sm text-red-600 dark:text-red-400">{gig.company}</p>
                              <div className="flex items-center space-x-4 mt-1 text-xs text-red-600 dark:text-red-400">
                                <span>{format(parseISO(gig.start_date), 'MMM d, h:mm a')} - {format(parseISO(gig.end_date), 'h:mm a')}</span>
                                <span>{gig.location}</span>
                              </div>
                            </div>
                            <Badge variant="outline" className="text-red-600 dark:text-red-400 border-red-500/40">
                              {gig.status}
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Suggested Resolution */}
                  {conflict.suggested_resolution && (
                    <Alert>
                      <Info className="h-4 w-4" />
                      <AlertDescription>
                        <strong>Suggested Resolution:</strong> {conflict.suggested_resolution}
                      </AlertDescription>
                    </Alert>
                  )}

                  {/* Actions */}
                  <div className="flex space-x-2 pt-2">
                    {conflict.auto_resolvable ? (
                      <Button 
                        size="sm" 
                        onClick={() => resolveConflict(conflict.id, 'accept')}
                        className="bg-green-600 hover:bg-green-700"
                      >
                        <CheckCircle className="h-4 w-4 mr-1" />
                        Auto-Resolve
                      </Button>
                    ) : (
                      <>
                        <Button 
                          size="sm" 
                          variant="outline"
                          onClick={() => resolveConflict(conflict.id, 'modify')}
                        >
                          Modify Schedule
                        </Button>
                        <Button 
                          size="sm" 
                          variant="outline"
                          onClick={() => resolveConflict(conflict.id, 'reject')}
                        >
                          Contact Worker
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="text-center py-12">
            <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-foreground mb-2">No Conflicts Detected</h3>
            <p className="text-muted-foreground">
              All workers are available for this gig with no scheduling conflicts.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default ConflictDetection;