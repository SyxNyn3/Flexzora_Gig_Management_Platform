import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { Skill, WorkerSkill, Certification } from '@/lib/types';
import { 
  User, 
  MapPin, 
  Phone, 
  Mail, 
  DollarSign,
  Star,
  Plus,
  X,
  Camera,
  Save,
  Award,
  Briefcase,
  Edit,
  Trash2,
  ExternalLink
} from 'lucide-react';
import { toast } from 'sonner';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

const profileSchema = z.object({
  full_name: z.string().min(2, 'Name must be at least 2 characters'),
  phone: z.string().optional(),
  location: z.string().optional(),
  bio: z.string().optional(),
  hourly_rate: z.string().optional(),
  experience_years: z.string().optional(),
  portfolio_url: z.string().optional().refine((val) => {
    if (!val) return true;
    // Allow URLs with or without protocol
    const urlPattern = /^(https?:\/\/)?([\da-z\.-]+)\.([a-z\.]{2,6})([\/\w \.-]*)*\/?$/;
    return urlPattern.test(val);
  }, 'Please enter a valid URL'),
  linkedin_url: z.string().optional().refine((val) => {
    if (!val) return true;
    const urlPattern = /^(https?:\/\/)?([\da-z\.-]+)\.([a-z\.]{2,6})([\/\w \.-]*)*\/?$/;
    return urlPattern.test(val);
  }, 'Please enter a valid URL'),
});

const skillSchema = z.object({
  skill_name: z.string().min(1, 'Skill name is required'),
  proficiency_level: z.number().min(1).max(5),
  years_experience: z.number().min(0).max(50),
});

const certificationSchema = z.object({
  name: z.string().min(2, 'Certification name is required'),
  issuing_organization: z.string().optional(),
  issue_date: z.string().optional(),
  expiration_date: z.string().optional(),
  credential_id: z.string().optional(),
  credential_url: z.string().optional().refine((val) => {
    if (!val) return true;
    const urlPattern = /^(https?:\/\/)?([\da-z\.-]+)\.([a-z\.]{2,6})([\/\w \.-]*)*\/?$/;
    return urlPattern.test(val);
  }, 'Please enter a valid URL'),
});

type ProfileForm = z.infer<typeof profileSchema>;
type SkillForm = z.infer<typeof skillSchema>;
type CertificationForm = z.infer<typeof certificationSchema>;

// Mock data for demo mode
const mockSkills = [
  { id: '1', name: 'Camera Operation', category: 'Technical' },
  { id: '2', name: 'Lighting Design', category: 'Technical' },
  { id: '3', name: 'Sound Engineering', category: 'Technical' },
  { id: '4', name: 'Video Editing', category: 'Post-Production' },
  { id: '5', name: 'Event Coordination', category: 'Management' },
  { id: '6', name: 'Stage Management', category: 'Management' },
  { id: '7', name: 'Live Streaming', category: 'Technical' },
  { id: '8', name: 'Photography', category: 'Creative' },
];

