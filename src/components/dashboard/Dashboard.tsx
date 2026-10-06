import React, { useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useAuth } from '@/contexts/AuthContext';
import { useGigs, useApplications, usePayments, useRealtimeNotifications } from '@/hooks/useSupabaseQuery';
import { 
  Calendar, 
  DollarSign, 
  Users, 
  TrendingUp,
  MapPin,
  Clock,
  AlertCircle,
  Briefcase
} from 'lucide-react';
import { Building } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';

const Dashboard: React.FC = () => {
  const { profile } = useAuth();
  const navigate = useNavigate();
  
  // Fetch data using hooks
  const { data: gigs = [], loading: gigsLoading } = useGigs({ status: 'published' });
  const { data: applications = [], loading: applicationsLoading } = useApplications({ 
    workerId: profile?.id 
  });
  const { data: payments = [], loading: paymentsLoading } = usePayments({ 
    workerId: profile?.id 
  });
  
  // Set up real-time notifications
  useRealtimeNotifications(profile?.id, (notification) => {
    console.log('New notification received:', notification);
  });
  
  // Calculate stats from real data
  const stats = {
    totalGigs: (applications || []).filter(app => app.status === 'accepted').length,
    pendingApplications: (applications || []).filter(app => app.status === 'pending').length,
    upcomingGigs: (applications || []).filter(app => {
      const startDate = app.gig?.start_date ? new Date(app.gig.start_date) : null;
      const now = new Date();
      return app.status === 'accepted' && startDate && startDate > now;
    }).length,
    totalEarnings: payments
      ? payments.filter(payment => payment.status === 'paid')
          .reduce((sum, payment) => sum + payment.amount, 0)
      : 15420, // Fallback to mock data
    pendingPayments: payments
      ? payments.filter(payment => payment.status === 'pending')
          .reduce((sum, payment) => sum + payment.amount, 0)
      : 2800,
    thisMonthExpenses: 450, // Placeholder
  };
  
  // Get recent gigs from real data
  const recentGigs = (gigs || []).slice(0, 3);
  
  // Get recent applications from real data
  const recentApplications = (applications || []).slice(0, 2);
  
  // Loading state
  const loading = gigsLoading || applicationsLoading || paymentsLoading;

  useEffect(() => {
    // Additional initialization if needed
  }, []);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-amber-500/15 text-amber-600 dark:text-amber-400';
      case 'accepted': return 'bg-green-500/15 text-emerald-500 dark:text-green-400';
      case 'rejected': return 'bg-red-500/15 text-destructive dark:text-red-400';
      case 'published': return 'bg-primary/15 text-primary';
      case 'completed': return 'bg-muted text-foreground/90';
      default: return 'bg-muted text-foreground/90';
    }
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Skeleton loader for stats */}
        <div className="mb-8">
          <div className="h-8 w-64 bg-muted rounded animate-pulse mb-2"></div>
          <div className="h-4 w-96 bg-muted rounded animate-pulse"></div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="bg-card p-6 rounded-lg shadow animate-pulse">
              <div className="flex justify-between items-center mb-4">
                <div className="h-4 w-24 bg-muted rounded"></div>
                <div className="h-4 w-4 bg-muted rounded-full"></div>
              </div>
              <div className="h-8 w-16 bg-muted rounded mb-1"></div>
              <div className="h-3 w-32 bg-muted rounded"></div>
            </div>
          ))}
        </div>
        
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {[1, 2].map((i) => (
            <div key={i} className="bg-card p-6 rounded-lg shadow animate-pulse">
              <div className="flex justify-between items-center mb-6">
                <div className="h-6 w-48 bg-muted rounded"></div>
                <div className="h-4 w-24 bg-muted rounded"></div>
              </div>
              <div className="space-y-4">
                {[1, 2, 3].map((j) => (
                  <div key={j} className="h-20 bg-muted rounded"></div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Welcome Section */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground">
          Welcome back, {profile?.full_name || 'User'}!
        </h1>
        <p className="text-muted-foreground mt-2">
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
                      <p className="text-sm text-muted-foreground flex items-center">
                        <Calendar className="h-3 w-3 mr-1" />
                        Applied {format(new Date(application.application_date), 'MMM d, yyyy')}
                      </p>
                      {application.gig?.location && (
                        <p className="text-sm text-muted-foreground flex items-center mt-1">
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
                <p className="text-muted-foreground text-center py-4">No applications yet</p>
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
                  <div key={gig.id} className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 cursor-pointer"
                       onClick={() => navigate(`/gigs/${gig.id}`)}>
                    <div className="flex items-center space-x-3">
                      <Avatar className="h-10 w-10">
                        <AvatarImage src={gig.company?.logo_url || ''} alt={gig.company?.name} />
                        <AvatarFallback>
                          <Building className="h-5 w-5" />
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <h4 className="font-medium">{gig.title}</h4>
                        <p className="text-sm text-muted-foreground">{gig.company?.name}</p>
                        <p className="text-xs text-muted-foreground flex items-center mt-1">
                          <MapPin className="w-3 h-3 mr-1" />
                          {gig.location}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      {gig.hourly_rate && (
                        <p className="text-sm font-medium flex items-center justify-end">
                          <DollarSign className="h-3 w-3 mr-1" />
                          ${gig.hourly_rate}/hr
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground flex items-center justify-end mt-1">
                        <Calendar className="h-3 w-3 mr-1" />
                        {format(new Date(gig.start_date), 'MMM d, yyyy')}
                      </p>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-muted-foreground text-center py-4">No gigs available</p>
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
        <Card className="mt-8 border-amber-500/30 bg-amber-500/10">
          <CardContent className="pt-6">
            <div className="flex items-center space-x-3">
              <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              <div>
                <h4 className="font-medium text-amber-600 dark:text-amber-400">
                  You have ${stats.pendingPayments.toLocaleString()} in pending payments
                </h4>
                <p className="text-sm text-amber-600 dark:text-amber-400">
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