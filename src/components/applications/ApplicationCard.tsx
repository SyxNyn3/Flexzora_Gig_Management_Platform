import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CircleCheck as CheckCircle, Circle as XCircle, Clock, MapPin, DollarSign, Calendar, Eye, MessageSquare } from 'lucide-react';
import { format } from 'date-fns';
import type { GigApplication, Gig } from '@/lib/types';

type ApplicationWithExtras = GigApplication & {
  views?: number;
  response_time?: string;
  gig?: Gig & { company?: { name?: string; avatar?: string } | null };
};

interface ApplicationCardProps {
  application: ApplicationWithExtras;
  onViewDetails: (id: string | undefined) => void;
}

const ApplicationCard: React.FC<ApplicationCardProps> = ({ 
  application, 
  onViewDetails 
}) => {
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'accepted': return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'rejected': return <XCircle className="h-4 w-4 text-red-500" />;
      case 'pending': return <Clock className="h-4 w-4 text-yellow-500" />;
      default: return <Clock className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'accepted': return 'bg-green-500/15 text-emerald-500 dark:text-green-400';
      case 'rejected': return 'bg-red-500/15 text-destructive dark:text-red-400';
      case 'pending': return 'bg-amber-500/15 text-amber-600 dark:text-amber-400';
      default: return 'bg-muted text-foreground/90';
    }
  };

  return (
    <Card 
      key={application.id} 
      className="hover:shadow-md transition-shadow cursor-pointer"
      onClick={() => onViewDetails(application.gig?.id)}
    >
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div className="flex items-start space-x-4 flex-1">
            <div className="text-3xl">{application.gig?.company?.avatar || '🏢'}</div>
            <div className="flex-1">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="text-lg font-semibold text-foreground">
                    {application.gig?.title || 'Unknown Gig'}
                  </h3>
                  <p className="text-muted-foreground">{application.gig?.company?.name || 'Unknown Company'}</p>
                </div>
                <div className="flex items-center space-x-2">
                  <Badge className={getStatusColor(application.status)}>
                    <span className="flex items-center gap-1">
                      {getStatusIcon(application.status)}
                      {application.status.charAt(0).toUpperCase() + application.status.slice(1)}
                    </span>
                  </Badge>
                </div>
              </div>

              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
                <div className="flex items-center text-sm text-muted-foreground">
                  <Calendar className="h-4 w-4 mr-2" />
                  {application.gig?.start_date ? format(new Date(application.gig.start_date), 'MMM d') : 'TBD'}
                </div>
                <div className="flex items-center text-sm text-muted-foreground">
                  <MapPin className="h-4 w-4 mr-2" />
                  {application.gig?.location || 'Location TBD'}
                </div>
                <div className="flex items-center text-sm text-muted-foreground">
                  <DollarSign className="h-4 w-4 mr-2" />
                  ${application.proposed_rate || application.gig?.hourly_rate || '0'}/hr
                </div>
                <div className="flex items-center text-sm text-muted-foreground">
                  <Eye className="h-4 w-4 mr-2" />
                  {application.views || 0} views
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4 text-sm text-muted-foreground">
                  <span>Applied {format(new Date(application.application_date), 'MMM d, yyyy')}</span>
                  {application.response_date && (
                    <span>• Response in {application.response_time || 'N/A'}</span>
                  )}
                </div>
                <div className="flex items-center space-x-2">
                  {application.status === 'accepted' && (
                    <Button size="sm" className="bg-green-600 hover:bg-green-700">
                      View Details
                    </Button>
                  )}
                  {application.status === 'pending' && (
                    <Button variant="outline" size="sm">
                      <MessageSquare className="h-4 w-4 mr-2" />
                      Follow Up
                    </Button>
                  )}
                </div>
              </div>

              {application.notes && (
                <div className="mt-4 p-3 bg-muted/50 rounded-lg">
                  <p className="text-sm text-foreground/80">
                    <strong>Response:</strong> {application.notes}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default ApplicationCard;