const ProfilePage: React.FC = () => {
  const { profile, updateProfile } = useAuth();
  const [loading, setLoading] = useState(false);
  const [skills, setSkills] = useState<Skill[]>(mockSkills);
  const [workerSkills, setWorkerSkills] = useState<WorkerSkill[]>([]);
  const [certifications, setCertifications] = useState<Certification[]>([]);
  const [showSkillDialog, setShowSkillDialog] = useState(false);
  const [showCertDialog, setShowCertDialog] = useState(false);
  const [editingCert, setEditingCert] = useState<Certification | null>(null);

  const form = useForm<ProfileForm>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      full_name: profile?.full_name || '',
      phone: profile?.phone || '',
      location: profile?.location || '',
      bio: profile?.bio || '',
      hourly_rate: profile?.hourly_rate?.toString() || '',
      experience_years: profile?.experience_years?.toString() || '',
      portfolio_url: profile?.portfolio_url || '',
      linkedin_url: profile?.linkedin_url || '',
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

  useEffect(() => {
    if (profile) {
      loadMockData();
    }
  }, [profile]);

  const loadMockData = () => {
    // Load mock worker skills
    const mockWorkerSkills = [
      {
        id: '1',
        worker_id: profile?.id || 'demo',
        skill_id: '1',
        proficiency_level: 4,
        years_experience: 5,
        created_at: new Date().toISOString(),
        skill: { id: '1', name: 'Camera Operation', category: 'Technical', created_at: new Date().toISOString() }
      },
      {
        id: '2',
        worker_id: profile?.id || 'demo',
        skill_id: '2',
        proficiency_level: 3,
        years_experience: 3,
        created_at: new Date().toISOString(),
        skill: { id: '2', name: 'Lighting Design', category: 'Technical', created_at: new Date().toISOString() }
      }
    ];

    // Load mock certifications
    const mockCertifications = [
      {
        id: '1',
        worker_id: profile?.id || 'demo',
        name: 'Certified Audio Engineer',
        issuing_organization: 'Audio Engineering Society',
        issue_date: '2023-06-15',
        expiration_date: '2026-06-15',
        credential_id: 'AES-2023-001',
        credential_url: 'aes.org/verify',
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        id: '2',
        worker_id: profile?.id || 'demo',
        name: 'Professional Lighting Technician',
        issuing_organization: 'International Association of Lighting Designers',
        issue_date: '2022-03-20',
        expiration_date: '',
        credential_id: 'IALD-PLT-2022',
        credential_url: '',
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
    ];

    setWorkerSkills(mockWorkerSkills);
    setCertifications(mockCertifications);
  };

  const normalizeUrl = (url: string): string => {
    if (!url) return '';
    if (url.startsWith('http://') || url.startsWith('https://')) {
      return url;
    }
    return `https://${url}`;
  };

  const onSubmit = async (data: ProfileForm) => {
    setLoading(true);
    try {
      const updates = {
        ...data,
        hourly_rate: data.hourly_rate ? parseFloat(data.hourly_rate) : null,
        experience_years: data.experience_years ? parseInt(data.experience_years) : 0,
        portfolio_url: data.portfolio_url ? normalizeUrl(data.portfolio_url) : null,
        linkedin_url: data.linkedin_url ? normalizeUrl(data.linkedin_url) : null,
      };

      // In demo mode, just update local state
      if (!import.meta.env.VITE_SUPABASE_URL) {
        // Simulate API call
        await new Promise(resolve => setTimeout(resolve, 1000));
        toast.success('Profile updated successfully! (Demo Mode)');
        return;
      }

      const { error } = await updateProfile(updates);
      if (error) throw error;

      toast.success('Profile updated successfully!');
    } catch (error: any) {
      console.error('Error updating profile:', error);
      toast.error(error.message || 'Failed to update profile');
    } finally {
      setLoading(false);
    }
  };

  const onAddSkill = async (data: SkillForm) => {
    try {
      // Check if skill already exists
      const existingSkill = workerSkills.find(ws => 
        ws.skill?.name.toLowerCase() === data.skill_name.toLowerCase()
      );

      if (existingSkill) {
        toast.error('You already have this skill added');
        return;
      }

      // In demo mode, add to local state
      const newWorkerSkill: WorkerSkill = {
        id: Date.now().toString(),
        worker_id: profile?.id || 'demo',
        skill_id: Date.now().toString(),
        proficiency_level: data.proficiency_level,
        years_experience: data.years_experience,
        created_at: new Date().toISOString(),
        skill: {
          id: Date.now().toString(),
          name: data.skill_name,
          category: 'Custom',
          created_at: new Date().toISOString(),
        }
      };

      setWorkerSkills(prev => [...prev, newWorkerSkill]);
      setShowSkillDialog(false);
      skillForm.reset();
      toast.success('Skill added successfully!');
    } catch (error: any) {
      console.error('Error adding skill:', error);
      toast.error(error.message || 'Failed to add skill');
    }
  };

  const removeSkill = async (workerSkillId: string) => {
    try {
      setWorkerSkills(prev => prev.filter(ws => ws.id !== workerSkillId));
      toast.success('Skill removed successfully!');
    } catch (error: any) {
      console.error('Error removing skill:', error);
      toast.error(error.message || 'Failed to remove skill');
    }
  };

  const onAddCertification = async (data: CertificationForm) => {
    try {
      const newCert: Certification = {
        id: editingCert?.id || Date.now().toString(),
        worker_id: profile?.id || 'demo',
        name: data.name,
        issuing_organization: data.issuing_organization || undefined,
        issue_date: data.issue_date || undefined,
        expiration_date: data.expiration_date || undefined,
        credential_id: data.credential_id || undefined,
        credential_url: data.credential_url ? normalizeUrl(data.credential_url) : undefined,
        is_active: true,
        created_at: editingCert?.created_at || new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      if (editingCert) {
        setCertifications(prev => prev.map(cert => 
          cert.id === editingCert.id ? newCert : cert
        ));
        toast.success('Certification updated successfully!');
      } else {
        setCertifications(prev => [...prev, newCert]);
        toast.success('Certification added successfully!');
      }

      setShowCertDialog(false);
      setEditingCert(null);
      certForm.reset();
    } catch (error: any) {
      console.error('Error saving certification:', error);
      toast.error(error.message || 'Failed to save certification');
    }
  };

  const removeCertification = async (certId: string) => {
    try {
      setCertifications(prev => prev.filter(cert => cert.id !== certId));
      toast.success('Certification removed successfully!');
    } catch (error: any) {
      console.error('Error removing certification:', error);
      toast.error(error.message || 'Failed to remove certification');
    }
  };

  const editCertification = (cert: Certification) => {
    setEditingCert(cert);
    certForm.reset({
      name: cert.name,
      issuing_organization: cert.issuing_organization || '',
      issue_date: cert.issue_date || '',
      expiration_date: cert.expiration_date || '',
      credential_id: cert.credential_id || '',
      credential_url: cert.credential_url?.replace(/^https?:\/\//, '') || '',
    });
    setShowCertDialog(true);
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
      case 1: return 'bg-red-100 text-red-800';
      case 2: return 'bg-orange-100 text-orange-800';
      case 3: return 'bg-yellow-100 text-yellow-800';
      case 4: return 'bg-blue-100 text-blue-800';
      case 5: return 'bg-green-100 text-green-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  if (!profile) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Profile Settings</h1>
        <p className="text-gray-600 mt-2">
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
              <p className="text-sm text-gray-600">{profile.email}</p>
              <Badge className="mt-2">
                {profile.role.charAt(0).toUpperCase() + profile.role.slice(1)}
              </Badge>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Quick Stats</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Experience</span>
                <span className="font-medium">{profile.experience_years || 0} years</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Skills</span>
                <span className="font-medium">{workerSkills.length}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Certifications</span>
                <span className="font-medium">{certifications.length}</span>
              </div>
              {profile.hourly_rate && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Hourly Rate</span>
                  <span className="font-medium">${profile.hourly_rate}/hr</span>
                </div>
              )}
            </CardContent>
          </Card>
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
                      <p className="text-sm text-red-600 mt-1">
                        {form.formState.errors.full_name.message}
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

                  <div>
                    <Label htmlFor="experience_years">Years of Experience</Label>
                    <Input
                      id="experience_years"
                      type="number"
                      {...form.register('experience_years')}
                      placeholder="5"
                    />
                  </div>
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

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="portfolio_url">Portfolio URL</Label>
                    <Input
                      id="portfolio_url"
                      {...form.register('portfolio_url')}
                      placeholder="www.yourportfolio.com"
                    />
                    {form.formState.errors.portfolio_url && (
                      <p className="text-sm text-red-600 mt-1">
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
                      <p className="text-sm text-red-600 mt-1">
                        {form.formState.errors.linkedin_url.message}
                      </p>
                    )}
                  </div>
                </div>

                <Button type="submit" disabled={loading}>
                  <Save className="w-4 h-4 mr-2" />
                  {loading ? 'Saving...' : 'Save Changes'}
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* Skills */}
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
                {workerSkills.length > 0 ? (
                  <div className="grid grid-cols-1 gap-3">
                    {workerSkills.map((workerSkill) => (
                      <div
                        key={workerSkill.id}
                        className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
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
                              <span className="text-xs text-gray-500">
                                {workerSkill.years_experience} years
                              </span>
                            </div>
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => removeSkill(workerSkill.id)}
                          className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-500 text-center py-8">
                    No skills added yet. Add your first skill to showcase your expertise.
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Certifications */}
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
              {certifications.length > 0 ? (
                <div className="space-y-4">
                  {certifications.map((cert) => (
                    <div key={cert.id} className="flex items-start justify-between p-4 border rounded-lg">
                      <div className="flex items-start space-x-3 flex-1">
                        <Award className="h-5 w-5 text-blue-600 mt-1" />
                        <div className="flex-1">
                          <h4 className="font-medium">{cert.name}</h4>
                          {cert.issuing_organization && (
                            <p className="text-sm text-gray-600">{cert.issuing_organization}</p>
                          )}
                          <div className="flex items-center space-x-4 mt-2 text-xs text-gray-500">
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
                                className="flex items-center text-blue-600 hover:text-blue-700"
                              >
                                <ExternalLink className="h-3 w-3 mr-1" />
                                View
                              </a>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Badge variant={cert.is_active ? "default" : "secondary"}>
                          {cert.is_active ? 'Active' : 'Inactive'}
                        </Badge>
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
                          className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500 text-center py-8">
                  No certifications added yet. Add your first certification to showcase your expertise.
                </p>
              )}
            </CardContent>
          </Card>
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
                <p className="text-sm text-red-600 mt-1">
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
              <Label htmlFor="cert_name">Certification Name</Label>
              <Input
                id="cert_name"
                {...certForm.register('name')}
                placeholder="e.g., Certified Audio Engineer"
              />
              {certForm.formState.errors.name && (
                <p className="text-sm text-red-600 mt-1">
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
                <p className="text-sm text-red-600 mt-1">
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