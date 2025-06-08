import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useAuth } from '@/contexts/AuthContext';
import { 
  Calendar, 
  DollarSign, 
  Users, 
  TrendingUp,
  MapPin,
  Clock,
  AlertCircle,
  Plus,
  Briefcase
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

// Mock data for demo
const mockStats = {
  totalGigs: 12,
  pendingApplications: 3,
  upcomingGigs: 5,
  totalEarnings: 15420,
  pendingPayments: 2800,
  thisMonthExpenses: 450,
};

const mockRecentGigs = [
  {
    id: '1',
    title: 'Camera Operator for Corporate Event',
    company: { name: 'TechCorp Events', logo_url: null },
    location: 'San Francisco, CA',
    hourly_rate: 45,
    start_date: '2024-01-15T09:00:00Z',
  },
  {
    id: '2',
    title: 'Sound Engineer for Wedding',
    company: { name: 'Dream Weddings', logo_url: null },
    location: 'Napa Valley, CA',
    hourly_rate: 55,
    start_date: '2024-01-20T14:00:00Z',
  },
  {
    id: '3',
    title: 'Lighting Technician for Concert',
    company: { name: 'Live Music Productions', logo_url: null },
    location: 'Los Angeles, CA',
    hourly_rate: 50,
    start_date: '2024-01-25T18:00:00Z',
  },
];

const mockApplications = [
  {
    id: '1',
    gig: { title: 'Video Editor for Documentary', location: 'Remote' },
    status: 'pending',
    application_date: '2024-01-10T10:00:00Z',
  },
  {
    id: '2',
    gig: { title: 'Stage Manager for Theater', location: 'New York, NY' },
    status: 'accepted',
    application_date: '2024-01-08T15:30:00Z',
  },
];

const Dashboard: React.FC = () => {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [stats] = useState(mockStats);
  const [recentGigs] = useState(mockRecentGigs);
  const [recentApplications] = useState(mockApplications);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Simulate loading
    const timer = setTimeout(() => setLoading(false), 1000);
    return () => clearTimeout(timer);
  }, []);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-yellow-100 text-yellow-800';
      case 'accepted': return 'bg-green-100 text-green-800';
      case 'rejected': return 'bg-red-100 text-red-800';
      case 'published': return 'bg-blue-100 text-blue-800';
      case 'completed': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Welcome Section */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">
          Welcome back, {profile?.full_name || 'User'}!
        </h1>
        <p className="text-gray-600 mt-2">
          Here's what's happening with your gigs today.
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Gigs</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalGigs}</div>
            <p className="text-xs text-muted-foreground">
              Gigs completed or in progress
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Applications</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.pendingApplications}</div>
            <p className="text-xs text-muted-foreground">
              Awaiting response
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Earnings</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${stats.totalEarnings.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              From completed gigs
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Upcoming Gigs</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.upcomingGigs}</div>
            <p className="text-xs text-muted-foreground">
              Scheduled this month
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Recent Applications */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Applications</CardTitle>
            <CardDescription>
              Your latest gig applications and their status
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {recentApplications.length > 0 ? (
                recentApplications.map((application) => (
                  <div key={application.id} className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="flex-1">
                      <h4 className="font-medium">{application.gig?.title}</h4>
                      <p className="text-sm text-gray-600">
                        Applied {new Date(application.application_date).toLocaleDateString()}
                      </p>
                      {application.gig?.location && (
                        <p className="text-sm text-gray-500 flex items-center mt-1">
                          <MapPin className="w-3 h-3 mr-1" />
                          {application.gig.location}
                        </p>
                      )}
                    </div>
                    <Badge className={getStatusColor(application.status)}>
                      {application.status}
                    </Badge>
                  </div>
                ))
              ) : (
                <p className="text-gray-500 text-center py-4">No applications yet</p>
              )}
            </div>
            {recentApplications.length > 0 && (
              <Button variant="outline" className="w-full mt-4" onClick={() => navigate('/applications')}>
                View All Applications
              </Button>
            )}
          </CardContent>
        </Card>

        {/* Available Gigs */}
        <Card>
          <CardHeader>
            <CardTitle>Available Gigs</CardTitle>
            <CardDescription>
              Latest gig opportunities matching your profile
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {recentGigs.length > 0 ? (
                recentGigs.slice(0, 4).map((gig) => (
                  <div key={gig.id} className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50 cursor-pointer"
                       onClick={() => navigate(`/gigs/${gig.id}`)}>
                    <div className="flex items-center space-x-3">
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={gig.company?.logo_url || ''} />
                        <AvatarFallback>
                          {gig.company?.name?.charAt(0) || 'C'}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <h4 className="font-medium text-sm">{gig.title}</h4>
                        <p className="text-xs text-gray-600">{gig.company?.name}</p>
                        <p className="text-xs text-gray-500 flex items-center">
                          <MapPin className="w-3 h-3 mr-1" />
                          {gig.location}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      {gig.hourly_rate && (
                        <p className="text-sm font-medium">${gig.hourly_rate}/hr</p>
                      )}
                      <p className="text-xs text-gray-500">
                        {new Date(gig.start_date).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-gray-500 text-center py-4">No gigs available</p>
              )}
            </div>
            <Button className="w-full mt-4" onClick={() => navigate('/gigs')}>
              Browse All Gigs
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <Card className="mt-8">
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
          <CardDescription>
            Common tasks to get you started
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Button variant="outline" className="h-20 flex flex-col" onClick={() => navigate('/profile')}>
              <Users className="h-6 w-6 mb-2" />
              <span>Update Profile</span>
            </Button>
            <Button variant="outline" className="h-20 flex flex-col" onClick={() => navigate('/gigs')}>
              <Briefcase className="h-6 w-6 mb-2" />
              <span>Find Gigs</span>
            </Button>
            <Button variant="outline" className="h-20 flex flex-col" onClick={() => navigate('/finances')}>
              <DollarSign className="h-6 w-6 mb-2" />
              <span>Track Finances</span>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Pending Payments Alert */}
      {stats.pendingPayments > 0 && (
        <Card className="mt-8 border-yellow-200 bg-yellow-50">
          <CardContent className="pt-6">
            <div className="flex items-center space-x-3">
              <AlertCircle className="h-5 w-5 text-yellow-600" />
              <div>
                <h4 className="font-medium text-yellow-800">
                  You have ${stats.pendingPayments.toLocaleString()} in pending payments
                </h4>
                <p className="text-sm text-yellow-700">
                  Some of your payments are still being processed.
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={() => navigate('/finances')}>
                Review
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default Dashboard;