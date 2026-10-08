import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAuth } from '@/contexts/AuthContext';
import { DatabaseService, normalizeUrl } from '@/lib/supabase';
import { useSkills, useWorkerSkills, useCertifications, useReviewsForWorker } from '@/hooks/useSupabaseQuery';
import { useCertificationTypes } from '@/hooks/useMarketplace';
import { Certification, PortfolioItem } from '@/lib/types';
import ReviewsList from '@/components/reviews/ReviewsList';
import ReviewStars from '@/components/reviews/ReviewStars';
import { 
  Save,
  Award,
  Plus,
  X,
  Camera,
  Edit,
  Trash2,
  ExternalLink
} from 'lucide-react';
import { toast } from 'sonner';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import PortfolioSection from './PortfolioSection';

const profileSchema = z.object({
  full_name: z.string().min(2, 'Name must be at least 2 characters'),
  username: z.string().optional().refine(
    (v) => !v || /^[a-z0-9][a-z0-9-]{1,29}$/.test(v),
    'Lowercase letters, numbers and dashes only, 2-30 characters'
  ),
  phone: z.string().optional(),
  location: z.string().optional(),
  bio: z.string().optional(),
  hourly_rate: z.string().optional(),
  experience_years: z.string().optional(),
  portfolio_url: z.string().optional().refine((val) => {
    if (!val) return true;
    const urlPattern = /^(https?:\/\/)?([\da-z.-]+)\.([a-z.]{2,6})([/\w .-]*)*\/?$/;
    return urlPattern.test(val);
  }, 'Please enter a valid URL'),
  linkedin_url: z.string().optional().refine((val) => {
    if (!val) return true;
    const urlPattern = /^(https?:\/\/)?([\da-z.-]+)\.([a-z.]{2,6})([/\w .-]*)*\/?$/;
    return urlPattern.test(val);
  }, 'Please enter a valid URL'),
});

const skillSchema = z.object({
  skill_name: z.string().min(1, 'Skill name is required'),
  proficiency_level: z.number().min(1).max(5),
  years_experience: z.number().min(0).max(50),
});

const OTHER_CERT_TYPE = '__other__';

const certificationSchema = z.object({
  cert_type_code: z.string().optional(),
  name: z.string().min(2, 'Certification name is required'),
  issuing_organization: z.string().optional(),
  issue_date: z.string().optional(),
  expiration_date: z.string().optional(),
  credential_id: z.string().optional(),
  credential_url: z.string().optional().refine((val) => {
    if (!val) return true;
    const urlPattern = /^(https?:\/\/)?([\da-z.-]+)\.([a-z.]{2,6})([/\w .-]*)*\/?$/;
    return urlPattern.test(val);
  }, 'Please enter a valid URL'),
});

type ProfileForm = z.infer<typeof profileSchema>;
type SkillForm = z.infer<typeof skillSchema>;
type CertificationForm = z.infer<typeof certificationSchema>;

