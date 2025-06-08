import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/contexts/AuthContext';
import { useApplications } from '@/hooks/useSupabaseQuery';
import { 
  Clock,
  CheckCircle,
  XCircle,
  Calendar,
  MapPin,
  DollarSign,
  Building2,
  MessageSquare,
  TrendingUp,
  AlertCircle,
  Eye,
  MoreHorizontal
} from 'lucide-react';
import { format } from 'date-fns';
import { useNavigate } from 'react-router-dom';

const WorkerApplications: React.FC = () => {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [selectedTab, setSelectedTab] = useState('all');

  // Fetch applications
  const { data: applications = [] } = useApplications({ workerId: profile?.id });

  // Mock enhanced application data
  const enhancedApplications = [
    {
      id: '1',
      gig: {
        id: 'gig-1',
        title: 'Camera Operator for Corporate Event',
        company: { name: 'TechCorp Events', avatar: '🏢' },
        location: 'San Francisco, CA',
        start_date: '2024-01-15T09:00:00Z',
        hourly_rate: 45
      },
      status: 'accepted',
      application_date: '2024-01-10T10:00:00Z',
      response_date: '2024-01-12T14:30:00Z',
      cover_letter: 'I have 5 years of experience in corporate video production...',
      proposed_rate: 45,
      notes: 'Welcome to the team! Please arrive 30 minutes early for setup.',
      views: 12,
      response_time: '2 days'
    },
    {
      id: '2',
      gig: {
        id: 'gig-2',
        title: 'Sound Engineer for Wedding',
        company: { name: 'Dream Weddings', avatar: '💒' },
        location: 'Napa Valley, CA',
        start_date: '2024-01-20T14:00:00Z',
        hourly_rate: 55
      },
      status: 'pending',
      application_date: '2024-01-08T15:30:00Z',
      cover_letter: 'Experienced sound engineer with wedding expertise...',
      proposed_rate: 55,
      views: 8,
      response_time: 'pending'
    },
    {
      id: '3',
      gig: {
        id: 'gig-3',
        title: 'Lighting Technician for Concert',
        company: { name: 'Live Music Productions', avatar: '🎵' },
        location: 'Los Angeles, CA',
        start_date: '2024-01-25T18:00:00Z',
        hourly_rate: 50
      },
      status: 'rejected',
      application_date: '2024-01-05T12:00:00Z',
      response_date: '2024-01-07T09:15:00Z',
      cover_letter: 'Professional lighting technician with concert experience...',
      proposed_rate: 52,
      notes: 'Thank you for your interest. We went with someone with more LED experience.',
      views: 15,
      response_time: '2 days'
    },
    {
      id: '4',
      gig: {
        id: 'gig-4',
        title: 'Video Editor - Remote Project',
        company: { name: 'Creative Studios', avatar: '🎬' },
        location: 'Remote',
        start_date: '2024-01-18T09:00:00Z',
        hourly_rate: 40
      },
      status: 'pending',
      application_date: '2024-01-12T11:20:00Z',
      cover_letter: 'Remote video editing specialist with documentary experience...',
      proposed_rate: 42,
      views: 5,
      response_time: 'pending'
    }
  ];

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'accepted': return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'rejected': return <XCircle className="h-4 w-4 text-red-500" />;
      case 'pending': return <Clock className="h-4 w-4 text-yellow-500" />;
      default: return <AlertCircle className="h-4 w-4 text-gray-500" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'accepted': return 'bg-green-100 text-green-800 border-green-200';
      case 'rejected': return 'bg-red-100 text-red-800 border-red-200';
      case 'pending': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const filteredApplications = enhancedApplications.filter(app => {
    if (selectedTab === 'all') return true;
    return app.status === selectedTab;
  });

  const stats = {
    total: enhancedApplications.length,
    pending: enhancedApplications.filter(app => app.status === 'pending').length,
    accepted: enhancedApplications.filter(app => app.status === 'accepted').length,
    rejected: enhancedApplications.filter(app => app.status === 'rejected').length,
    responseRate: Math.round((enhancedApplications.filter(app => app.status !== 'pending').length / enhancedApplications.length) * 100)
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">My Applications</h1>
              <p className="text-gray-600 mt-1">
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
                  <span className="text-sm text-gray-600">Total Applications</span>
                  <span className="font-semibold text-lg">{stats.total}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Response Rate</span>
                  <span className="font-semibold text-lg text-green-600">{stats.responseRate}%</span>
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
                <div className="p-3 bg-blue-50 rounded-lg">
                  <p className="font-medium text-blue-900">Personalize your cover letter</p>
                  <p className="text-blue-700">Mention specific skills relevant to each gig</p>
                </div>
                <div className="p-3 bg-green-50 rounded-lg">
                  <p className="font-medium text-green-900">Apply early</p>
                  <p className="text-green-700">Early applications get more attention</p>
                </div>
                <div className="p-3 bg-purple-50 rounded-lg">
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

              <TabsContent value={selectedTab} className="mt-6">
                <div className="space-y-4">
                  {filteredApplications.map((application) => (
                    <Card 
                      key={application.id} 
                      className="hover:shadow-md transition-shadow cursor-pointer"
                      onClick={() => navigate(`/gigs/${application.gig.id}`)}
                    >
                      <CardContent className="p-6">
                        <div className="flex items-start justify-between">
                          <div className="flex items-start space-x-4 flex-1">
                            <div className="text-3xl">{application.gig.company.avatar}</div>
                            <div className="flex-1">
                              <div className="flex items-start justify-between mb-3">
                                <div>
                                  <h3 className="text-lg font-semibold text-gray-900">
                                    {application.gig.title}
                                  </h3>
                                  <p className="text-gray-600">{application.gig.company.name}</p>
                                </div>
                                <div className="flex items-center space-x-2">
                                  <Badge className={getStatusColor(application.status)}>
                                    <span className="flex items-center gap-1">
                                      {getStatusIcon(application.status)}
                                      {application.status.charAt(0).toUpperCase() + application.status.slice(1)}
                                    </span>
                                  </Badge>
                                  <Button variant="ghost" size="sm">
                                    <MoreHorizontal className="h-4 w-4" />
                                  </Button>
                                </div>
                              </div>

                              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
                                <div className="flex items-center text-sm text-gray-600">
                                  <Calendar className="h-4 w-4 mr-2" />
                                  {format(new Date(application.gig.start_date), 'MMM d')}
                                </div>
                                <div className="flex items-center text-sm text-gray-600">
                                  <MapPin className="h-4 w-4 mr-2" />
                                  {application.gig.location}
                                </div>
                                <div className="flex items-center text-sm text-gray-600">
                                  <DollarSign className="h-4 w-4 mr-2" />
                                  ${application.proposed_rate}/hr
                                </div>
                                <div className="flex items-center text-sm text-gray-600">
                                  <Eye className="h-4 w-4 mr-2" />
                                  {application.views} views
                                </div>
                              </div>

                              <div className="flex items-center justify-between">
                                <div className="flex items-center space-x-4 text-sm text-gray-500">
                                  <span>Applied {format(new Date(application.application_date), 'MMM d, yyyy')}</span>
                                  {application.response_date && (
                                    <span>• Response in {application.response_time}</span>
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
                  ))}
                </div>

                {filteredApplications.length === 0 && (
                  <Card>
                    <CardContent className="text-center py-12">
                      <MessageSquare className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                      <h3 className="text-lg font-medium text-gray-900 mb-2">
                        No {selectedTab === 'all' ? '' : selectedTab} applications
                      </h3>
                      <p className="text-gray-600 mb-4">
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