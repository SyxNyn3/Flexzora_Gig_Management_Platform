import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import GigCommunication from './GigCommunication';
import WorkerPayroll from './WorkerPayroll';
import ReviewForm from '@/components/reviews/ReviewForm';
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
  Building,
  Star,
  X
} from 'lucide-react';
import { format } from 'date-fns';
import { useGig, useApplications } from '@/hooks/useSupabaseQuery';

interface GigManagementProps {
  gigId?: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const GigManagement: React.FC<GigManagementProps> = ({ gigId: propGigId }) => {
  const { id: routeId } = useParams();
  const gigId = routeId ?? propGigId ?? '';
  const [activeTab, setActiveTab] = useState('overview');

  // State for review form
  const [showReviewForm, setShowReviewForm] = useState(false);
  const [selectedWorker, setSelectedWorker] = useState<string | null>(null);

  const isLiveGig = UUID_RE.test(gigId);
  const { data: gigData, loading: gigLoading } = useGig(isLiveGig ? gigId : null);
  const { data: applicationData } = useApplications({ gigId: isLiveGig ? gigId : undefined });

  // No demo fallback: a gig page either loads the real gig or says so.
  // The old mock roster showed fake workers/payroll whenever the fetch
  // missed — on a production page that's fabricated data presented as real.
  if (!isLiveGig || (!gigLoading && !gigData)) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Card>
          <CardContent className="text-center py-16">
            <Users className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <h2 className="text-lg font-semibold">Gig not found</h2>
            <p className="text-sm text-muted-foreground mt-1">
              This gig doesn't exist or you don't have access to it.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (gigLoading || !gigData) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-4">
        <div className="h-8 w-64 bg-muted animate-pulse rounded" />
        <div className="h-64 bg-muted animate-pulse rounded-lg" />
      </div>
    );
  }

  const gig = gigData;
  const workers = (applicationData ?? [])
    .filter((a) => a.status === 'accepted' || a.status === 'confirmed')
    .map((a) => ({
      id: a.worker_id,
      name: a.worker?.full_name ?? 'Crew member',
      email: a.worker?.email ?? '',
      hourly_rate: a.worker?.hourly_rate ?? gig.hourly_rate ?? 0,
      avatar_url: '',
      status: a.status as 'accepted' | 'confirmed',
    }));
  const applications = applicationData ?? [];
  const acceptedWorkers = workers;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">{gig.title}</h1>
            <div className="flex items-center space-x-4 mt-2 text-muted-foreground">
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
          <Badge className="bg-emerald-500/10 text-green-800">
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
                  <p className="text-foreground leading-relaxed mb-4">
                    {gig.description}
                  </p>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="font-medium">Duration:</span>
                      <span className="ml-2">
                        {Math.round((new Date(gig.end_date).getTime() - new Date(gig.start_date).getTime()) / (1000 * 60 * 60))} hours
                      </span>
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
                      <span className="ml-2">{acceptedWorkers.length}</span>
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
                    <span className="text-muted-foreground">Total Budget</span>
                    <span className="font-medium">
                      ${gig.hourly_rate && acceptedWorkers.length 
                        ? (gig.hourly_rate * Math.round((new Date(gig.end_date).getTime() - new Date(gig.start_date).getTime()) / (1000 * 60 * 60)) * acceptedWorkers.length).toLocaleString()
                        : 'TBD'
                      }
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Applications</span>
                    <span className="font-medium">{applications.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Confirmed Workers</span>
                    <span className="font-medium">{acceptedWorkers.filter(w => w.status === 'confirmed').length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Pending Confirmations</span>
                    <span className="font-medium">{acceptedWorkers.filter(w => w.status === 'accepted').length}</span>
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
                {acceptedWorkers.map((worker) => (
                  <div key={worker.id} className="flex items-center space-x-3 p-3 border rounded-lg">
                    <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
                      <span className="text-primary font-medium">
                        {worker.name.split(' ').map((n: string) => n[0]).join('')}
                      </span>
                    </div>
                    <div className="flex-1">
                      <h4 className="font-medium">{worker.name}</h4>
                      <div className="flex items-center space-x-2">
                        <span className="text-sm text-muted-foreground">${worker.hourly_rate}/hr</span>
                        <Badge variant={worker.status === 'confirmed' ? 'default' : 'secondary'}>
                          {worker.status}
                        </Badge>
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedWorker(worker.id);
                        setShowReviewForm(true);
                      }}
                    >
                      <Star className="h-4 w-4 mr-2" />
                      Review
                    </Button>
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
            workers={acceptedWorkers}
          />
        </TabsContent>

        <TabsContent value="payroll">
          <WorkerPayroll
            gigId={gigId}
            gigTitle={gig.title}
            workers={acceptedWorkers}
          />
        </TabsContent>

        <TabsContent value="conflicts">
          <ConflictDetection 
            gigId={gigId}
            gigTitle={gig.title}
            gigStartDate={gig.start_date}
            gigEndDate={gig.end_date}
            gigLocation={gig.location}
            workers={acceptedWorkers}
          />
        </TabsContent>

        <TabsContent value="applications">
          <ApplicationsManager gigId={gigId} />
        </TabsContent>
      </Tabs>
      
      {/* Review Form Dialog */}
      {showReviewForm && selectedWorker && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-lg w-full max-w-md">
            <div className="p-4 border-b flex justify-between items-center">
              <h3 className="text-lg font-semibold">Write a Review</h3>
              <Button 
                variant="ghost" 
                size="sm" 
                className="h-8 w-8 p-0"
                onClick={() => setShowReviewForm(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="p-4">
              <ReviewForm 
                workerId={selectedWorker} 
                gigId={gigId}
                onSuccess={() => {
                  setShowReviewForm(false);
                  setSelectedWorker(null);
                }}
                onCancel={() => {
                  setShowReviewForm(false);
                  setSelectedWorker(null);
                }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default GigManagement;