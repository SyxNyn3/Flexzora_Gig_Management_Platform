import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { Gig, GigApplication } from '@/lib/types';
import ReviewStars from '@/components/reviews/ReviewStars';
import { 
  MapPin, 
  Calendar, 
  DollarSign, 
  Users,
  Building,
  Clock,
  ArrowLeft,
  Send,
  CheckCircle,
  XCircle,
  AlertCircle,
  Star
} from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';

const GigDetails: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [gig, setGig] = useState<Gig | null>(null);
  const [application, setApplication] = useState<GigApplication | null>(null);
  const [workerRating, setWorkerRating] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [showApplicationDialog, setShowApplicationDialog] = useState(false);
  const [coverLetter, setCoverLetter] = useState('');
  const [proposedRate, setProposedRate] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (id) {
      fetchGigDetails();
      checkExistingApplication();
    }
  }, [id, profile]);

  const fetchGigDetails = async () => {
    if (!id) return;

    try {
      const { data, error } = await supabase
        .from('gigs')
        .select(`
          *,
          company:companies(
            id,
            name,
            logo_url,
            description,
            website_url,
            contact_email
          ),
          creator:profiles(
            id,
            full_name,
            avatar_url
          )
        `)
        .eq('id', id)
        .single();

      if (error) throw error;
      setGig(data);
    } catch (error) {
      console.error('Error fetching gig details:', error);
      toast.error('Failed to load gig details');
    } finally {
      setLoading(false);
    }
  };

  const fetchWorkerRating = async () => {
    if (!gig?.created_by) return;
    
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('average_rating')
        .eq('id', gig.created_by)
        .single();

      if (error) throw error;
      
      if (data && data.average_rating) {
        setWorkerRating(data.average_rating);
      }
    } catch (error) {
      console.error('Error fetching worker rating:', error);
    }
  };

  const checkExistingApplication = async () => {
    if (!id || !profile) return;

    try {
      const { data } = await supabase
        .from('gig_applications')
        .select('*')
        .eq('gig_id', id)
        .eq('worker_id', profile.id)
        .single();

      if (data) {
        setApplication(data);
      }
    } catch {
      // No existing application found, which is fine
    }
  };

  useEffect(() => {
    if (gig) fetchWorkerRating();
  }, [gig]);

  const handleApplicationSubmit = async () => {
    if (!gig || !profile) return;

    setSubmitting(true);
    try {
      const { error } = await supabase
        .from('gig_applications')
        .insert({
          gig_id: gig.id,
          worker_id: profile.id,
          cover_letter: coverLetter,
          proposed_rate: proposedRate ? parseFloat(proposedRate) : null,
        });

      if (error) throw error;

      toast.success('Application submitted successfully!');
      setShowApplicationDialog(false);
      checkExistingApplication();
    } catch (error) {
      console.error('Error submitting application:', error);
      toast.error((error as Error).message || 'Failed to submit application');
    } finally {
      setSubmitting(false);
    }
  };

  const getDaysUntilStart = (startDate: string) => {
    const start = new Date(startDate);
    const now = new Date();
    const diffTime = start.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  const getApplicationStatusIcon = (status: string) => {
    switch (status) {
      case 'accepted':
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      case 'rejected':
        return <XCircle className="h-5 w-5 text-red-500" />;
      default:
        return <AlertCircle className="h-5 w-5 text-yellow-500" />;
    }
  };

  const getApplicationStatusColor = (status: string) => {
    switch (status) {
      case 'accepted': return 'bg-green-500/15 text-emerald-500 dark:text-green-400';
      case 'rejected': return 'bg-red-500/15 text-destructive dark:text-red-400';
      case 'pending': return 'bg-amber-500/15 text-amber-600 dark:text-amber-400';
      default: return 'bg-muted text-foreground/90';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!gig) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Card>
          <CardContent className="text-center py-12">
            <h3 className="text-lg font-medium text-foreground mb-2">Gig not found</h3>
            <p className="text-muted-foreground mb-4">
              The gig you're looking for doesn't exist or has been removed.
            </p>
            <Button onClick={() => navigate('/gigs')}>
              Back to Gigs
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const daysUntilStart = getDaysUntilStart(gig.start_date);
  const isUrgent = daysUntilStart <= 7 && daysUntilStart > 0;

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Back Button */}
      <Button
        variant="ghost"
        onClick={() => navigate('/gigs')}
        className="mb-6"
      >
        <ArrowLeft className="h-4 w-4 mr-2" />
        Back to Gigs
      </Button>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Header */}
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="flex items-center space-x-4">
                  <Avatar className="h-12 w-12">
                    <AvatarImage src={gig.company?.logo_url} alt={gig.company?.name} />
                    <AvatarFallback>
                      <Building className="h-6 w-6" />
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <CardTitle className="text-2xl">{gig.title}</CardTitle>
                    <CardDescription className="text-lg font-medium">
                      {gig.company?.name}
                    </CardDescription>
                  </div>
                </div>
                {isUrgent && (
                  <Badge variant="destructive">
                    Urgent
                  </Badge>
                )}
              </div>
              
              {/* Creator Info */}
              {gig.creator && (
                <div className="mt-4">
                  <Separator className="my-4" />
                  <p className="text-sm text-muted-foreground mb-2">Posted by:</p>
                  <div className="flex items-center">
                    <Avatar className="h-8 w-8 mr-2">
                      <AvatarFallback>{gig.creator.full_name?.split(' ').map(n => n[0]).join('') || 'U'}</AvatarFallback>
                    </Avatar>
                    <span className="font-medium">{gig.creator.full_name}</span>
                    {workerRating && <ReviewStars rating={workerRating} size="sm" className="ml-2" showText />}
                  </div>
                </div>
              )}
            </CardHeader>
          </Card>

          {/* Description */}
          <Card>
            <CardHeader>
              <CardTitle>Job Description</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-foreground/80 leading-relaxed">
                {gig.description}
              </p>

              {gig.special_requirements && (
                <div className="mt-6">
                  <h4 className="font-medium mb-2">Special Requirements</h4>
                  <p className="text-muted-foreground">{gig.special_requirements}</p>
                </div>
              )}

              {gig.equipment_provided && gig.equipment_provided.length > 0 && (
                <div className="mt-6">
                  <h4 className="font-medium mb-2">Equipment Provided</h4>
                  <ul className="list-disc list-inside space-y-1">
                    {gig.equipment_provided.map((equipment, index) => (
                      <li key={index} className="text-muted-foreground">{equipment}</li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Skills Required */}
          {gig.skills_required && gig.skills_required.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Skills Required</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {gig.skills_required.map((skill, index) => (
                    <Badge key={index} variant="secondary">
                      {skill}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Application Status */}
          {application && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  {getApplicationStatusIcon(application.status)}
                  <span className="ml-2">Application Status</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Badge className={getApplicationStatusColor(application.status)}>
                  {application.status.charAt(0).toUpperCase() + application.status.slice(1)}
                </Badge>
                <p className="text-sm text-muted-foreground mt-2">
                  Applied on {format(new Date(application.application_date), 'MMM d, yyyy')}
                </p>
                {application.proposed_rate && (
                  <p className="text-sm text-muted-foreground">
                    Proposed rate: ${application.proposed_rate}/hour
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          {/* Gig Details */}
          <Card>
            <CardHeader>
              <CardTitle>Gig Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center text-sm">
                <MapPin className="h-4 w-4 mr-2 text-muted-foreground/70" />
                <span>{gig.location}</span>
                {gig.is_remote && (
                  <Badge variant="outline" className="ml-2 text-xs">
                    Remote
                  </Badge>
                )}
              </div>

              <div className="flex items-center text-sm">
                <Calendar className="h-4 w-4 mr-2 text-muted-foreground/70" />
                <div>
                  <div>{format(new Date(gig.start_date), 'MMM d, yyyy h:mm a')}</div>
                  <div className="text-muted-foreground">to {format(new Date(gig.end_date), 'MMM d, yyyy h:mm a')}</div>
                </div>
              </div>

              {gig.hourly_rate && (
                <div className="flex items-center text-sm">
                  <DollarSign className="h-4 w-4 mr-2 text-muted-foreground/70" />
                  <span>${gig.hourly_rate}/hour</span>
                </div>
              )}

              <div className="flex items-center text-sm">
                <Users className="h-4 w-4 mr-2 text-muted-foreground/70" />
                <span>{gig.required_workers} worker{gig.required_workers !== 1 ? 's' : ''} needed</span>
              </div>

              {daysUntilStart > 0 && (
                <div className="flex items-center text-sm">
                  <Clock className="h-4 w-4 mr-2 text-muted-foreground/70" />
                  <span>Starts in {daysUntilStart} day{daysUntilStart !== 1 ? 's' : ''}</span>
                </div>
              )}
            </CardContent>
          </Card>
            
          {/* Apply Button */}
          {profile?.role === 'worker' && !application && (
            <Button 
              className="w-full"
              onClick={() => setShowApplicationDialog(true)}
            >
              <Send className="h-4 w-4 mr-2" />
              Apply for this Gig
            </Button>
          )}
            
          {/* Company Info */}
          {gig.company && (
            <Card>
              <CardHeader>
                <CardTitle>About {gig.company.name}</CardTitle>
              </CardHeader>
              <CardContent>
                {gig.company.description && (
                  <p className="text-sm text-muted-foreground mb-4">
                    {gig.company.description}
                  </p>
                )}
                {gig.company.website_url && (
                  <Button variant="outline" size="sm" asChild>
                    <a href={gig.company.website_url} target="_blank" rel="noopener noreferrer">
                      Visit Website
                    </a>
                  </Button>
                )}
              </CardContent>
            </Card>
          )}
            
          {/* Worker Rating */}
          {gig.creator && workerRating && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Star className="h-5 w-5 mr-2 text-yellow-500" />
                  Worker Rating
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-center mb-2">
                  <span className="text-2xl font-bold mr-2">{workerRating.toFixed(1)}</span>
                  <ReviewStars rating={workerRating} size="lg" />
                </div>
                <Button 
                  variant="outline" 
                  className="w-full"
                  onClick={() => navigate(`/profile/${gig.creator?.id}`)}
                >
                  View Profile & Reviews
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Application Dialog */}
      <Dialog open={showApplicationDialog} onOpenChange={setShowApplicationDialog}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Apply for {gig.title}</DialogTitle>
            <DialogDescription>
              Submit your application for this gig. A cover letter can help you stand out.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <Label htmlFor="coverLetter">Cover Letter</Label>
              <Textarea
                id="coverLetter"
                placeholder="Tell the employer why you're perfect for this gig..."
                value={coverLetter}
                onChange={(e) => setCoverLetter(e.target.value)}
                rows={4}
              />
            </div>

            <div>
              <Label htmlFor="proposedRate">Proposed Hourly Rate (Optional)</Label>
              <Input
                id="proposedRate"
                type="number"
                placeholder="Enter your desired hourly rate"
                value={proposedRate}
                onChange={(e) => setProposedRate(e.target.value)}
              />
              {gig.hourly_rate && (
                <p className="text-sm text-muted-foreground mt-1">
                  Posted rate: ${gig.hourly_rate}/hour
                </p>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowApplicationDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleApplicationSubmit} disabled={submitting}>
              {submitting ? 'Submitting...' : 'Submit Application'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default GigDetails;