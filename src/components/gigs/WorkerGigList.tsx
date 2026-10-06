import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/contexts/AuthContext';
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

  useEffect(() => {
    // Simulate loading delay
    const timer = setTimeout(() => setLoading(false), 1500);
    return () => clearTimeout(timer);
  }, []);

  // Mock enhanced gig data
  const enhancedGigs = [
    {
      id: '1',
      title: 'A1 Audio Engineer — Show Call / System Ops',
      company: { name: 'Solotech', logo_url: '', avatar: '🔊' },
      location: 'Stadium Main Stage, Los Angeles, CA',
      start_date: new Date().toISOString(),
      end_date: addDays(new Date(), 1).toISOString(),
      hourly_rate: 82,
      required_workers: 2,
      urgency: 'high',
      skills_required: ['FOH Mixing', 'DiGiCo', 'L-Acoustics'],
      description: 'A1 needed for stadium show call — mix FOH on DiGiCo SD12, PA is L-Acoustics K2. System is rung out; show files provided.',
      posted: '2 hours ago',
      applicants: 12,
      rating: 4.8,
      verified: true,
      remote: false,
      category: 'audio'
    },
    {
      id: '2',
      title: 'L2 Lighting Tech — Arena Tour Stop',
      company: { name: 'Bandit Lites', logo_url: '', avatar: '💡' },
      location: 'Greek Theatre, Los Angeles, CA',
      start_date: addDays(new Date(), 2).toISOString(),
      end_date: addDays(new Date(), 2).toISOString(),
      hourly_rate: 74,
      required_workers: 1,
      urgency: 'medium',
      skills_required: ['grandMA3', 'Fixture Maintenance', 'DMX Troubleshooting'],
      description: 'L2 for one-off arena stop. Help run the rig and keep fixtures happy through doors + show.',
      posted: '1 day ago',
      applicants: 8,
      rating: 4.9,
      verified: true,
      remote: false,
      category: 'lighting'
    },
    {
      id: '3',
      title: 'ETCP Arena Rigger — Load-In & Rigging Call',
      company: { name: 'Rhino Staging', logo_url: '', avatar: '🦏' },
      location: 'Stadium Main Stage, Los Angeles, CA',
      start_date: addDays(new Date(), 5).toISOString(),
      end_date: addDays(new Date(), 5).toISOString(),
      hourly_rate: 78,
      required_workers: 4,
      urgency: 'high',
      skills_required: ['ETCP Arena Rigging', 'Fall Protection', 'Chain Motors'],
      description: 'Overnight rigging call for main stage build. ETCP Arena cert required — bring card. Tower points, truss, motors up before PA hang.',
      posted: '3 days ago',
      applicants: 15,
      rating: 4.7,
      verified: true,
      remote: false,
      category: 'rigging'
    },
    {
      id: '4',
      title: 'Stagehand — Strike & Load-Out',
      company: { name: 'Encore', logo_url: '', avatar: '🎛️' },
      location: 'Convention Center Ballroom C, Anaheim, CA',
      start_date: addDays(new Date(), 1).toISOString(),
      end_date: addDays(new Date(), 2).toISOString(),
      hourly_rate: 45,
      required_workers: 8,
      urgency: 'medium',
      skills_required: ['Stage Strike', 'Truck Loading', 'Forklift (ANSI B56.1) preferred'],
      description: 'Ballroom strike after corporate general session — walls down, cases packed, two trucks out by 06:00.',
      posted: '5 hours ago',
      applicants: 6,
      rating: 4.6,
      verified: false,
      remote: false,
      category: 'stagehand'
    }
  ];

  const categories = [
    { id: 'all', name: 'All Gigs', count: enhancedGigs.length },
    { id: 'audio', name: 'Audio', count: enhancedGigs.filter(g => g.category === 'audio').length },
    { id: 'lighting', name: 'Lighting', count: enhancedGigs.filter(g => g.category === 'lighting').length },
    { id: 'rigging', name: 'Rigging', count: enhancedGigs.filter(g => g.category === 'rigging').length },
    { id: 'stagehand', name: 'Stagehand', count: enhancedGigs.filter(g => g.category === 'stagehand').length }
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
      case 'high': return 'bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30';
      case 'medium': return 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30';
      case 'low': return 'bg-green-500/15 text-green-600 dark:text-green-400 border-green-500/30';
      default: return 'bg-muted text-muted-foreground border-border';
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
      <div className="min-h-screen bg-muted/50">
        {/* Header skeleton */}
        <div className="bg-card border-b border-border">
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
    <div className="min-h-screen bg-muted/50">
      {/* Header */}
      <div className="bg-card border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-2xl font-bold text-foreground">Available Gigs</h1>
              <p className="text-muted-foreground mt-1">
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
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground/70" />
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
                        ? 'bg-primary/10 text-primary border border-primary/30'
                        : 'hover:bg-muted/50'
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
                  <span className="text-sm text-muted-foreground">Applications Sent</span>
                  <span className="font-semibold">23</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Response Rate</span>
                  <span className="font-semibold text-green-600 dark:text-green-400">87%</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Avg. Rating</span>
                  <div className="flex items-center">
                    <span className="font-semibold mr-1">{profile?.average_rating || 4.8}</span>
                    <Star className="h-4 w-4 text-yellow-500 fill-current" />
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Saved Gigs</span>
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
                <h2 className="text-lg font-semibold text-foreground">
                  {filteredGigs.length} gigs found
                </h2>
                <p className="text-sm text-muted-foreground">
                  Showing results for "{searchTerm || 'all gigs'}"
                </p>
              </div>
              <div className="flex items-center space-x-2">
                <span className="text-sm text-muted-foreground">Sort by:</span>
                <select className="text-sm border border-input rounded-md px-3 py-1">
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
                              <h3 className="text-lg font-semibold text-foreground hover:text-primary transition-colors">
                                {gig.title}
                              </h3>
                              <div className="flex items-center space-x-2 mt-1">
                                <p className="text-muted-foreground">{gig.company.name}</p>
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
                                  <BookmarkCheck className="h-4 w-4 text-primary" />
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

                          <p className="text-foreground/80 mb-4 line-clamp-2">
                            {gig.description}
                          </p>

                          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
                            <div className="flex items-center text-sm text-muted-foreground">
                              <Calendar className="h-4 w-4 mr-2" />
                              {getDateLabel(gig.start_date)}
                            </div>
                            <div className="flex items-center text-sm text-muted-foreground">
                              <MapPin className="h-4 w-4 mr-2" />
                              {gig.location}
                              {gig.remote && (
                                <Badge variant="outline" className="ml-2 text-xs">
                                  Remote
                                </Badge>
                              )}
                            </div>
                            <div className="flex items-center text-sm text-muted-foreground">
                              <DollarSign className="h-4 w-4 mr-2" />
                              ${gig.hourly_rate}/hour
                            </div>
                            <div className="flex items-center text-sm text-muted-foreground">
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
                            <div className="flex items-center space-x-4 text-sm text-muted-foreground">
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
                  <Search className="h-12 w-12 text-muted-foreground/70 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-foreground mb-2">No gigs found</h3>
                  <p className="text-muted-foreground mb-4">
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