import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useAuth } from '@/contexts/AuthContext';
import { useGigs, useApplications, usePayments, useExpenses, useRealtimeNotifications } from '@/hooks/useSupabaseQuery';
import ReviewStars from '@/components/reviews/ReviewStars';
import {
  Calendar,
  DollarSign,
  Clock,
  MapPin,
  TrendingUp,
  Bell,
  ArrowRight,
  CheckCircle,
  AlertCircle,
  Star,
  Briefcase,
  Users,
  Building2,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { format, isToday, isTomorrow } from 'date-fns';

const WorkerDashboard: React.FC = () => {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [greeting, setGreeting] = useState('');

  // Fetch data
  const { data: availableGigs = [] } = useGigs({ status: 'published' });
  const { data: myApplicationsRaw } = useApplications({ workerId: profile?.id });
  const myApplications = myApplicationsRaw || [];
  const { data: paymentsRaw } = usePayments({ workerId: profile?.id });
  const payments = paymentsRaw || [];
  useExpenses({ workerId: profile?.id });
  
  // Set up real-time notifications
  useRealtimeNotifications(profile?.id, (notification) => {
    // This will automatically show a toast when a new notification arrives
    console.log('New notification received:', notification);
  });

  useEffect(() => {
    const hour = new Date().getHours();
    if (hour < 12) setGreeting('Good morning');
    else if (hour < 17) setGreeting('Good afternoon');
    else setGreeting('Good evening');
    
    // Set loading to false after all data is fetched
    const timer = setTimeout(() => setLoading(false), 1000);
    return () => clearTimeout(timer);
  }, []);

  // PostgREST many-to-one embeds come back as objects, not arrays — normalize both shapes
  const one = <T,>(v: T | T[] | null | undefined): T | undefined =>
    Array.isArray(v) ? v[0] : (v ?? undefined);

  // Schedule from real accepted applications
  const upcomingGigs = myApplications
    .map(a => ({ a, gig: one(a.gig) }))
    .filter(({ gig }) => !!gig?.start_date && new Date(gig.start_date) >= new Date(new Date().toDateString()))
    .map(({ a, gig }) => ({
      id: gig!.id,
      title: gig!.title,
      company: one(gig!.company)?.name ?? 'Company',
      date: new Date(gig!.start_date),
      time: gig!.end_date
        ? `${format(new Date(gig!.start_date), 'h:mm a')} - ${format(new Date(gig!.end_date), 'h:mm a')}`
        : '',
      location: gig!.location ?? 'TBD',
      rate: a.proposed_rate ?? gig!.hourly_rate ?? 0,
      status: a.status,
      avatar: '',
    }));

  const recentApplications = myApplications.slice(0, 3);

  // Companies the worker is booked with
  const connectedCompanies = [...new Map(
    upcomingGigs.map(g => [g.company, g.company] as const)
  ).values()];
      
  const todaysGigs = upcomingGigs.filter(gig => isToday(gig.date));
  const tomorrowsGigs = upcomingGigs.filter(gig => isTomorrow(gig.date));

  // Calculate stats from real data
  const totalEarnings = payments
    .filter(payment => payment.status === 'paid')
    .reduce((sum, payment) => sum + payment.amount, 0);
    
  const thisMonth = payments
    .filter(payment => {
      const paidDate = payment.paid_date ? new Date(payment.paid_date) : null;
      return payment.status === 'paid' && paidDate && 
             paidDate.getMonth() === new Date().getMonth() &&
             paidDate.getFullYear() === new Date().getFullYear();
    })
    .reduce((sum, payment) => sum + payment.amount, 0);
    
  const stats = {
    totalEarnings: totalEarnings || 0,
    thisMonth: thisMonth || 0,
    pendingApplications: (recentApplications || []).filter(app => app.status === 'pending').length,
    upcomingGigs: upcomingGigs.length,
    completedGigs: payments.filter(p => p.status === 'paid').length,
    rating: profile?.average_rating || 0
  };


  const getStatusColor = (status: string) => {
    switch (status) {
      case 'confirmed': return 'bg-emerald-500/10 text-green-800';
      case 'pending': return 'bg-amber-500/10 text-yellow-800';
      case 'accepted': return 'bg-primary/10 text-primary';
      case 'rejected': return 'bg-destructive/10 text-red-800';
      default: return 'bg-muted text-foreground';
    }
  };

  if (loading && !profile) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary"></div>
      </div>
    );
  }
  
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="bg-card border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-foreground">
                {greeting}, {profile?.full_name?.split(' ')[0]}! 👋
              </h1>
              <p className="text-muted-foreground mt-1">
                Here's what's happening with your gigs today
              </p>
            </div>
            <div className="flex items-center space-x-3">
              <Button variant="outline" size="sm">
                <Bell className="h-4 w-4 mr-2" />
                3
              </Button>
              <Avatar className="h-10 w-10">
                <AvatarImage src={profile?.avatar_url} />
                <AvatarFallback>
                  {profile?.full_name?.split(' ').map(n => n[0]).join('')}
                </AvatarFallback>
              </Avatar>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Quick Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <Card className="bg-gradient-to-br from-blue-500 to-blue-600 text-white">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-blue-100 text-sm">Total Earnings</p>
                  <p className="text-2xl font-bold">${stats.totalEarnings.toLocaleString()}</p>
                </div>
                <DollarSign className="h-8 w-8 text-blue-200" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-green-500 to-green-600 text-white">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-green-100 text-sm">This Month</p>
                  <p className="text-2xl font-bold">${stats.thisMonth.toLocaleString()}</p>
                </div>
                <TrendingUp className="h-8 w-8 text-green-200" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-purple-500 to-purple-600 text-white">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-purple-100 text-sm">Completed</p>
                  <p className="text-2xl font-bold">{stats.completedGigs}</p>
                </div>
                <Briefcase className="h-8 w-8 text-purple-200" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-orange-500 to-orange-600 text-white">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-orange-100 text-sm">Rating</p>
                  <div className="flex items-center">
                    <p className="text-2xl font-bold">{stats.rating}</p>
                    <Star className="h-5 w-5 text-orange-200 ml-1 fill-current" />
                    <ReviewStars rating={stats.rating} size="sm" className="ml-1" />
                  </div>
                </div>
                <Users className="h-8 w-8 text-orange-200" />
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Today's Schedule */}
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader className="pb-4">
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center">
                    <Calendar className="h-5 w-5 mr-2 text-primary" />
                    Today's Schedule
                  </CardTitle>
                  <div className="flex items-center space-x-2">
                    <Button variant="outline" size="sm" onClick={() => navigate('/availability')}>
                      Availability
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => navigate('/calendar')}>
                      View All
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {todaysGigs.length > 0 ? (
                  <div className="space-y-4">
                    {todaysGigs.map((gig) => (
                      <div key={gig.id} className="flex items-center p-4 bg-primary/10 rounded-lg border border-primary/30">
                        <div className="text-3xl mr-4">{gig.avatar}</div>
                        <div className="flex-1">
                          <h3 className="font-semibold text-foreground">{gig.title}</h3>
                          <p className="text-sm text-muted-foreground">{gig.company}</p>
                          <div className="flex items-center mt-2 space-x-4 text-sm text-muted-foreground">
                            <div className="flex items-center">
                              <Clock className="h-4 w-4 mr-1" />
                              {gig.time}
                            </div>
                            <div className="flex items-center">
                              <MapPin className="h-4 w-4 mr-1" />
                              {gig.location}
                            </div>
                            <div className="flex items-center">
                              <DollarSign className="h-4 w-4 mr-1" />
                              ${gig.rate}/hr
                            </div>
                          </div>
                        </div>
                        <Badge className={getStatusColor(gig.status)}>
                          {gig.status}
                        </Badge>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <Calendar className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-foreground mb-2">No gigs today</h3>
                    <p className="text-muted-foreground mb-4">Take a break or look for new opportunities!</p>
                    <Button onClick={() => navigate('/gigs')}>
                      Browse Available Gigs
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Tomorrow's Preview */}
            {tomorrowsGigs.length > 0 && (
              <Card>
                <CardHeader className="pb-4">
                  <CardTitle className="flex items-center">
                    <Clock className="h-5 w-5 mr-2 text-emerald-500" />
                    Tomorrow's Preview
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {tomorrowsGigs.map((gig) => (
                      <div key={gig.id} className="flex items-center p-3 bg-emerald-500/10 rounded-lg border border-emerald-500/30">
                        <div className="text-2xl mr-3">{gig.avatar}</div>
                        <div className="flex-1">
                          <h4 className="font-medium text-foreground">{gig.title}</h4>
                          <p className="text-sm text-muted-foreground">{gig.time} • {gig.location}</p>
                        </div>
                        <Badge className={getStatusColor(gig.status)}>
                          {gig.status}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Available Gigs */}
            <Card>
              <CardHeader className="pb-4">
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center">
                    <Briefcase className="h-5 w-5 mr-2 text-purple-600" />
                    New Opportunities
                  </CardTitle>
                  <Button variant="outline" size="sm" onClick={() => navigate('/gigs')}>
                    View All
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {(availableGigs || []).slice(0, 3).map((gig) => (
                    <div 
                      key={gig.id} 
                      className="p-4 border border-border rounded-lg hover:border-primary/40 hover:bg-primary/10 transition-colors cursor-pointer"
                      onClick={() => navigate(`/gigs/${gig.id}`)}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <h4 className="font-semibold text-foreground">{gig.title}</h4>
                          <p className="text-sm text-muted-foreground mt-1">{gig.company?.name}</p>
                          <div className="flex items-center mt-2 space-x-4 text-sm text-muted-foreground">
                            <div className="flex items-center">
                              <Calendar className="h-4 w-4 mr-1" />
                              {format(new Date(gig.start_date), 'MMM d')}
                            </div>
                            <div className="flex items-center">
                              <MapPin className="h-4 w-4 mr-1" />
                              {gig.location}
                            </div>
                            {gig.hourly_rate && (
                              <div className="flex items-center">
                                <DollarSign className="h-4 w-4 mr-1" />
                                ${gig.hourly_rate}/hr
                              </div>
                            )}
                          </div>
                        </div>
                        <ArrowRight className="h-5 w-5 text-muted-foreground" />
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Quick Actions */}
            <Card>
              <CardHeader className="pb-4">
                <CardTitle>Quick Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button className="w-full justify-start" onClick={() => navigate('/gigs')}>
                  <Briefcase className="h-4 w-4 mr-2" />
                  Find New Gigs
                </Button>
                <Button variant="outline" className="w-full justify-start" onClick={() => navigate('/applications')}>
                  <Clock className="h-4 w-4 mr-2" />
                  My Applications
                </Button>
                <Button variant="outline" className="w-full justify-start" onClick={() => navigate('/finances')}>
                  <DollarSign className="h-4 w-4 mr-2" />
                  Track Earnings
                </Button>
                <Button variant="outline" className="w-full justify-start" onClick={() => navigate('/profile')}>
                  <Users className="h-4 w-4 mr-2" />
                  Update Profile
                </Button>
              </CardContent>
            </Card>

            {/* Recent Applications */}
            <Card>
              <CardHeader className="pb-4">
                <div className="flex items-center justify-between">
                  <CardTitle>Recent Applications</CardTitle>
                  <Button variant="ghost" size="sm" onClick={() => navigate('/applications')}>
                    View All
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {recentApplications.length > 0 ? (
                  <div className="space-y-3">
                    {recentApplications.map((application) => (
                      <div key={application.id} className="flex items-center justify-between p-3 bg-muted/40 rounded-lg">
                        <div className="flex-1">
                          <h4 className="font-medium text-sm text-foreground">
                            {application.gig?.title}
                          </h4>
                          <p className="text-xs text-muted-foreground">
                            Applied {format(new Date(application.application_date), 'MMM d')}
                          </p>
                        </div>
                        <Badge className={getStatusColor(application.status)}>
                          {application.status}
                        </Badge>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-4">
                    <AlertCircle className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">No recent applications</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Company Integrations */}
            <Card>
              <CardHeader className="pb-4">
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center">
                    <Building2 className="h-5 w-5 mr-2" />
                    Connected Companies
                  </CardTitle>
                  <Button variant="ghost" size="sm" onClick={() => navigate('/integrations')}>
                    Manage
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {connectedCompanies.length > 0 ? (
                  <div className="space-y-3">
                    {connectedCompanies.map(name => (
                      <div key={name} className="flex items-center justify-between p-3 bg-emerald-500/10 rounded-lg border border-emerald-500/30">
                        <div className="flex items-center">
                          <Building2 className="h-5 w-5 mr-3 text-muted-foreground" />
                          <div>
                            <p className="font-medium text-sm">{name}</p>
                            <p className="text-xs text-muted-foreground">{upcomingGigs.filter(g => g.company === name).length} upcoming</p>
                          </div>
                        </div>
                        <CheckCircle className="h-4 w-4 text-emerald-500" />
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground py-4 text-center">
                    No connected companies yet — companies that book you will appear here.
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Performance */}
            <Card>
              <CardHeader className="pb-4">
                <CardTitle>This Month</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Gigs Completed</span>
                  <span className="font-semibold">{stats.completedGigs}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Hours Worked</span>
                  <span className="font-semibold">{stats.completedGigs * 8}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Avg. Rating</span>
                  <div className="flex items-center">
                    <span className="font-semibold mr-1">{stats.rating}</span>
                    <Star className="h-4 w-4 text-yellow-500 fill-current" />
                    <ReviewStars rating={profile?.average_rating || 4.8} size="sm" className="ml-1" />
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Response Rate</span>
                  <span className="font-semibold">{Math.round((myApplications.length - stats.pendingApplications) / Math.max(myApplications.length, 1) * 100)}%</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WorkerDashboard;