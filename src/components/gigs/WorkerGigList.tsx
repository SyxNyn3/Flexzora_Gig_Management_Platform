import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/contexts/AuthContext';
import { useGigs } from '@/hooks/useSupabaseQuery';
import { 
  Search,
  Filter,
  MapPin,
  Calendar,
  DollarSign,
  Clock,
  Users,
  Star,
  Bookmark,
  BookmarkCheck,
  ArrowRight,
  Building2,
  Zap,
  TrendingUp
} from 'lucide-react';
import { format, isToday, isTomorrow, addDays } from 'date-fns';
import { useNavigate } from 'react-router-dom';

const WorkerGigList: React.FC = () => {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [savedGigs, setSavedGigs] = useState<string[]>([]);

  // Fetch gigs
  const { data: allGigs = [] } = useGigs({ status: 'published' });

  useEffect(() => {
    // Simulate loading delay
    const timer = setTimeout(() => setLoading(false), 1500);
    return () => clearTimeout(timer);
  }, []);

  // Mock enhanced gig data
  const enhancedGigs = [
    {
      id: '1',
      title: 'Camera Operator for Corporate Event',
      company: { name: 'TechCorp Events', logo_url: '', avatar: '🏢' },
      location: 'San Francisco, CA',
      start_date: new Date().toISOString(),
      end_date: addDays(new Date(), 1).toISOString(),
      hourly_rate: 45,
      required_workers: 2,
      urgency: 'high',
      skills_required: ['Camera Operation', 'Lighting'],
      description: 'Professional camera operator needed for annual company meeting. Experience with multi-camera setups preferred.',
      posted: '2 hours ago',
      applicants: 12,
      rating: 4.8,
      verified: true,
      remote: false,
      category: 'video'
    },
    {
      id: '2',
      title: 'Sound Engineer for Wedding',
      company: { name: 'Dream Weddings', logo_url: '', avatar: '💒' },
      location: 'Napa Valley, CA',
      start_date: addDays(new Date(), 2).toISOString(),
      end_date: addDays(new Date(), 2).toISOString(),
      hourly_rate: 55,
      required_workers: 1,
      urgency: 'medium',
      skills_required: ['Sound Engineering', 'Live Audio'],
      description: 'Experienced sound engineer for outdoor wedding ceremony and reception.',
      posted: '1 day ago',
      applicants: 8,
      rating: 4.9,
      verified: true,
      remote: false,
      category: 'audio'
    },
    {
      id: '3',
      title: 'Lighting Technician for Concert',
      company: { name: 'Live Music Productions', logo_url: '', avatar: '🎵' },
      location: 'Los Angeles, CA',
      start_date: addDays(new Date(), 5).toISOString(),
      end_date: addDays(new Date(), 5).toISOString(),
      hourly_rate: 50,
      required_workers: 3,
      urgency: 'low',
      skills_required: ['Lighting Design', 'Rigging'],
      description: 'Concert lighting setup and operation for major venue. Must have experience with LED systems.',
      posted: '3 days ago',
      applicants: 15,
      rating: 4.7,
      verified: true,
      remote: false,
      category: 'lighting'
    },
    {
      id: '4',
      title: 'Video Editor - Remote',
      company: { name: 'Creative Studios', logo_url: '', avatar: '🎬' },
      location: 'Remote',
      start_date: addDays(new Date(), 1).toISOString(),
      end_date: addDays(new Date(), 7).toISOString(),
      hourly_rate: 40,
      required_workers: 1,
      urgency: 'medium',
      skills_required: ['Video Editing', 'After Effects'],
      description: 'Remote video editing project for documentary series. Flexible schedule.',
      posted: '5 hours ago',
      applicants: 6,
      rating: 4.6,
      verified: false,
      remote: true,
      category: 'post-production'
    }
  ];

  const categories = [
    { id: 'all', name: 'All Gigs', count: enhancedGigs.length },
    { id: 'video', name: 'Video Production', count: enhancedGigs.filter(g => g.category === 'video').length },
    { id: 'audio', name: 'Audio', count: enhancedGigs.filter(g => g.category === 'audio').length },
    { id: 'lighting', name: 'Lighting', count: enhancedGigs.filter(g => g.category === 'lighting').length },
    { id: 'post-production', name: 'Post-Production', count: enhancedGigs.filter(g => g.category === 'post-production').length }
  ];

  const filteredGigs = enhancedGigs.filter(gig => {
    const matchesSearch = gig.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         gig.company.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         gig.location.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || gig.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const toggleSaveGig = (gigId: string) => {
    setSavedGigs(prev => 
      prev.includes(gigId) 
        ? prev.filter(id => id !== gigId)
        : [...prev, gigId]
    );
  };

  const getUrgencyColor = (urgency: string) => {
    switch (urgency) {
      case 'high': return 'bg-red-100 text-red-800 border-red-200';
      case 'medium': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'low': return 'bg-green-100 text-green-800 border-green-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getDateLabel = (dateString: string) => {
    const date = new Date(dateString);
    if (isToday(date)) return 'Today';
    if (isTomorrow(date)) return 'Tomorrow';
    return format(date, 'MMM d');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        {/* Header skeleton */}
        <div className="bg-white border-b border-gray-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
              <div>
                <Skeleton className="h-8 w-64 mb-2" />
                <Skeleton className="h-4 w-96" />
              </div>
              <div className="mt-4 sm:mt-0 flex items-center space-x-3">
                <Skeleton className="h-10 w-24" />
                <Skeleton className="h-10 w-24" />
              </div>
            </div>
            
            <div className="mt-6">
              <Skeleton className="h-10 w-full max-w-md" />
            </div>
          </div>
        </div>
        
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex flex-col lg:flex-row gap-8">
            {/* Sidebar skeleton */}
            <div className="lg:w-80">
              <Skeleton className="h-96 mb-6" />
              <Skeleton className="h-64" />
            </div>
            
            {/* Main content skeleton */}
            <div className="flex-1">
              <div className="flex items-center justify-between mb-6">
                <Skeleton className="h-6 w-48" />
                <Skeleton className="h-6 w-32" />
              </div>
              
              <div className="space-y-4">
                {[1, 2, 3, 4].map((i) => (
                  <Skeleton key={i} className="h-40" />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Available Gigs</h1>
              <p className="text-gray-600 mt-1">
                Discover opportunities that match your skills
              </p>
            </div>
            <div className="mt-4 sm:mt-0 flex items-center space-x-3">
              <Button variant="outline" size="sm">
                <Filter className="h-4 w-4 mr-2" />
                Filters
              </Button>
              <Button variant="outline" size="sm">
                <Bookmark className="h-4 w-4 mr-2" />
                Saved ({savedGigs.length})
              </Button>
            </div>
          </div>

          {/* Search */}
          <div className="mt-6">
            <div className="relative max-w-md">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search gigs, companies, or locations..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col lg:flex-row gap-8">
          {/* Sidebar */}
          <div className="lg:w-80">
            <Card>
              <CardHeader>
                <CardTitle>Categories</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {categories.map((category) => (
                  <button
                    key={category.id}
                    onClick={() => setSelectedCategory(category.id)}
                    className={`w-full flex items-center justify-between p-3 rounded-lg text-left transition-colors ${
                      selectedCategory === category.id
                        ? 'bg-blue-50 text-blue-700 border border-blue-200'
                        : 'hover:bg-gray-50'
                    }`}
                  >
                    <span className="font-medium">{category.name}</span>
                    <Badge variant="secondary" className="text-xs">
                      {category.count}
                    </Badge>
                  </button>
                ))}
              </CardContent>
            </Card>

            {/* Quick Stats */}
            <Card className="mt-6">
              <CardHeader>
                <CardTitle>Your Stats</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Applications Sent</span>
                  <span className="font-semibold">23</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Response Rate</span>
                  <span className="font-semibold text-green-600">87%</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Avg. Rating</span>
                  <div className="flex items-center">
                    <span className="font-semibold mr-1">{profile?.average_rating || 4.8}</span>
                    <Star className="h-4 w-4 text-yellow-500 fill-current" />
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Saved Gigs</span>
                  <span className="font-semibold">{savedGigs.length}</span>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Main Content */}
          <div className="flex-1">
            {/* Results Header */}
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">
                  {filteredGigs.length} gigs found
                </h2>
                <p className="text-sm text-gray-600">
                  Showing results for "{searchTerm || 'all gigs'}"
                </p>
              </div>
              <div className="flex items-center space-x-2">
                <span className="text-sm text-gray-600">Sort by:</span>
                <select className="text-sm border border-gray-300 rounded-md px-3 py-1">
                  <option>Most Recent</option>
                  <option>Highest Pay</option>
                  <option>Closest Date</option>
                  <option>Most Urgent</option>
                </select>
              </div>
            </div>

            {/* Gig Cards */}
            <div className="space-y-4">
              {filteredGigs.map((gig) => (
                <Card 
                  key={gig.id} 
                  className="hover:shadow-lg transition-all duration-200 cursor-pointer border-l-4 border-l-transparent hover:border-l-blue-500"
                  onClick={() => navigate(`/gigs/${gig.id}`)}
                >
                  <CardContent className="p-6">
                    <div className="flex items-start justify-between">
                      <div className="flex items-start space-x-4 flex-1">
                        <div className="text-3xl">{gig.company.avatar}</div>
                        <div className="flex-1">
                          <div className="flex items-start justify-between mb-2">
                            <div>
                              <h3 className="text-lg font-semibold text-gray-900 hover:text-blue-600 transition-colors">
                                {gig.title}
                              </h3>
                              <div className="flex items-center space-x-2 mt-1">
                                <p className="text-gray-600">{gig.company.name}</p>
                                {gig.verified && (
                                  <Badge variant="outline" className="text-xs">
                                    <Star className="h-3 w-3 mr-1 text-yellow-500 fill-current" />
                                    Verified
                                  </Badge>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center space-x-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleSaveGig(gig.id);
                                }}
                                className="p-2"
                              >
                                {savedGigs.includes(gig.id) ? (
                                  <BookmarkCheck className="h-4 w-4 text-blue-600" />
                                ) : (
                                  <Bookmark className="h-4 w-4" />
                                )}
                              </Button>
                              {gig.urgency === 'high' && (
                                <Badge className={getUrgencyColor(gig.urgency)}>
                                  <Zap className="h-3 w-3 mr-1" />
                                  Urgent
                                </Badge>
                              )}
                            </div>
                          </div>

                          <p className="text-gray-700 mb-4 line-clamp-2">
                            {gig.description}
                          </p>

                          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
                            <div className="flex items-center text-sm text-gray-600">
                              <Calendar className="h-4 w-4 mr-2" />
                              {getDateLabel(gig.start_date)}
                            </div>
                            <div className="flex items-center text-sm text-gray-600">
                              <MapPin className="h-4 w-4 mr-2" />
                              {gig.location}
                              {gig.remote && (
                                <Badge variant="outline" className="ml-2 text-xs">
                                  Remote
                                </Badge>
                              )}
                            </div>
                            <div className="flex items-center text-sm text-gray-600">
                              <DollarSign className="h-4 w-4 mr-2" />
                              ${gig.hourly_rate}/hour
                            </div>
                            <div className="flex items-center text-sm text-gray-600">
                              <Users className="h-4 w-4 mr-2" />
                              {gig.required_workers} needed
                            </div>
                          </div>

                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-4">
                              <div className="flex flex-wrap gap-1">
                                {gig.skills_required.slice(0, 3).map((skill) => (
                                  <Badge key={skill} variant="secondary" className="text-xs">
                                    {skill}
                                  </Badge>
                                ))}
                                {gig.skills_required.length > 3 && (
                                  <Badge variant="outline" className="text-xs">
                                    +{gig.skills_required.length - 3} more
                                  </Badge>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center space-x-4 text-sm text-gray-500">
                              <div className="flex items-center">
                                <Clock className="h-4 w-4 mr-1" />
                                {gig.posted}
                              </div>
                              <div className="flex items-center">
                                <TrendingUp className="h-4 w-4 mr-1" />
                                {gig.applicants} applicants
                              </div>
                              <ArrowRight className="h-4 w-4" />
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {filteredGigs.length === 0 && (
              <Card>
                <CardContent className="text-center py-12">
                  <Search className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No gigs found</h3>
                  <p className="text-gray-600 mb-4">
                    Try adjusting your search criteria or check back later for new opportunities.
                  </p>
                  <Button onClick={() => setSearchTerm('')}>
                    Clear Search
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default WorkerGigList;