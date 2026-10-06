import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/contexts/AuthContext';
import { useApplications, useRealtimeNotifications } from '@/hooks/useSupabaseQuery';
import ApplicationCard from './ApplicationCard';
import { Clock, MessageSquare, CircleCheck as CheckCircle, Circle as XCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const WorkerApplications: React.FC = () => {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [selectedTab, setSelectedTab] = useState<string>('all');
  const [loading, setLoading] = useState(true);

  // Fetch applications
  const { data: applications = [], loading: applicationsLoading } = useApplications({ workerId: profile?.id });
  
  // Set up real-time notifications for application updates
  useRealtimeNotifications(profile?.id);
  
  useEffect(() => {
    // Set loading to false after a short delay to ensure UI is ready
    if (!applicationsLoading) {
      const timer = setTimeout(() => setLoading(false), 500);
      return () => clearTimeout(timer);
    }
  }, [applicationsLoading]);

  // Enhance applications with additional UI-specific properties
  const enhancedApplications = (applications || []).map(app => {
    // Calculate response time if applicable
    let responseTime = 'pending';
    if (app.response_date && app.application_date) {
      const responseDate = new Date(app.response_date);
      const applicationDate = new Date(app.application_date);
      const diffTime = Math.abs(responseDate.getTime() - applicationDate.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      responseTime = `${diffDays} day${diffDays !== 1 ? 's' : ''}`;
    }
    
    // Get company avatar based on name
    const companyName = app.gig?.company?.name || '';
    let avatar = '🏢'; // Default avatar
    
    if (companyName.toLowerCase().includes('wedding')) {
      avatar = '💒';
    } else if (companyName.toLowerCase().includes('music') || companyName.toLowerCase().includes('concert')) {
      avatar = '🎵';
    } else if (companyName.toLowerCase().includes('studio') || companyName.toLowerCase().includes('film')) {
      avatar = '🎬';
    }
    
    return {
      ...app,
      gig: {
        ...app.gig,
        company: {
          ...app.gig?.company,
          avatar
        }
      },
      views: Math.floor(Math.random() * 20) + 1, // Random view count for UI
      response_time: responseTime
    };
  });

  // Filter applications based on selected tab
  const filteredApplications = (enhancedApplications || []).filter(app => {
    if (selectedTab === 'all') return true;
    return app.status === selectedTab;
  });

  // Calculate application statistics
  const stats = (applications || []).length > 0 ? {
    total: (applications || []).length,
    pending: (applications || []).filter(app => app.status === 'pending').length,
    accepted: (applications || []).filter(app => app.status === 'accepted').length,
    rejected: (applications || []).filter(app => app.status === 'rejected').length,
    responseRate: (applications || []).length > 0
      ? Math.round(((applications || []).filter(app => app.status !== 'pending').length / (applications || []).length) * 100)
      : 0
  } : {
    total: 0,
    pending: 0,
    accepted: 0,
    rejected: 0,
    responseRate: 0
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/50">
      {/* Header */}
      <div className="bg-card border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-2xl font-bold text-foreground">My Applications</h1>
              <p className="text-muted-foreground mt-1">
                Track your gig applications and responses
              </p>
            </div>
            <div className="mt-4 sm:mt-0">
              <Button onClick={() => navigate('/gigs')}>
                Browse More Gigs
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* Stats Sidebar */}
          <div className="lg:col-span-1">
            <Card>
              <CardHeader>
                <CardTitle>Application Stats</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Total Applications</span>
                  <span className="font-semibold text-lg">{stats.total}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Response Rate</span>
                  <span className="font-semibold text-lg text-green-600 dark:text-green-400">{stats.responseRate}%</span>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      <CheckCircle className="h-4 w-4 text-green-500 mr-2" />
                      <span className="text-sm">Accepted</span>
                    </div>
                    <span className="font-medium">{stats.accepted}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      <Clock className="h-4 w-4 text-yellow-500 mr-2" />
                      <span className="text-sm">Pending</span>
                    </div>
                    <span className="font-medium">{stats.pending}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      <XCircle className="h-4 w-4 text-red-500 mr-2" />
                      <span className="text-sm">Rejected</span>
                    </div>
                    <span className="font-medium">{stats.rejected}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Tips */}
            <Card className="mt-6">
              <CardHeader>
                <CardTitle className="text-lg">💡 Application Tips</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="p-3 bg-primary/10 rounded-lg">
                  <p className="font-medium text-blue-900">Personalize your cover letter</p>
                  <p className="text-primary">Mention specific skills relevant to each gig</p>
                </div>
                <div className="p-3 bg-green-500/10 rounded-lg">
                  <p className="font-medium text-green-900">Apply early</p>
                  <p className="text-green-600 dark:text-green-400">Early applications get more attention</p>
                </div>
                <div className="p-3 bg-secondary/10 rounded-lg">
                  <p className="font-medium text-purple-900">Follow up professionally</p>
                  <p className="text-purple-700">Send a polite follow-up after 3-5 days</p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Main Content */}
          <div className="lg:col-span-3">
            <Tabs value={selectedTab} onValueChange={setSelectedTab}>
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="all">All ({stats.total})</TabsTrigger>
                <TabsTrigger value="pending">Pending ({stats.pending})</TabsTrigger>
                <TabsTrigger value="accepted">Accepted ({stats.accepted})</TabsTrigger>
                <TabsTrigger value="rejected">Rejected ({stats.rejected})</TabsTrigger>
              </TabsList>

              <TabsContent value={selectedTab || 'all'} className="mt-6">
                <div className="space-y-4">
                  {filteredApplications.map((application) => (
                    <ApplicationCard 
                      key={application.id}
                      application={application}
                      onViewDetails={(gigId) => navigate(`/gigs/${gigId}`)}
                    />
                  ))}
                </div>

                {filteredApplications.length === 0 && (
                  <Card>
                    <CardContent className="text-center py-12">
                      <MessageSquare className="h-12 w-12 text-muted-foreground/70 mx-auto mb-4" />
                      <h3 className="text-lg font-medium text-foreground mb-2">
                        No {selectedTab === 'all' ? '' : selectedTab} applications
                      </h3>
                      <p className="text-muted-foreground mb-4">
                        {selectedTab === 'all' 
                          ? "You haven't applied to any gigs yet."
                          : `No ${selectedTab} applications found.`
                        }
                      </p>
                      <Button onClick={() => navigate('/gigs')}>
                        Browse Available Gigs
                      </Button>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WorkerApplications;