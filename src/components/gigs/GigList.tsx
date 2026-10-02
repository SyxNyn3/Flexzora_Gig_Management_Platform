import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input'; 
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { Gig } from '@/lib/types';
import { useGigs } from '@/hooks/useSupabaseQuery';
import { 
  MapPin, 
  Calendar, 
  DollarSign, 
  Users,
  Search,
  Filter,
  Clock,
  Building
} from 'lucide-react';
import { format } from 'date-fns';
import { useNavigate } from 'react-router-dom';

const GigList: React.FC = () => {
  const { profile } = useAuth();
  const navigate = useNavigate();
  
  // Use the hook to fetch gigs
  const { data: gigsData, loading: gigsLoading, error } = useGigs({ status: 'published' });
  const gigs = gigsData ?? [];
  
  const [filteredGigs, setFilteredGigs] = useState<Gig[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [locationFilter, setLocationFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [skillsFilter, setSkillsFilter] = useState<string[]>([]);
  const [rateRange, setRateRange] = useState<[number, number]>([0, 100]);
  const [isRemoteOnly, setIsRemoteOnly] = useState(false);
  const [dateRange, setDateRange] = useState<string>('all');
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

  useEffect(() => {
    filterGigs();
  }, [gigs, searchTerm, locationFilter, statusFilter, skillsFilter, rateRange, isRemoteOnly, dateRange]);

  const filterGigs = () => {
    let filtered = gigs;
   
   // Ensure gigs is always an array to prevent null reference errors
   if (!filtered || !Array.isArray(filtered)) {
     filtered = [];
   }

    // Search filter
    if (searchTerm) {
      filtered = filtered.filter(gig =>
        gig.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        gig.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
        gig.company?.name.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Location filter
    if (locationFilter && locationFilter !== 'all') {
      filtered = filtered.filter(gig =>
        gig.location.toLowerCase().includes(locationFilter.toLowerCase())
      );
    }

    // Status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter(gig => gig.status === statusFilter);
    }

    // Skills filter
    if (skillsFilter.length > 0) {
      filtered = filtered.filter(gig => 
        gig.skills_required && skillsFilter.some(skill => 
          gig.skills_required?.includes(skill)
        )
      );
    }

    // Rate filter
    if (rateRange[0] > 0 || rateRange[1] < 100) {
      filtered = filtered.filter(gig => 
        gig.hourly_rate && 
        gig.hourly_rate >= rateRange[0] && 
        gig.hourly_rate <= rateRange[1]
      );
    }

    // Remote filter
    if (isRemoteOnly) {
      filtered = filtered.filter(gig => gig.is_remote);
    }

    // Date range filter
    if (dateRange !== 'all') {
      const now = new Date();
      let startDate: Date;
      
      switch (dateRange) {
        case 'today':
          startDate = new Date();
          startDate.setHours(0, 0, 0, 0);
          filtered = filtered.filter(gig => new Date(gig.start_date) >= startDate);
          break;
        case 'this-week':
          startDate = new Date();
          startDate.setDate(now.getDate() - now.getDay()); // Start of week (Sunday)
          startDate.setHours(0, 0, 0, 0);
          filtered = filtered.filter(gig => new Date(gig.start_date) >= startDate);
          break;
        case 'this-month':
          startDate = new Date(now.getFullYear(), now.getMonth(), 1);
          filtered = filtered.filter(gig => new Date(gig.start_date) >= startDate);
          break;
      }
    }

    setFilteredGigs(filtered);
  };

  const getUniqueLocations = () => {
    const locations = gigs.map(gig => gig.location);
    return [...new Set(locations)].sort();
  };
  
  const getUniqueSkills = () => {
    const allSkills = gigs.flatMap(gig => gig.skills_required || []);
    return [...new Set(allSkills)].sort();
  };

  const handleApplyToGig = (gigId: string) => {
    navigate(`/gigs/${gigId}`);
  };

  const getDaysUntilStart = (startDate: string) => {
    const start = new Date(startDate);
    const now = new Date();
    const diffTime = start.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  if (gigsLoading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header skeleton */}
        <div className="mb-8">
          <Skeleton className="h-8 w-64 mb-2" />
          <Skeleton className="h-4 w-96" />
        </div>
        
        {/* Filters skeleton */}
        <Skeleton className="h-32 mb-8" />
        
        {/* Results count skeleton */}
        <Skeleton className="h-6 w-48 mb-6" />
        
        {/* Gigs grid skeleton */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-80" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Available Gigs</h1>
        <p className="text-gray-600 mt-2">
          Discover exciting opportunities that match your skills and schedule
        </p>
      </div>

      {/* Filters */}
      <Card className="mb-8">
        <CardContent className="pt-6">
          <div className="flex flex-col gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search gigs, companies, or skills..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="flex flex-col md:flex-row gap-4">
              <Select value={locationFilter} onValueChange={setLocationFilter}>
                <SelectTrigger className="w-full md:w-48">
                  <SelectValue placeholder="Location" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Locations</SelectItem>
                  {getUniqueLocations().map(location => (
                    <SelectItem key={location} value={location}>
                      {location}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full md:w-48">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="published">Published</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                </SelectContent>
              </Select>
              <Button 
                variant="outline" 
                onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
                className="w-full md:w-auto"
              >
                <Filter className="h-4 w-4 mr-2" />
                {showAdvancedFilters ? 'Hide' : 'Show'} Advanced Filters
              </Button>
            </div>
            
            {showAdvancedFilters && (
              <div className="bg-gray-50 p-4 rounded-lg space-y-4 mt-2">
                <div>
                  <Label className="mb-2 block">Required Skills</Label>
                  <div className="flex flex-wrap gap-2">
                    {getUniqueSkills().map(skill => (
                      <div key={skill} className="flex items-center space-x-2">
                        <Checkbox 
                          id={`skill-${skill}`}
                          checked={skillsFilter.includes(skill)}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setSkillsFilter([...skillsFilter, skill]);
                            } else {
                              setSkillsFilter(skillsFilter.filter(s => s !== skill));
                            }
                          }}
                        />
                        <Label htmlFor={`skill-${skill}`} className="text-sm">
                          {skill}
                        </Label>
                      </div>
                    ))}
                  </div>
                </div>
                
                <div>
                  <Label className="mb-2 block">Hourly Rate Range: ${rateRange[0]} - ${rateRange[1]}</Label>
                  <Slider
                    value={rateRange}
                    min={0}
                    max={100}
                    step={5}
                    onValueChange={(value) => setRateRange(value as [number, number])}
                    className="w-full"
                  />
                </div>
                
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="remote-only"
                    checked={isRemoteOnly}
                    onCheckedChange={(checked) => setIsRemoteOnly(!!checked)}
                  />
                  <Label htmlFor="remote-only">Remote Only</Label>
                </div>
                
                <div>
                  <Label className="mb-2 block">Date Range</Label>
                  <Select value={dateRange} onValueChange={setDateRange}>
                    <SelectTrigger className="w-full md:w-48">
                      <SelectValue placeholder="Date Range" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Dates</SelectItem>
                      <SelectItem value="today">Today</SelectItem>
                      <SelectItem value="this-week">This Week</SelectItem>
                      <SelectItem value="this-month">This Month</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="flex justify-end">
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => {
                      setSkillsFilter([]);
                      setRateRange([0, 100]);
                      setIsRemoteOnly(false);
                      setDateRange('all');
                    }}
                  >
                    Reset Filters
                  </Button>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Results Count */}
      <div className="mb-6">
        <p className="text-gray-600">
          Showing {filteredGigs.length} of {gigs.length} gigs
        </p>
      </div>

      {/* Gigs Grid */}
      {filteredGigs.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredGigs.map((gig) => {
            const daysUntilStart = getDaysUntilStart(gig.start_date);
            const isUrgent = daysUntilStart <= 7 && daysUntilStart > 0;
            
            return (
              <Card 
                key={gig.id} 
                className="hover:shadow-lg transition-shadow cursor-pointer group"
                onClick={() => handleApplyToGig(gig.id)}
              >
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex items-center space-x-3">
                      <Avatar className="h-10 w-10">
                        <AvatarImage src={gig.company?.logo_url} alt={gig.company?.name} />
                        <AvatarFallback>
                          <Building className="h-5 w-5" />
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <CardTitle className="text-lg group-hover:text-blue-600 transition-colors">
                          {gig.title}
                        </CardTitle>
                        <CardDescription className="font-medium">
                          {gig.company?.name}
                        </CardDescription>
                      </div>
                    </div>
                    {isUrgent && (
                      <Badge variant="destructive" className="text-xs">
                        Urgent
                      </Badge>
                    )}
                  </div>
                </CardHeader>

                <CardContent className="space-y-4">
                  <p className="text-gray-600 text-sm line-clamp-2">
                    {gig.description}
                  </p>

                  <div className="space-y-2">
                    <div className="flex items-center text-sm text-gray-600">
                      <MapPin className="h-4 w-4 mr-2 text-gray-400" />
                      {gig.location}
                      {gig.is_remote && (
                        <Badge variant="outline" className="ml-2 text-xs">
                          Remote
                        </Badge>
                      )}
                    </div>

                    <div className="flex items-center text-sm text-gray-600">
                      <Calendar className="h-4 w-4 mr-2 text-gray-400" />
                      {format(new Date(gig.start_date), 'MMM d, yyyy')} - {format(new Date(gig.end_date), 'MMM d, yyyy')}
                    </div>

                    {gig.hourly_rate && (
                      <div className="flex items-center text-sm text-gray-600">
                        <DollarSign className="h-4 w-4 mr-2 text-gray-400" />
                        ${gig.hourly_rate}/hour
                      </div>
                    )}

                    <div className="flex items-center text-sm text-gray-600">
                      <Users className="h-4 w-4 mr-2 text-gray-400" />
                      {gig.required_workers} worker{gig.required_workers !== 1 ? 's' : ''} needed
                    </div>

                    {daysUntilStart > 0 && (
                      <div className="flex items-center text-sm text-gray-600">
                        <Clock className="h-4 w-4 mr-2 text-gray-400" />
                        Starts in {daysUntilStart} day{daysUntilStart !== 1 ? 's' : ''}
                      </div>
                    )}
                  </div>

                  {/* Skills */}
                  {gig.skills_required && gig.skills_required.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {gig.skills_required.slice(0, 3).map((skill, index) => (
                        <Badge key={index} variant="secondary" className="text-xs">
                          {skill}
                        </Badge>
                      ))}
                      {gig.skills_required.length > 3 && (
                        <Badge variant="outline" className="text-xs">
                          +{gig.skills_required.length - 3} more
                        </Badge>
                      )}
                    </div>
                  )}
                </CardContent>

                <CardFooter>
                  <Button 
                    className="w-full"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleApplyToGig(gig.id);
                    }}
                  >
                    View Details & Apply
                  </Button>
                </CardFooter>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card>
          <CardContent className="text-center py-12">
            <Search className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No gigs found</h3>
            <p className="text-gray-600">
              Try adjusting your search criteria or check back later for new opportunities.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default GigList;