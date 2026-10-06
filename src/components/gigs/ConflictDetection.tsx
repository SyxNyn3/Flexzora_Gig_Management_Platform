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
        worker_name: 'Marcus Webb',
        conflicting_gigs: [
          {
            id: 'gig-2',
            title: 'Strike & Load-Out — Festival Main',
            company: 'Giglife',
            start_date: '2024-01-15T14:00:00Z',
            end_date: '2024-01-15T22:00:00Z',
            location: 'Golden Gate Park, SF',
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
        worker_name: 'Priya Raman',
        conflicting_gigs: [
          {
            id: 'gig-3',
            title: 'Load-In & Rigging Call — Truss Build',
            company: 'PCE',
            start_date: '2024-01-15T06:00:00Z',
            end_date: '2024-01-15T08:00:00Z',
            location: 'Convention Center Ballroom C',
            status: 'confirmed'
          }
        ],
        conflict_type: 'travel_time',
        severity: 'medium',
        auto_resolvable: true,
        suggested_resolution: 'Allow 2 hours travel time between Ballroom C and Stadium Main Stage'
      },
      {
        id: '3',
        worker_id: 'worker-3',
        worker_name: 'Devon Carter',
        conflicting_gigs: [
          {
            id: 'gig-4',
            title: 'Show Call / System Ops — Arena PA',
            company: 'Rhino Staging',
            start_date: '2024-01-14T20:00:00Z',
            end_date: '2024-01-15T02:00:00Z',
            location: 'Stadium Main Stage',
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
      case 'critical': return 'bg-red-100 text-red-800 border-red-200';
      case 'high': return 'bg-orange-100 text-orange-800 border-orange-200';
      case 'medium': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'low': return 'bg-blue-100 text-blue-800 border-blue-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getConflictIcon = (type: string) => {
    switch (type) {
      case 'overlap': return <XCircle className="h-5 w-5 text-red-500" />;
      case 'travel_time': return <Clock className="h-5 w-5 text-yellow-500" />;
      case 'back_to_back': return <Info className="h-5 w-5 text-blue-500" />;
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
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Schedule Conflict Detection</h2>
        <p className="text-gray-600 mt-2">
          Automatically detect and resolve scheduling conflicts for {gigTitle}
        </p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center">
              <Users className="h-8 w-8 text-blue-600" />
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Total Workers</p>
                <p className="text-2xl font-bold">{workers.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center">
              <AlertTriangle className="h-8 w-8 text-red-600" />
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Conflicts Found</p>
                <p className="text-2xl font-bold text-red-600">{conflicts.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center">
              <CheckCircle className="h-8 w-8 text-green-600" />
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Auto-Resolvable</p>
                <p className="text-2xl font-bold text-green-600">
                  {conflicts.filter(c => c.auto_resolvable).length}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center">
              <XCircle className="h-8 w-8 text-orange-600" />
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Needs Attention</p>
                <p className="text-2xl font-bold text-orange-600">
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
                  <div className="bg-blue-50 p-4 rounded-lg">
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
                        <div key={gig.id} className="bg-red-50 p-3 rounded-lg">
                          <div className="flex items-center justify-between">
                            <div>
                              <h5 className="font-medium text-red-900">{gig.title}</h5>
                              <p className="text-sm text-red-700">{gig.company}</p>
                              <div className="flex items-center space-x-4 mt-1 text-xs text-red-600">
                                <span>{format(parseISO(gig.start_date), 'MMM d, h:mm a')} - {format(parseISO(gig.end_date), 'h:mm a')}</span>
                                <span>{gig.location}</span>
                              </div>
                            </div>
                            <Badge variant="outline" className="text-red-700 border-red-300">
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
            <h3 className="text-lg font-medium text-gray-900 mb-2">No Conflicts Detected</h3>
            <p className="text-gray-600">
              All workers are available for this gig with no scheduling conflicts.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default ConflictDetection;