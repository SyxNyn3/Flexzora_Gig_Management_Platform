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
  Mail
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { format, isToday, isTomorrow, addDays } from 'date-fns';

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

  // Mock data for demo
  const upcomingGigs = [
    {
      id: '1',
      title: 'Load-In & Rigging Call',
      company: 'Rhino Staging',
      date: new Date(),
      time: '7:00 AM - 3:00 PM',
      location: 'Stadium Main Stage',
      rate: 48,
      status: 'confirmed',
      avatar: '🏟️'
    },
    {
      id: '2',
      title: 'Show Call / System Ops',
      company: 'Giglife',
      date: addDays(new Date(), 1),
      time: '4:00 PM - 12:00 AM',
      location: 'Convention Center Ballroom C',
      rate: 55,
      status: 'confirmed',
      avatar: '🎛️'
    }
  ];

  // Use real data with fallback to mock data
  const recentApplications = myApplications.length > 0 
    ? myApplications.slice(0, 3) 
    : [
        {
          id: '1',
          gig: { title: 'L2 Lighting Tech — Festival Main Stage', location: 'Golden Gate Park' },
          status: 'pending',
          application_date: '2024-01-10T10:00:00Z',
        },
        {
          id: '2',
          gig: { title: 'Strike & Load-Out — Arena Rigging Crew', location: 'Stadium Main Stage' },
          status: 'accepted',
          application_date: '2024-01-08T15:30:00Z',
        },
      ];
      
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
    totalEarnings: totalEarnings || 15420, // Fallback to mock data if no real data
    thisMonth: thisMonth || 3200,
    pendingApplications: (recentApplications || []).filter(app => app.status === 'pending').length,
    upcomingGigs: upcomingGigs.length,
    completedGigs: payments.filter(p => p.status === 'paid').length || 28,
    rating: profile?.average_rating || 4.8
  };


  const getStatusColor = (status: string) => {
    switch (status) {
      case 'confirmed': return 'bg-green-100 text-green-800';
      case 'pending': return 'bg-yellow-100 text-yellow-800';
      case 'accepted': return 'bg-blue-100 text-blue-800';
      case 'rejected': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  if (loading && !profile) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
      </div>
    );
  }
  
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                {greeting}, {profile?.full_name?.split(' ')[0]}! 👋
              </h1>
              <p className="text-gray-600 mt-1">
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
                    <Calendar className="h-5 w-5 mr-2 text-blue-600" />
                    Today's Schedule
                  </CardTitle>
                  <Button variant="outline" size="sm" onClick={() => navigate('/calendar')}>
                    View All
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {todaysGigs.length > 0 ? (
                  <div className="space-y-4">
                    {todaysGigs.map((gig) => (
                      <div key={gig.id} className="flex items-center p-4 bg-blue-50 rounded-lg border border-blue-200">
                        <div className="text-3xl mr-4">{gig.avatar}</div>
                        <div className="flex-1">
                          <h3 className="font-semibold text-gray-900">{gig.title}</h3>
                          <p className="text-sm text-gray-600">{gig.company}</p>
                          <div className="flex items-center mt-2 space-x-4 text-sm text-gray-500">
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
                    <Calendar className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">No gigs today</h3>
                    <p className="text-gray-600 mb-4">Take a break or look for new opportunities!</p>
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
                    <Clock className="h-5 w-5 mr-2 text-green-600" />
                    Tomorrow's Preview
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {tomorrowsGigs.map((gig) => (
                      <div key={gig.id} className="flex items-center p-3 bg-green-50 rounded-lg border border-green-200">
                        <div className="text-2xl mr-3">{gig.avatar}</div>
                        <div className="flex-1">
                          <h4 className="font-medium text-gray-900">{gig.title}</h4>
                          <p className="text-sm text-gray-600">{gig.time} • {gig.location}</p>
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
                      className="p-4 border border-gray-200 rounded-lg hover:border-blue-300 hover:bg-blue-50 transition-colors cursor-pointer"
                      onClick={() => navigate(`/gigs/${gig.id}`)}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <h4 className="font-semibold text-gray-900">{gig.title}</h4>
                          <p className="text-sm text-gray-600 mt-1">{gig.company?.name}</p>
                          <div className="flex items-center mt-2 space-x-4 text-sm text-gray-500">
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
                        <ArrowRight className="h-5 w-5 text-gray-400" />
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
                      <div key={application.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <div className="flex-1">
                          <h4 className="font-medium text-sm text-gray-900">
                            {application.gig?.title}
                          </h4>
                          <p className="text-xs text-gray-600">
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
                    <AlertCircle className="h-8 w-8 text-gray-400 mx-auto mb-2" />
                    <p className="text-sm text-gray-600">No recent applications</p>
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
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg border border-green-200">
                    <div className="flex items-center">
                      <div className="text-lg mr-3">🦏</div>
                      <div>
                        <p className="font-medium text-sm">Rhino Staging</p>
                        <p className="text-xs text-gray-600">15 gigs</p>
                      </div>
                    </div>
                    <CheckCircle className="h-4 w-4 text-green-600" />
                  </div>
                  
                  <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg border border-blue-200">
                    <div className="flex items-center">
                      <div className="text-lg mr-3">🎵</div>
                      <div>
                        <p className="font-medium text-sm">Giglife</p>
                        <p className="text-xs text-gray-600">8 gigs</p>
                      </div>
                    </div>
                    <CheckCircle className="h-4 w-4 text-blue-600" />
                  </div>

                  <div className="flex items-center justify-between p-3 bg-red-50 rounded-lg border border-red-200">
                    <div className="flex items-center">
                      <div className="text-lg mr-3">📧</div>
                      <div>
                        <p className="font-medium text-sm">Gmail</p>
                        <p className="text-xs text-gray-600">Connected</p>
                      </div>
                    </div>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="h-6 px-2"
                      onClick={() => navigate('/integrations/gmail')}
                    >
                      <Mail className="h-3 w-3 mr-1" />
                      View
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Performance */}
            <Card>
              <CardHeader className="pb-4">
                <CardTitle>This Month</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Gigs Completed</span>
                  <span className="font-semibold">12</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Hours Worked</span>
                  <span className="font-semibold">{stats.completedGigs * 8}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Avg. Rating</span>
                  <div className="flex items-center">
                    <span className="font-semibold mr-1">{stats.rating}</span>
                    <Star className="h-4 w-4 text-yellow-500 fill-current" />
                    <ReviewStars rating={profile?.average_rating || 4.8} size="sm" className="ml-1" />
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Response Rate</span>
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