const ProfilePage: React.FC = () => {
  const { profile, updateProfile, refreshProfile } = useAuth();
  const [loading, setLoading] = useState(false);
  const [showSkillDialog, setShowSkillDialog] = useState(false);
  const [showCertDialog, setShowCertDialog] = useState(false);
  const [editingCert, setEditingCert] = useState<Certification | null>(null);
  const [portfolioItems, setPortfolioItems] = useState<PortfolioItem[]>([]);

  // Fetch data using custom hooks 
  const { data: skills } = useSkills();
  const { data: workerSkills, refetch: refetchWorkerSkills } = useWorkerSkills(profile?.id || '');
  const { data: certifications, refetch: refetchCertifications } = useCertifications(profile?.id || '');
  const certTypes = useCertificationTypes();
  useReviewsForWorker(profile?.id || '');

  const form = useForm<ProfileForm>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      full_name: profile?.full_name || '',
      username: profile?.username || '',
      phone: profile?.phone || '',
      location: profile?.location || '',
      bio: profile?.bio || '',
      hourly_rate: profile?.hourly_rate?.toString() || '',
      experience_years: profile?.experience_years?.toString() || '',
      portfolio_url: profile?.portfolio_url?.replace(/^https?:\/\//, '') || '',
      linkedin_url: profile?.linkedin_url?.replace(/^https?:\/\//, '') || '',
    },
  });

  const skillForm = useForm<SkillForm>({
    resolver: zodResolver(skillSchema),
    defaultValues: {
      skill_name: '',
      proficiency_level: 3,
      years_experience: 0,
    },
  });

  const certForm = useForm<CertificationForm>({
    resolver: zodResolver(certificationSchema),
    defaultValues: {
      name: '',
      issuing_organization: '',
      issue_date: '',
      expiration_date: '',
      credential_id: '',
      credential_url: '',
    },
  });

  // Update form when profile changes
  React.useEffect(() => {
    if (profile) {
      form.reset({
        full_name: profile.full_name,
        username: profile.username || '',
        phone: profile.phone || '',
        location: profile.location || '',
        bio: profile.bio || '',
        hourly_rate: profile.hourly_rate?.toString() || '',
        experience_years: profile.experience_years?.toString() || '',
        portfolio_url: profile.portfolio_url?.replace(/^https?:\/\//, '') || '',
        linkedin_url: profile.linkedin_url?.replace(/^https?:\/\//, '') || '',
      });
      
      // Initialize portfolio items from profile
      if (profile.portfolio_items) {
        setPortfolioItems(profile.portfolio_items);
      }
    }
  }, [profile, form]);

  const onSubmit = async (data: ProfileForm) => {
    setLoading(true);
    try {
      const updates = {
        ...data,
        username: data.username || null,
        hourly_rate: data.hourly_rate ? parseFloat(data.hourly_rate) : null,
        experience_years: data.experience_years ? parseInt(data.experience_years) : 0,
        portfolio_url: data.portfolio_url ? normalizeUrl(data.portfolio_url) : null,
        linkedin_url: data.linkedin_url ? normalizeUrl(data.linkedin_url) : null,
      };

      const { error } = await updateProfile(updates);
      if (error) throw new Error(error);

      // Refresh profile to ensure UI is updated with latest data
      await refreshProfile();
      
      toast.success('Profile updated successfully!');
    } catch (error) {
      console.error('Error updating profile:', error);
      toast.error((error as Error).message || 'Failed to update profile');
    } finally {
      setLoading(false);
    }
  };

  const onAddSkill = async (data: SkillForm) => {
    if (!profile) return;

    try {
      // Check if skill already exists
      const existingSkill = (workerSkills ?? []).find(ws => 
        ws.skill?.name.toLowerCase() === data.skill_name.toLowerCase()
      );

      if (existingSkill) {
        toast.error('You already have this skill added');
        return;
      }

      // Find or create skill
      let skillId = (skills ?? []).find(s => s.name.toLowerCase() === data.skill_name.toLowerCase())?.id;
      
      if (!skillId) {
        // For demo mode or if skill doesn't exist, create a mock skill ID
        skillId = `skill-${Date.now()}`;
      }

      const skillData = {
        worker_id: profile.id,
        skill_id: skillId,
        proficiency_level: data.proficiency_level,
        years_experience: data.years_experience,
      };

      const { error } = await DatabaseService.addWorkerSkill(skillData);
      if (error) throw new Error(error);

      toast.success('Skill added successfully!');
      setShowSkillDialog(false);
      skillForm.reset();
      await refetchWorkerSkills();
    } catch (error) {
      console.error('Error adding skill:', error);
      toast.error((error as Error).message || 'Failed to add skill');
    }
  };

  const removeSkill = async (workerSkillId: string) => {
    try {
      const { error } = await DatabaseService.removeWorkerSkill(workerSkillId);
      if (error) throw new Error(error);

      toast.success('Skill removed successfully!');
      await refetchWorkerSkills();
    } catch (error) {
      console.error('Error removing skill:', error);
      toast.error((error as Error).message || 'Failed to remove skill');
    }
  };

  const onAddCertification = async (data: CertificationForm) => {
    if (!profile) return;

    try {
      const certData = {
        worker_id: profile.id,
        cert_type_code: data.cert_type_code && data.cert_type_code !== OTHER_CERT_TYPE ? data.cert_type_code : undefined,
        name: data.name,
        issuing_organization: data.issuing_organization || undefined,
        issue_date: data.issue_date || undefined,
        expiration_date: data.expiration_date || undefined,
        credential_id: data.credential_id || undefined,
        credential_url: data.credential_url ? normalizeUrl(data.credential_url) : undefined,
        is_active: true,
      };

      if (editingCert) {
        const { error } = await DatabaseService.updateCertification(editingCert.id, certData);
        if (error) throw new Error(error);
        toast.success('Certification updated successfully!');
      } else {
        const { error } = await DatabaseService.addCertification(certData);
        if (error) throw new Error(error);
        toast.success('Certification added successfully!');
      }

      setShowCertDialog(false);
      setEditingCert(null);
      certForm.reset();
      await refetchCertifications();
    } catch (error) {
      console.error('Error saving certification:', error);
      toast.error((error as Error).message || 'Failed to save certification');
    }
  };

  const removeCertification = async (certId: string) => {
    try {
      const { error } = await DatabaseService.removeCertification(certId);
      if (error) throw new Error(error);

      toast.success('Certification removed successfully!');
      await refetchCertifications();
    } catch (error) {
      console.error('Error removing certification:', error);
      toast.error((error as Error).message || 'Failed to remove certification');
    }
  };

  const editCertification = (cert: Certification) => {
    setEditingCert(cert);
    certForm.reset({
      cert_type_code: cert.cert_type_code || OTHER_CERT_TYPE,
      name: cert.name,
      issuing_organization: cert.issuing_organization || '',
      issue_date: cert.issue_date || '',
      expiration_date: cert.expiration_date || '',
      credential_id: cert.credential_id || '',
      credential_url: cert.credential_url?.replace(/^https?:\/\//, '') || '',
    });
    setShowCertDialog(true);
  };

  const handleAddPortfolioItem = async (item: Omit<PortfolioItem, 'id' | 'worker_id' | 'created_at' | 'updated_at'>) => {
    if (!profile) return;
    
    try {
      const newItem = {
        ...item,
        id: `portfolio-${Date.now()}`,
      } as PortfolioItem;
      
      const updatedItems = [...portfolioItems, newItem];
      setPortfolioItems(updatedItems);
      
      const { error } = await updateProfile({ portfolio_items: updatedItems });
      if (error) throw new Error(error);
      
      return;
    } catch (error) {
      console.error('Error adding portfolio item:', error);
      throw new Error((error as Error).message || 'Failed to add portfolio item');
    }
  };
  
  const handleUpdatePortfolioItem = async (id: string, updates: Partial<PortfolioItem>) => {
    if (!profile) return;
    
    try {
      const updatedItems = portfolioItems.map(item => 
        item.id === id ? { ...item, ...updates } : item
      );
      
      setPortfolioItems(updatedItems);
      
      const { error } = await updateProfile({ portfolio_items: updatedItems });
      if (error) throw new Error(error);
      
      return;
    } catch (error) {
      console.error('Error updating portfolio item:', error);
      throw new Error((error as Error).message || 'Failed to update portfolio item');
    }
  };
  
  const handleDeletePortfolioItem = async (id: string) => {
    if (!profile) return;
    
    try {
      const updatedItems = portfolioItems.filter(item => item.id !== id);
      setPortfolioItems(updatedItems);
      
      const { error } = await updateProfile({ portfolio_items: updatedItems });
      if (error) throw new Error(error);
      
      return;
    } catch (error) {
      console.error('Error deleting portfolio item:', error);
      throw new Error((error as Error).message || 'Failed to delete portfolio item');
    }
  };

  const getProficiencyLabel = (level: number) => {
    switch (level) {
      case 1: return 'Beginner';
      case 2: return 'Novice';
      case 3: return 'Intermediate';
      case 4: return 'Advanced';
      case 5: return 'Expert';
      default: return 'Unknown';
    }
  };

  const getProficiencyColor = (level: number) => {
    switch (level) {
      case 1: return 'bg-destructive/10 text-red-800';
      case 2: return 'bg-orange-100 text-orange-800';
      case 3: return 'bg-amber-500/10 text-yellow-800';
      case 4: return 'bg-primary/10 text-primary';
      case 5: return 'bg-emerald-500/10 text-green-800';
      default: return 'bg-muted text-foreground';
    }
  };

  if (!profile) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header skeleton */}
        <div className="mb-8">
          <Skeleton className="h-8 w-64 mb-2" />
          <Skeleton className="h-4 w-96" />
        </div>
        
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Profile sidebar skeleton */}
          <div className="space-y-6">
            <Skeleton className="h-64" />
            <Skeleton className="h-48" />
          </div>
          
          {/* Main content skeleton */}
          <div className="lg:col-span-2 space-y-6">
            <Skeleton className="h-96" />
            <Skeleton className="h-64" />
            <Skeleton className="h-64" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h1 className="text-3xl font-bold text-foreground">Profile Settings</h1>
          {profile?.role === 'worker' && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (!profile.username) {
                  toast.error('Set a username below to get your public profile link');
                  return;
                }
                navigator.clipboard.writeText(`${window.location.origin}/u/${profile.username}`);
                toast.success('Public profile link copied');
              }}
            >
              <ExternalLink className="w-4 h-4 mr-1" /> Share public profile
            </Button>
          )}
        </div>
        <p className="text-muted-foreground mt-2">
          Manage your profile information and showcase your skills
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Profile Picture & Quick Info */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Profile Picture</CardTitle>
            </CardHeader>
            <CardContent className="text-center">
              <div className="relative mx-auto w-24 h-24 mb-4">
                <Avatar className="w-24 h-24">
                  <AvatarImage src={profile.avatar_url || ''} alt={profile.full_name} />
                  <AvatarFallback className="text-lg">
                    {profile.full_name.split(' ').map(n => n[0]).join('')}
                  </AvatarFallback>
                </Avatar>
                <Button
                  size="sm"
                  className="absolute bottom-0 right-0 rounded-full w-8 h-8 p-0"
                  onClick={() => toast.info('Photo upload coming soon!')}
                >
                  <Camera className="w-4 h-4" />
                </Button>
              </div>
              <h3 className="font-medium">{profile.full_name}</h3>
              <p className="text-sm text-muted-foreground">{profile.email}</p>
              <Badge className="mt-2">
                {profile.role ? profile.role.charAt(0).toUpperCase() + profile.role.slice(1) : 'User'}
              </Badge>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Quick Stats</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Experience</span>
                <span className="font-medium">{profile.experience_years || 0} years</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Skills</span>
                <span className="font-medium">{(workerSkills ?? []).length}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Certifications</span>
                <span className="font-medium">{(certifications ?? []).length}</span>
              </div>
              {profile.average_rating && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Rating</span>
                  <div className="flex items-center">
                    <ReviewStars rating={profile.average_rating} size="sm" />
                    <span className="ml-1 font-medium">{profile.average_rating.toFixed(1)}</span>
                  </div>
                </div>
              )}
              {(profile.review_count ?? 0) > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Reviews</span>
                  <span className="font-medium">{profile.review_count}</span>
                </div>
              )}
              {profile.hourly_rate && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Hourly Rate</span>
                  <span className="font-medium">${profile.hourly_rate}/hr</span>
                </div>
              )}
            </CardContent>
          </Card>
          
          {/* Rating Summary */}
          {profile.role === 'worker' && (profile.review_count ?? 0) > 0 && (
            <Card className="mt-6">
              <CardHeader>
                <CardTitle>Rating Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-center space-x-2">
                  <span className="text-3xl font-bold">{profile.average_rating?.toFixed(1) || '0.0'}</span>
                  <ReviewStars rating={profile.average_rating || 0} size="lg" />
                </div>
                <p className="text-center text-sm text-muted-foreground">
                  Based on {profile.review_count} {profile.review_count === 1 ? 'review' : 'reviews'}
                </p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Basic Information */}
          <Card>
            <CardHeader>
              <CardTitle>Basic Information</CardTitle>
              <CardDescription>
                Update your personal and professional details
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="full_name">Full Name</Label>
                    <Input
                      id="full_name"
                      {...form.register('full_name')}
                    />
                    {form.formState.errors.full_name && (
                      <p className="text-sm text-destructive mt-1">
                        {form.formState.errors.full_name.message}
                      </p>
                    )}
                  </div>

                  <div>
                    <Label htmlFor="username">Username</Label>
                    <Input
                      id="username"
                      {...form.register('username')}
                      placeholder="alexmoreno"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      {profile?.username
                        ? <>Public link: {window.location.origin}/u/{profile.username}</>
                        : 'Sets your public profile link (/u/username)'}
                    </p>
                    {form.formState.errors.username && (
                      <p className="text-sm text-destructive mt-1">
                        {form.formState.errors.username.message}
                      </p>
                    )}
                  </div>

                  <div>
                    <Label htmlFor="phone">Phone</Label>
                    <Input
                      id="phone"
                      type="tel"
                      {...form.register('phone')}
                      placeholder="+1 (555) 123-4567"
                    />
                  </div>

                  <div>
                    <Label htmlFor="location">Location</Label>
                    <Input
                      id="location"
                      {...form.register('location')}
                      placeholder="City, State"
                    />
                  </div>

                  {profile.role === 'worker' && (
                    <div>
                      <Label htmlFor="hourly_rate">Hourly Rate ($)</Label>
                      <Input
                        id="hourly_rate"
                        type="number"
                        step="0.01"
                        {...form.register('hourly_rate')}
                        placeholder="45.00"
                      />
                    </div>
                  )}

                  {profile.role === 'worker' && (
                    <div>
                      <Label htmlFor="experience_years">Years of Experience</Label>
                      <Input
                        id="experience_years"
                        type="number"
                        {...form.register('experience_years')}
                        placeholder="5"
                      />
                    </div>
                  )}
                </div>

                <div>
                  <Label htmlFor="bio">Bio</Label>
                  <Textarea
                    id="bio"
                    rows={4}
                    {...form.register('bio')}
                    placeholder="Tell others about your experience and what makes you unique..."
                  />
                </div>

                {profile.role === 'worker' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="portfolio_url">Portfolio URL</Label>
                      <Input
                        id="portfolio_url"
                        {...form.register('portfolio_url')}
                        placeholder="www.yourportfolio.com"
                      />
                      {form.formState.errors.portfolio_url && (
                        <p className="text-sm text-destructive mt-1">
                          {form.formState.errors.portfolio_url.message}
                        </p>
                      )}
                    </div>

                    <div>
                      <Label htmlFor="linkedin_url">LinkedIn URL</Label>
                      <Input
                        id="linkedin_url"
                        {...form.register('linkedin_url')}
                        placeholder="linkedin.com/in/yourprofile"
                      />
                      {form.formState.errors.linkedin_url && (
                        <p className="text-sm text-destructive mt-1">
                          {form.formState.errors.linkedin_url.message}
                        </p>
                      )}
                    </div>
                  </div>
                )}

                <Button type="submit" disabled={loading}>
                  <Save className="w-4 h-4 mr-2" />
                  {loading ? 'Saving...' : 'Save Changes'}
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* Skills - Only for workers */}
          {profile.role === 'worker' && (
            <Card>
              <CardHeader>
                <div className="flex justify-between items-center">
                  <div>
                    <CardTitle>Skills & Expertise</CardTitle>
                    <CardDescription>
                      Showcase your skills and proficiency levels
                    </CardDescription>
                  </div>
                  <Button size="sm" onClick={() => setShowSkillDialog(true)}>
                    <Plus className="w-4 h-4 mr-2" />
                    Add Skill
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {(workerSkills ?? []).length > 0 ? (
                    <div className="grid grid-cols-1 gap-3">
                      {(workerSkills ?? []).map((workerSkill) => (
                        <div
                          key={workerSkill.id}
                          className="flex items-center justify-between p-3 bg-muted/40 rounded-lg"
                        >
                          <div className="flex items-center space-x-3">
                            <div>
                              <h4 className="font-medium text-sm">
                                {workerSkill.skill?.name}
                              </h4>
                              <div className="flex items-center space-x-2 mt-1">
                                <Badge className={getProficiencyColor(workerSkill.proficiency_level)}>
                                  {getProficiencyLabel(workerSkill.proficiency_level)}
                                </Badge>
                                <span className="text-xs text-muted-foreground">
                                  {workerSkill.years_experience} years
                                </span>
                              </div>
                            </div>
                          </div>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => removeSkill(workerSkill.id)}
                            className="h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-muted-foreground text-center py-8">
                      No skills added yet. Add your first skill to showcase your expertise.
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Certifications - Only for workers */}
          {profile.role === 'worker' && (
            <Card>
              <CardHeader>
                <div className="flex justify-between items-center">
                  <div>
                    <CardTitle>Certifications</CardTitle>
                    <CardDescription>
                      Add your professional certifications and licenses
                    </CardDescription>
                  </div>
                  <Button size="sm" onClick={() => setShowCertDialog(true)}>
                    <Plus className="w-4 w-4 mr-2" />
                    Add Certification
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {(certifications ?? []).length > 0 ? (
                  <div className="space-y-4">
                    {(certifications ?? []).map((cert) => (
                      <div key={cert.id} className="flex items-start justify-between p-4 border rounded-lg">
                        <div className="flex items-start space-x-3 flex-1">
                          <Award className="h-5 w-5 text-primary mt-1" />
                          <div className="flex-1">
                            <h4 className="font-medium flex items-center gap-2">
                              {cert.name}
                              {cert.cert_type_code && (
                                <Badge variant="outline" className="text-[10px]">{cert.cert_type_code}</Badge>
                              )}
                            </h4>
                            {cert.issuing_organization && (
                              <p className="text-sm text-muted-foreground">{cert.issuing_organization}</p>
                            )}
                            <div className="flex items-center space-x-4 mt-2 text-xs text-muted-foreground">
                              {cert.issue_date && (
                                <span>Issued: {new Date(cert.issue_date).getFullYear()}</span>
                              )}
                              {cert.expiration_date && (
                                <span>Expires: {new Date(cert.expiration_date).getFullYear()}</span>
                              )}
                              {cert.credential_url && (
                                <a 
                                  href={cert.credential_url} 
                                  target="_blank" 
                                  rel="noopener noreferrer"
                                  className="flex items-center text-primary hover:text-primary"
                                >
                                  <ExternalLink className="h-3 w-3 mr-1" />
                                  View
                                </a>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Badge
                            variant="outline"
                            className={cert.verified
                              ? 'border-green-300 bg-emerald-500/10 text-emerald-500'
                              : 'border-amber-300 bg-amber-50 text-amber-500'}
                          >
                            {cert.verified ? 'Verified' : 'Pending'}
                          </Badge>
                          {!cert.is_active && <Badge variant="secondary">Inactive</Badge>}
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => editCertification(cert)}
                            className="h-8 w-8 p-0"
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => removeCertification(cert.id)}
                            className="h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground text-center py-8">
                    No certifications added yet. Add your first certification to showcase your expertise.
                  </p>
                )}
              </CardContent>
            </Card>
          )}
          
          {/* Portfolio - Only for workers */}
          {profile.role === 'worker' && (
            <PortfolioSection
              portfolioItems={portfolioItems}
              onAddItem={handleAddPortfolioItem}
              onUpdateItem={handleUpdatePortfolioItem}
              onDeleteItem={handleDeletePortfolioItem}
            />
          )}
          
          {/* Reviews Section - Only for workers */}
          {profile.role === 'worker' && (
            <Card>
              <CardHeader>
                <CardTitle>Reviews</CardTitle>
                <CardDescription>
                  What others are saying about {profile.full_name}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ReviewsList workerId={profile.id} />
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Add Skill Dialog */}
      <Dialog open={showSkillDialog} onOpenChange={setShowSkillDialog}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Add New Skill</DialogTitle>
            <DialogDescription>
              Add a skill to your profile with your proficiency level and experience.
            </DialogDescription>
          </DialogHeader>
          
          <form onSubmit={skillForm.handleSubmit(onAddSkill)} className="space-y-4">
            <div>
              <Label htmlFor="skill_name">Skill Name</Label>
              <Input
                id="skill_name"
                {...skillForm.register('skill_name')}
                placeholder="e.g., Camera Operation, Sound Engineering"
              />
              {skillForm.formState.errors.skill_name && (
                <p className="text-sm text-destructive mt-1">
                  {skillForm.formState.errors.skill_name.message}
                </p>
              )}
            </div>

            <div>
              <Label htmlFor="proficiency_level">Proficiency Level</Label>
              <Select onValueChange={(value) => skillForm.setValue('proficiency_level', parseInt(value))}>
                <SelectTrigger>
                  <SelectValue placeholder="Select proficiency level" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1 - Beginner</SelectItem>
                  <SelectItem value="2">2 - Novice</SelectItem>
                  <SelectItem value="3">3 - Intermediate</SelectItem>
                  <SelectItem value="4">4 - Advanced</SelectItem>
                  <SelectItem value="5">5 - Expert</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="years_experience">Years of Experience</Label>
              <Input
                id="years_experience"
                type="number"
                min="0"
                max="50"
                {...skillForm.register('years_experience', { valueAsNumber: true })}
                placeholder="0"
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowSkillDialog(false)}>
                Cancel
              </Button>
              <Button type="submit">
                Add Skill
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Add/Edit Certification Dialog */}
      <Dialog open={showCertDialog} onOpenChange={(open) => {
        setShowCertDialog(open);
        if (!open) {
          setEditingCert(null);
          certForm.reset();
        }
      }}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>
              {editingCert ? 'Edit Certification' : 'Add New Certification'}
            </DialogTitle>
            <DialogDescription>
              {editingCert ? 'Update your certification details.' : 'Add a professional certification to your profile.'}
            </DialogDescription>
          </DialogHeader>
          
          <form onSubmit={certForm.handleSubmit(onAddCertification)} className="space-y-4">
            <div>
              <Label>Credential type</Label>
              <Select
                value={certForm.watch('cert_type_code') || undefined}
                onValueChange={(value) => {
                  certForm.setValue('cert_type_code', value);
                  const type = certTypes.data.find((t) => t.code === value);
                  if (type) {
                    certForm.setValue('name', type.name);
                    if (type.issuing_body && !certForm.getValues('issuing_organization')) {
                      certForm.setValue('issuing_organization', type.issuing_body);
                    }
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Pick a recognized credential (unlocks gated calls)" />
                </SelectTrigger>
                <SelectContent>
                  {certTypes.data.map((t) => (
                    <SelectItem key={t.code} value={t.code}>{t.name}</SelectItem>
                  ))}
                  <SelectItem value={OTHER_CERT_TYPE}>Other / not in catalog</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">
                Calls that require a credential (e.g. ETCP for rigging) only match certifications linked to a catalog type.
              </p>
            </div>

            <div>
              <Label htmlFor="cert_name">Certification Name</Label>
              <Input
                id="cert_name"
                {...certForm.register('name')}
                placeholder="e.g., Certified Audio Engineer"
              />
              {certForm.formState.errors.name && (
                <p className="text-sm text-destructive mt-1">
                  {certForm.formState.errors.name.message}
                </p>
              )}
            </div>

            <div>
              <Label htmlFor="issuing_organization">Issuing Organization</Label>
              <Input
                id="issuing_organization"
                {...certForm.register('issuing_organization')}
                placeholder="e.g., Audio Engineering Society"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="issue_date">Issue Date</Label>
                <Input
                  id="issue_date"
                  type="date"
                  {...certForm.register('issue_date')}
                />
              </div>

              <div>
                <Label htmlFor="expiration_date">Expiration Date (Optional)</Label>
                <Input
                  id="expiration_date"
                  type="date"
                  {...certForm.register('expiration_date')}
                />
              </div>
            </div>

            <div>
              <Label htmlFor="credential_id">Credential ID (Optional)</Label>
              <Input
                id="credential_id"
                {...certForm.register('credential_id')}
                placeholder="e.g., AES-2023-001"
              />
            </div>

            <div>
              <Label htmlFor="credential_url">Verification URL (Optional)</Label>
              <Input
                id="credential_url"
                {...certForm.register('credential_url')}
                placeholder="e.g., verify.organization.com"
              />
              {certForm.formState.errors.credential_url && (
                <p className="text-sm text-destructive mt-1">
                  {certForm.formState.errors.credential_url.message}
                </p>
              )}
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowCertDialog(false)}>
                Cancel
              </Button>
              <Button type="submit">
                {editingCert ? 'Update Certification' : 'Add Certification'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ProfilePage;