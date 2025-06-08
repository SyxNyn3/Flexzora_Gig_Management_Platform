import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/contexts/AuthContext';
import GigCommunication from './GigCommunication';
import WorkerPayroll from './WorkerPayroll';
import ConflictDetection from './ConflictDetection';
import ApplicationsManager from './ApplicationsManager';
import { 
  MessageSquare, 
  DollarSign, 
  AlertTriangle,
  Users,
  Calendar,
  MapPin,
  Clock,
  Building
} from 'lucide-react';
import { format } from 'date-fns';

interface GigManagementProps {
  gigId: string;
}

// Mock data for demo
const mockGig = {
  id: '1',
  title: 'Corporate Event Video Production',
  description: 'Multi-camera video production for annual company meeting',
  company: { name: 'TechCorp Events', logo_url: null },
  location: 'San Francisco, CA',
  start_date: '2024-01-15T08:00:00Z',
  end_date: '2024-01-15T18:00:00Z',
  hourly_rate: 45,
  required_workers: 5,
  status: 'published',
};

const mockWorkers = [
  {
    id: 'worker-1',
    name: 'John Smith',
    email: 'john@example.com',
    hourly_rate: 45,
    avatar_url: '',
    status: 'accepted' as const,
  },
  {
    id: 'worker-2',
    name: 'Sarah Davis',
    email: 'sarah@example.com',
    hourly_rate: 50,
    avatar_url: '',
    status: 'confirmed' as const,
  },
  {
    id: 'worker-3',
    name: 'Mike Johnson',
    email: 'mike@example.com',
    hourly_rate: 40,
    avatar_url: '',
    status: 'accepted' as const,
  },
];

const GigManagement: React.FC<GigManagementProps> = ({ gigId }) => {
  const { profile } = useAuth();
  const [activeTab, setActiveTab] = useState('overview');

  const gig = mockGig;
  const workers = mockWorkers;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">{gig.title}</h1>
            <div className="flex items-center space-x-4 mt-2 text-gray-600">
              <div className="flex items-center">
                <Building className="h-4 w-4 mr-1" />
                {gig.company.name}
              </div>
              <div className="flex items-center">
                <MapPin className="h-4 w-4 mr-1" />
                {gig.location}
              </div>
              <div className="flex items-center">
                <Calendar className="h-4 w-4 mr-1" />
                {format(new Date(gig.start_date), 'MMM d, yyyy')}
              </div>
              <div className="flex items-center">
                <Clock className="h-4 w-4 mr-1" />
                {format(new Date(gig.start_date), 'h:mm a')} - {format(new Date(gig.end_date), 'h:mm a')}
              </div>
            </div>
          </div>
          <Badge className="bg-green-100 text-green-800">
            {gig.status}
          </Badge>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="communication">
            <MessageSquare className="h-4 w-4 mr-2" />
            Communication
          </TabsTrigger>
          <TabsTrigger value="payroll">
            <DollarSign className="h-4 w-4 mr-2" />
            Payroll
          </TabsTrigger>
          <TabsTrigger value="conflicts">
            <AlertTriangle className="h-4 w-4 mr-2" />
            Conflicts
          </TabsTrigger>
          <TabsTrigger value="applications">
            <Users className="h-4 w-4 mr-2" />
            Applications
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          {/* Gig Overview */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <Card>
                <CardHeader>
                  <CardTitle>Gig Details</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-gray-700 leading-relaxed mb-4">
                    {gig.description}
                  </p>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="font-medium">Duration:</span>
                      <span className="ml-2">10 hours</span>
                    </div>
                    <div>
                      <span className="font-medium">Hourly Rate:</span>
                      <span className="ml-2">${gig.hourly_rate}/hour</span>
                    </div>
                    <div>
                      <span className="font-medium">Workers Needed:</span>
                      <span className="ml-2">{gig.required_workers}</span>
                    </div>
                    <div>
                      <span className="font-medium">Workers Assigned:</span>
                      <span className="ml-2">{workers.length}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div>
              <Card>
                <CardHeader>
                  <CardTitle>Quick Stats</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Total Budget</span>
                    <span className="font-medium">${(gig.hourly_rate * 10 * workers.length).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Applications</span>
                    <span className="font-medium">12</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Confirmed Workers</span>
                    <span className="font-medium">{workers.filter(w => w.status === 'confirmed').length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Pending Confirmations</span>
                    <span className="font-medium">{workers.filter(w => w.status === 'accepted').length}</span>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Team Members */}
          <Card>
            <CardHeader>
              <CardTitle>Team Members</CardTitle>
              <CardDescription>
                Workers assigned to this gig
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {workers.map((worker) => (
                  <div key={worker.id} className="flex items-center space-x-3 p-3 border rounded-lg">
                    <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                      <span className="text-blue-600 font-medium">
                        {worker.name.split(' ').map(n => n[0]).join('')}
                      </span>
                    </div>
                    <div>
                      <h4 className="font-medium">{worker.name}</h4>
                      <div className="flex items-center space-x-2">
                        <span className="text-sm text-gray-600">${worker.hourly_rate}/hr</span>
                        <Badge variant={worker.status === 'confirmed' ? 'default' : 'secondary'}>
                          {worker.status}
                        </Badge>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="communication">
          <GigCommunication 
            gigId={gigId}
            gigTitle={gig.title}
            workers={workers}
          />
        </TabsContent>

        <TabsContent value="payroll">
          <WorkerPayroll 
            gigId={gigId}
            gigTitle={gig.title}
            workers={workers}
          />
        </TabsContent>

        <TabsContent value="conflicts">
          <ConflictDetection 
            gigId={gigId}
            gigTitle={gig.title}
            gigStartDate={gig.start_date}
            gigEndDate={gig.end_date}
            gigLocation={gig.location}
            workers={workers}
          />
        </TabsContent>

        <TabsContent value="applications">
          <ApplicationsManager gigId={gigId} />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default GigManagement;