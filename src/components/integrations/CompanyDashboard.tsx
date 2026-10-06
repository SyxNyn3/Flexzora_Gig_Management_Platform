import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { 
  Users, 
  Send, 
  DollarSign,
  Calendar,
  Search,
  Download,
  CheckCircle,
  Clock,
  AlertTriangle
} from 'lucide-react';
import { toast } from 'sonner';

interface WorkerProfile {
  id: string;
  name: string;
  email: string;
  phone?: string;
  avatar_url?: string;
  skills: string[];
  hourly_rate: number;
  experience_years: number;
  location: string;
  availability_status: 'available' | 'busy' | 'unavailable';
  last_active: string;
  total_gigs: number;
  rating: number;
  certifications: string[];
  preferred_roles: string[];
}

const CompanyDashboard: React.FC = () => {
  const [workers, setWorkers] = useState<WorkerProfile[]>([]); 
  const [filteredWorkers, setFilteredWorkers] = useState<WorkerProfile[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [skillFilter, setSkillFilter] = useState('');
  const [availabilityFilter, setAvailabilityFilter] = useState('all');
  const [selectedWorkers, setSelectedWorkers] = useState<string[]>([]);
  const [showBroadcastDialog, setShowBroadcastDialog] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Fetch worker profiles from database
    const fetchWorkers = async () => {
      try {
        setLoading(true);
        
        // In a real implementation, we would fetch from the database
        // For now, we'll use the mock data but with a delay to simulate loading
        setTimeout(() => {
          loadWorkerPool();
          setLoading(false);
        }, 1500);
      } catch (error) {
        console.error('Error fetching workers:', error);
        setLoading(false);
      }
    };
    
    fetchWorkers();
  }, []);

  useEffect(() => {
    filterWorkers();
  }, [workers, searchTerm, skillFilter, availabilityFilter]);

  const loadWorkerPool = () => {
    // Mock worker pool data
    const mockWorkers: WorkerProfile[] = [
      {
        id: 'worker-1',
        name: 'Marcus Webb',
        email: 'marcus.webb@flexzora.dev',
        phone: '+1 (555) 123-4567',
        avatar_url: '',
        skills: ['Rigging', 'Motor Points', 'Truss Assembly'],
        hourly_rate: 48,
        experience_years: 8,
        location: 'San Francisco, CA',
        availability_status: 'available',
        last_active: new Date().toISOString(),
        total_gigs: 64,
        rating: 4.8,
        certifications: ['ETCP Arena Rigger', 'OSHA-30'],
        preferred_roles: ['ETCP Arena Rigger', 'Load-In Lead']
      },
      {
        id: 'worker-2',
        name: 'Priya Raman',
        email: 'priya.raman@flexzora.dev',
        phone: '+1 (555) 234-5678',
        avatar_url: '',
        skills: ['GrandMA', 'LED Systems', 'Fixture Maintenance'],
        hourly_rate: 55,
        experience_years: 7,
        location: 'Oakland, CA',
        availability_status: 'busy',
        last_active: new Date(Date.now() - 3600000).toISOString(),
        total_gigs: 42,
        rating: 4.9,
        certifications: ['OSHA-30', 'Boom Lift Operator'],
        preferred_roles: ['L2 Lighting Tech', 'Lighting Lead']
      },
      {
        id: 'worker-3',
        name: 'Devon Carter',
        email: 'devon.carter@flexzora.dev',
        phone: '+1 (555) 345-6789',
        avatar_url: '',
        skills: ['Video Processing', 'LED Wall', 'Playback'],
        hourly_rate: 52,
        experience_years: 5,
        location: 'San Jose, CA',
        availability_status: 'available',
        last_active: new Date(Date.now() - 7200000).toISOString(),
        total_gigs: 31,
        rating: 4.6,
        certifications: ['OSHA-10', 'Boom Lift Operator'],
        preferred_roles: ['Video Wall Lead', 'Video Tech']
      },
      {
        id: 'worker-4',
        name: 'Sofia Almeida',
        email: 'sofia.almeida@flexzora.dev',
        phone: '+1 (555) 456-7890',
        avatar_url: '',
        skills: ['FOH Mixing', 'System Tuning', 'RF Coordination'],
        hourly_rate: 62,
        experience_years: 9,
        location: 'Berkeley, CA',
        availability_status: 'available',
        last_active: new Date(Date.now() - 1800000).toISOString(),
        total_gigs: 71,
        rating: 4.9,
        certifications: ['OSHA-30', 'Shure Wireless Workbench'],
        preferred_roles: ['A1 Audio Engineer', 'System Tech']
      },
      {
        id: 'worker-5',
        name: 'Jordan Reyes',
        email: 'jordan.reyes@flexzora.dev',
        phone: '+1 (555) 567-8901',
        avatar_url: '',
        skills: ['Load-In', 'Deck Work', 'Push & Stack'],
        hourly_rate: 40,
        experience_years: 3,
        location: 'Fremont, CA',
        availability_status: 'unavailable',
        last_active: new Date(Date.now() - 86400000).toISOString(),
        total_gigs: 22,
        rating: 4.5,
        certifications: ['OSHA-10'],
        preferred_roles: ['Stagehand', 'Deck Crew']
      }
    ];

    setWorkers(mockWorkers);
    setLoading(false);
  };

  const filterWorkers = () => {
    let filtered = workers;

    // Search filter
    if (searchTerm) {
      filtered = filtered.filter(worker =>
        worker.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        worker.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
        worker.skills.some(skill => skill.toLowerCase().includes(searchTerm.toLowerCase())) ||
        worker.location.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Skill filter
    if (skillFilter) {
      filtered = filtered.filter(worker =>
        worker.skills.some(skill => skill.toLowerCase().includes(skillFilter.toLowerCase()))
      );
    }

    // Availability filter
    if (availabilityFilter !== 'all') {
      filtered = filtered.filter(worker => worker.availability_status === availabilityFilter);
    }

    setFilteredWorkers(filtered);
  };

  const toggleWorkerSelection = (workerId: string) => {
    setSelectedWorkers(prev => 
      prev.includes(workerId) 
        ? prev.filter(id => id !== workerId)
        : [...prev, workerId]
    );
  };

  const selectAllWorkers = () => {
    setSelectedWorkers(filteredWorkers.map(w => w.id));
  };

  const clearSelection = () => {
    setSelectedWorkers([]);
  };

  const broadcastMessage = async () => {
    if (selectedWorkers.length === 0) {
      toast.error('Please select workers to message');
      return;
    }

    // Simulate broadcast
    toast.success(`Message sent to ${selectedWorkers.length} worker${selectedWorkers.length !== 1 ? 's' : ''}!`);
    setShowBroadcastDialog(false);
    clearSelection();
  };

  const exportWorkerData = () => {
    const csvData = filteredWorkers.map(worker => ({
      Name: worker.name,
      Email: worker.email,
      Phone: worker.phone || '',
      Skills: worker.skills.join('; '),
      'Hourly Rate': worker.hourly_rate,
      Experience: worker.experience_years,
      Location: worker.location,
      Availability: worker.availability_status,
      'Total Gigs': worker.total_gigs,
      Rating: worker.rating
    }));

    // Convert to CSV and download
    const csv = [
      Object.keys(csvData[0]).join(','),
      ...csvData.map(row => Object.values(row).join(','))
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'worker-pool.csv';
    a.click();
    window.URL.revokeObjectURL(url);

    toast.success('Worker data exported successfully!');
  };

  const getAvailabilityColor = (status: string) => {
    switch (status) {
      case 'available': return 'bg-green-100 text-green-800';
      case 'busy': return 'bg-yellow-100 text-yellow-800';
      case 'unavailable': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getAvailabilityIcon = (status: string) => {
    switch (status) {
      case 'available': return <CheckCircle className="h-4 w-4" />;
      case 'busy': return <Clock className="h-4 w-4" />;
      case 'unavailable': return <AlertTriangle className="h-4 w-4" />;
      default: return <Clock className="h-4 w-4" />;
    }
  };

  const allSkills = [...new Set(workers.flatMap(w => w.skills))];

  if (loading) {
    return ( 
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header skeleton */}
        <div className="mb-8">
          <div className="h-8 w-64 bg-gray-200 rounded animate-pulse mb-2"></div>
          <div className="h-4 w-96 bg-gray-200 rounded animate-pulse"></div>
        </div>
        
        {/* Stats skeleton */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="bg-white p-6 rounded-lg shadow animate-pulse">
              <div className="flex items-center">
                <div className="h-8 w-8 bg-gray-200 rounded-full mr-4"></div>
                <div>
                  <div className="h-4 w-32 bg-gray-200 rounded mb-2"></div>
                  <div className="h-6 w-16 bg-gray-200 rounded"></div>
                </div>
              </div>
            </div>
          ))}
        </div>
        
        {/* Filters skeleton */}
        <div className="bg-white p-6 rounded-lg shadow mb-6 animate-pulse">
          <div className="flex flex-wrap items-center gap-4">
            <div className="h-10 w-64 bg-gray-200 rounded"></div>
            <div className="h-10 w-32 bg-gray-200 rounded"></div>
            <div className="h-10 w-32 bg-gray-200 rounded"></div>
            <div className="h-10 w-32 bg-gray-200 rounded"></div>
          </div>
        </div>
        
        {/* Workers grid skeleton */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="bg-white p-6 rounded-lg shadow animate-pulse">
              <div className="flex items-start space-x-4">
                <div className="h-12 w-12 bg-gray-200 rounded-full"></div>
                <div className="flex-1">
                  <div className="h-5 w-32 bg-gray-200 rounded mb-2"></div>
                  <div className="h-4 w-24 bg-gray-200 rounded mb-2"></div>
                  <div className="h-4 w-full bg-gray-200 rounded mb-2"></div>
                  <div className="h-4 w-3/4 bg-gray-200 rounded mb-4"></div>
                  <div className="flex flex-wrap gap-1">
                    {[1, 2, 3].map((j) => (
                      <div key={j} className="h-6 w-16 bg-gray-200 rounded"></div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Worker Management</h1>
            <p className="text-gray-600 mt-2">
              Manage your workforce, send messages, and track performance
            </p>
          </div>
          <div className="flex space-x-2">
            <Button variant="outline" onClick={exportWorkerData}>
              <Download className="h-4 w-4 mr-2" />
              Export
            </Button>
            <Button onClick={() => setShowBroadcastDialog(true)} disabled={selectedWorkers.length === 0}>
              <Send className="h-4 w-4 mr-2" />
              Message Selected ({selectedWorkers.length})
            </Button>
          </div>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center">
              <Users className="h-8 w-8 text-blue-600" />
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Total Workers</p>
                <p className="text-2xl font-bold">{workers.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center">
              <CheckCircle className="h-8 w-8 text-green-600" />
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Available Now</p>
                <p className="text-2xl font-bold text-green-600">
                  {workers.filter(w => w.availability_status === 'available').length}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center">
              <DollarSign className="h-8 w-8 text-yellow-600" />
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Avg. Hourly Rate</p>
                <p className="text-2xl font-bold">
                  ${Math.round(workers.reduce((sum, w) => sum + w.hourly_rate, 0) / workers.length)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center">
              <Calendar className="h-8 w-8 text-purple-600" />
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Total Gigs</p>
                <p className="text-2xl font-bold">
                  {workers.reduce((sum, w) => sum + w.total_gigs, 0)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex-1 min-w-64">
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Search workers by name, email, skills, or location..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

            <select 
              value={skillFilter} 
              onChange={(e) => setSkillFilter(e.target.value)}
              className="px-3 py-2 border rounded-md text-sm"
            >
              <option value="">All Skills</option>
              {allSkills.map(skill => (
                <option key={skill} value={skill}>{skill}</option>
              ))}
            </select>

            <select 
              value={availabilityFilter} 
              onChange={(e) => setAvailabilityFilter(e.target.value)}
              className="px-3 py-2 border rounded-md text-sm"
            >
              <option value="all">All Availability</option>
              <option value="available">Available</option>
              <option value="busy">Busy</option>
              <option value="unavailable">Unavailable</option>
            </select>

            <div className="flex space-x-2">
              <Button size="sm" variant="outline" onClick={selectAllWorkers}>
                Select All
              </Button>
              <Button size="sm" variant="outline" onClick={clearSelection}>
                Clear
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Workers Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredWorkers.map((worker) => (
          <Card 
            key={worker.id} 
            className={`cursor-pointer transition-all hover:shadow-md ${
              selectedWorkers.includes(worker.id) ? 'ring-2 ring-blue-500 bg-blue-50' : ''
            }`}
            onClick={() => toggleWorkerSelection(worker.id)}
          >
            <CardContent className="pt-6">
              <div className="flex items-start space-x-4">
                <Avatar className="h-12 w-12">
                  <AvatarImage src={worker.avatar_url} />
                  <AvatarFallback>
                    {worker.name.split(' ').map(n => n[0]).join('')}
                  </AvatarFallback>
                </Avatar>
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-semibold text-lg truncate">{worker.name}</h3>
                    <Badge className={getAvailabilityColor(worker.availability_status)}>
                      <span className="flex items-center gap-1">
                        {getAvailabilityIcon(worker.availability_status)}
                        {worker.availability_status}
                      </span>
                    </Badge>
                  </div>
                  
                  <div className="space-y-2 text-sm text-gray-600">
                    <div>{worker.email}</div>
                    <div className="flex items-center justify-between">
                      <span>${worker.hourly_rate}/hr</span>
                      <span className="text-gray-500">{worker.experience_years} years exp.</span>
                    </div>
                    <div>{worker.location}</div>
                    <div className="flex items-center justify-between">
                      <span>{worker.total_gigs} gigs</span>
                      <div className="flex items-center">
                        <span className="text-yellow-500">★</span>
                        <span className="ml-1 font-medium">{worker.rating}</span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-3">
                    <div className="flex flex-wrap gap-1">
                      {worker.skills.slice(0, 3).map((skill) => (
                        <Badge key={skill} variant="outline" className="text-xs">
                          {skill}
                        </Badge>
                      ))}
                      {worker.skills.length > 3 && (
                        <Badge variant="outline" className="text-xs">
                          +{worker.skills.length - 3} more
                        </Badge>
                      )}
                    </div>
                  </div>

                  <div className="mt-3 text-xs text-gray-500 flex items-center">
                    <Clock className="h-3 w-3 mr-1" />
                    Last active: {new Date(worker.last_active).toLocaleDateString()}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {filteredWorkers.length === 0 && (
        <Card>
          <CardContent className="text-center py-12">
            <Users className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No Workers Found</h3>
            <p className="text-gray-600">
              Try adjusting your search criteria or filters.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Broadcast Message Dialog */}
      {showBroadcastDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4">
              Send Message to {selectedWorkers.length} Worker{selectedWorkers.length !== 1 ? 's' : ''}
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Subject</label>
                <Input placeholder="Message subject..." />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Message</label>
                <textarea 
                  className="w-full p-3 border rounded-md" 
                  rows={4}
                  placeholder="Type your message here..."
                />
              </div>
            </div>
            <div className="flex justify-end space-x-2 mt-6">
              <Button variant="outline" onClick={() => setShowBroadcastDialog(false)}>
                Cancel
              </Button>
              <Button onClick={broadcastMessage}>
                Send Message
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CompanyDashboard;