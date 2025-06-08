import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { GigApplication, Gig } from '@/lib/types';
import { 
  CheckCircle, 
  XCircle, 
  Clock, 
  User,
  Mail,
  Phone,
  MapPin,
  DollarSign,
  Calendar,
  MessageSquare
} from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';

interface ApplicationsManagerProps {
  gigId?: string;
}

const ApplicationsManager: React.FC<ApplicationsManagerProps> = ({ gigId }) => {
  const { profile } = useAuth();
  const [applications, setApplications] = useState<GigApplication[]>([]);
  const [selectedApplication, setSelectedApplication] = useState<GigApplication | null>(null);
  const [showResponseDialog, setShowResponseDialog] = useState(false);
  const [responseNotes, setResponseNotes] = useState('');
  const [responseAction, setResponseAction] = useState<'accept' | 'reject'>('accept');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (profile) {
      fetchApplications();
    }
  }, [profile, gigId]);

  const fetchApplications = async () => {
    if (!profile) return;

    try {
      setLoading(true);
      
      let query = supabase
        .from('gig_applications')
        .select(`
          *,
          gig:gigs(
            id,
            title,
            start_date,
            end_date,
            location,
            hourly_rate,
            company:companies(name)
          ),
          worker:profiles(
            id,
            full_name,
            email,
            phone,
            location,
            avatar_url,
            hourly_rate,
            experience_years,
            bio
          )
        `)
        .order('application_date', { ascending: false });

      if (gigId) {
        query = query.eq('gig_id', gigId);
      } else if (profile.role === 'company') {
        // Get applications for gigs created by this company
        const { data: companyGigs } = await supabase
          .from('gigs')
          .select('id')
          .eq('created_by', profile.id);
        
        if (companyGigs && companyGigs.length > 0) {
          const gigIds = companyGigs.map(gig => gig.id);
          query = query.in('gig_id', gigIds);
        } else {
          setApplications([]);
          return;
        }
      } else {
        // Workers see their own applications
        query = query.eq('worker_id', profile.id);
      }

      const { data, error } = await query;

      if (error) throw error;
      setApplications(data || []);
    } catch (error) {
      console.error('Error fetching applications:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleApplicationResponse = async () => {
    if (!selectedApplication) return;

    setSubmitting(true);
    try {
      const { error } = await supabase
        .from('gig_applications')
        .update({
          status: responseAction,
          response_date: new Date().toISOString(),
          notes: responseNotes || null,
        })
        .eq('id', selectedApplication.id);

      if (error) throw error;

      toast.success(`Application ${responseAction}ed successfully!`);
      setShowResponseDialog(false);
      setSelectedApplication(null);
      setResponseNotes('');
      await fetchApplications();
    } catch (error: any) {
      console.error('Error updating application:', error);
      toast.error(error.message || 'Failed to update application');
    } finally {
      setSubmitting(false);
    }
  };

  const openResponseDialog = (application: GigApplication, action: 'accept' | 'reject') => {
    setSelectedApplication(application);
    setResponseAction(action);
    setShowResponseDialog(true);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-yellow-100 text-yellow-800';
      case 'accepted': return 'bg-green-100 text-green-800';
      case 'rejected': return 'bg-red-100 text-red-800';
      case 'withdrawn': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pending': return <Clock className="h-4 w-4" />;
      case 'accepted': return <CheckCircle className="h-4 w-4" />;
      case 'rejected': return <XCircle className="h-4 w-4" />;
      default: return <Clock className="h-4 w-4" />;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900">
          {gigId ? 'Gig Applications' : 'Application Management'}
        </h2>
        <p className="text-gray-600 mt-2">
          {profile?.role === 'company' 
            ? 'Review and respond to worker applications'
            : 'Track your gig applications'
          }
        </p>
      </div>

      {/* Applications List */}
      {applications.length > 0 ? (
        <div className="space-y-4">
          {applications.map((application) => (
            <Card key={application.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div className="flex items-start space-x-4 flex-1">
                    <Avatar className="h-12 w-12">
                      <AvatarImage src={application.worker?.avatar_url} />
                      <AvatarFallback>
                        {application.worker?.full_name?.split(' ').map(n => n[0]).join('') || 'W'}
                      </AvatarFallback>
                    </Avatar>
                    
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <h3 className="font-semibold text-lg">
                            {application.worker?.full_name}
                          </h3>
                          <p className="text-sm text-gray-600">
                            Applied for: {application.gig?.title}
                          </p>
                        </div>
                        <Badge className={getStatusColor(application.status)}>
                          <span className="flex items-center gap-1">
                            {getStatusIcon(application.status)}
                            {application.status.charAt(0).toUpperCase() + application.status.slice(1)}
                          </span>
                        </Badge>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4 text-sm text-gray-600">
                        <div className="flex items-center">
                          <Calendar className="h-4 w-4 mr-2" />
                          Applied {format(new Date(application.application_date), 'MMM d, yyyy')}
                        </div>
                        
                        {application.worker?.experience_years && (
                          <div className="flex items-center">
                            <User className="h-4 w-4 mr-2" />
                            {application.worker.experience_years} years exp.
                          </div>
                        )}
                        
                        {application.worker?.location && (
                          <div className="flex items-center">
                            <MapPin className="h-4 w-4 mr-2" />
                            {application.worker.location}
                          </div>
                        )}
                        
                        {application.proposed_rate && (
                          <div className="flex items-center">
                            <DollarSign className="h-4 w-4 mr-2" />
                            ${application.proposed_rate}/hr
                          </div>
                        )}
                      </div>

                      {application.cover_letter && (
                        <div className="mb-4">
                          <h4 className="font-medium mb-2">Cover Letter:</h4>
                          <p className="text-gray-700 text-sm bg-gray-50 p-3 rounded-lg">
                            {application.cover_letter}
                          </p>
                        </div>
                      )}

                      {application.worker?.bio && (
                        <div className="mb-4">
                          <h4 className="font-medium mb-2">About:</h4>
                          <p className="text-gray-700 text-sm">
                            {application.worker.bio}
                          </p>
                        </div>
                      )}

                      {application.notes && (
                        <div className="mb-4">
                          <h4 className="font-medium mb-2">Response Notes:</h4>
                          <p className="text-gray-700 text-sm bg-blue-50 p-3 rounded-lg">
                            {application.notes}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Action Buttons */}
                  {profile?.role === 'company' && application.status === 'pending' && (
                    <div className="flex space-x-2 ml-4">
                      <Button
                        size="sm"
                        onClick={() => openResponseDialog(application, 'accept')}
                        className="bg-green-600 hover:bg-green-700"
                      >
                        <CheckCircle className="h-4 w-4 mr-1" />
                        Accept
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => openResponseDialog(application, 'reject')}
                      >
                        <XCircle className="h-4 w-4 mr-1" />
                        Reject
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="text-center py-12">
            <MessageSquare className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No Applications</h3>
            <p className="text-gray-600">
              {profile?.role === 'company' 
                ? 'No applications have been received yet.'
                : 'You haven\'t applied to any gigs yet.'
              }
            </p>
          </CardContent>
        </Card>
      )}

      {/* Response Dialog */}
      <Dialog open={showResponseDialog} onOpenChange={setShowResponseDialog}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>
              {responseAction === 'accept' ? 'Accept' : 'Reject'} Application
            </DialogTitle>
            <DialogDescription>
              {responseAction === 'accept' 
                ? 'Accept this worker for the gig. You can add notes about next steps.'
                : 'Reject this application. Consider providing feedback to help the worker improve.'
              }
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">
                {responseAction === 'accept' ? 'Welcome Message' : 'Feedback'} (Optional)
              </label>
              <Textarea
                value={responseNotes}
                onChange={(e) => setResponseNotes(e.target.value)}
                placeholder={
                  responseAction === 'accept' 
                    ? 'Welcome to the team! Here are the next steps...'
                    : 'Thank you for your interest. We decided to go with another candidate because...'
                }
                rows={4}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowResponseDialog(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleApplicationResponse} 
              disabled={submitting}
              className={responseAction === 'accept' ? 'bg-green-600 hover:bg-green-700' : ''}
              variant={responseAction === 'reject' ? 'destructive' : 'default'}
            >
              {submitting ? 'Processing...' : `${responseAction === 'accept' ? 'Accept' : 'Reject'} Application`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ApplicationsManager;