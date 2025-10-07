import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CircleCheck as CheckCircle, Circle as XCircle, Clock, MapPin, DollarSign, Calendar, Eye, MessageSquare } from 'lucide-react';
import { format } from 'date-fns';

interface ApplicationCardProps {
  application: any;
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
      default: return <Clock className="h-4 w-4 text-gray-500" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'accepted': return 'bg-green-100 text-green-800';
      case 'rejected': return 'bg-red-100 text-red-800';
      case 'pending': return 'bg-yellow-100 text-yellow-800';
      default: return 'bg-gray-100 text-gray-800';
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
            <div className="text-3xl">{application.gig.company.avatar}</div>
            <div className="flex-1">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">
                    {application.gig?.title || 'Unknown Gig'}
                  </h3>
                  <p className="text-gray-600">{application.gig?.company?.name || 'Unknown Company'}</p>
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
                <div className="flex items-center text-sm text-gray-600">
                  <Calendar className="h-4 w-4 mr-2" />
                  {application.gig?.start_date ? format(new Date(application.gig.start_date), 'MMM d') : 'TBD'}
                </div>
                <div className="flex items-center text-sm text-gray-600">
                  <MapPin className="h-4 w-4 mr-2" />
                  {application.gig?.location || 'Location TBD'}
                </div>
                <div className="flex items-center text-sm text-gray-600">
                  <DollarSign className="h-4 w-4 mr-2" />
                  ${application.proposed_rate || application.gig?.hourly_rate || '0'}/hr
                </div>
                <div className="flex items-center text-sm text-gray-600">
                  <Eye className="h-4 w-4 mr-2" />
                  {application.views || 0} views
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4 text-sm text-gray-500">
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
                <div className="mt-4 p-3 bg-gray-50 rounded-lg">
                  <p className="text-sm text-gray-700">
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