import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { Company, Skill } from '@/lib/types';
import { 
  Plus, 
  X, 
  Calendar, 
  MapPin, 
  DollarSign,
  Users,
  Save,
  ArrowLeft
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

const gigSchema = z.object({
  title: z.string().min(5, 'Title must be at least 5 characters'),
  description: z.string().min(20, 'Description must be at least 20 characters'),
  company_id: z.string().min(1, 'Please select a company'),
  location: z.string().min(3, 'Location is required'),
  start_date: z.string().min(1, 'Start date is required'),
  end_date: z.string().min(1, 'End date is required'),
  hourly_rate: z.string().optional(),
  total_budget: z.string().optional(),
  required_workers: z.string().min(1, 'Number of workers is required'),
  special_requirements: z.string().optional(),
  is_remote: z.boolean().default(false),
});

type GigForm = z.infer<typeof gigSchema>;

const CreateGigForm: React.FC = () => {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const [equipmentProvided, setEquipmentProvided] = useState<string[]>([]);
  const [newEquipment, setNewEquipment] = useState('');

  const form = useForm<GigForm>({
    resolver: zodResolver(gigSchema),
    defaultValues: {
      title: '',
      description: '',
      company_id: '',
      location: '',
      start_date: '',
      end_date: '',
      hourly_rate: '',
      total_budget: '',
      required_workers: '1',
      special_requirements: '',
      is_remote: false,
    },
  });

  useEffect(() => {
    fetchCompanies();
    fetchSkills();
  }, []);

  const fetchCompanies = async () => {
    try {
      const { data, error } = await supabase
        .from('companies')
        .select('*')
        .order('name');

      if (error) throw error;
      setCompanies(data || []);
    } catch (error) {
      console.error('Error fetching companies:', error);
    }
  };

  const fetchSkills = async () => {
    try {
      const { data, error } = await supabase
        .from('skills')
        .select('*')
        .order('name');

      if (error) throw error;
      setSkills(data || []);
    } catch (error) {
      console.error('Error fetching skills:', error);
    }
  };

  const addSkill = (skillName: string) => {
    if (skillName && !selectedSkills.includes(skillName)) {
      setSelectedSkills([...selectedSkills, skillName]);
    }
  };

  const removeSkill = (skillName: string) => {
    setSelectedSkills(selectedSkills.filter(skill => skill !== skillName));
  };

  const addEquipment = () => {
    if (newEquipment.trim() && !equipmentProvided.includes(newEquipment.trim())) {
      setEquipmentProvided([...equipmentProvided, newEquipment.trim()]);
      setNewEquipment('');
    }
  };

  const removeEquipment = (equipment: string) => {
    setEquipmentProvided(equipmentProvided.filter(item => item !== equipment));
  };

  const onSubmit = async (data: GigForm) => {
    if (!profile) return;

    setLoading(true);
    try {
      const gigData = {
        title: data.title,
        description: data.description,
        company_id: data.company_id,
        created_by: profile.id,
        location: data.location,
        start_date: new Date(data.start_date).toISOString(),
        end_date: new Date(data.end_date).toISOString(),
        hourly_rate: data.hourly_rate ? parseFloat(data.hourly_rate) : null,
        total_budget: data.total_budget ? parseFloat(data.total_budget) : null,
        required_workers: parseInt(data.required_workers),
        skills_required: selectedSkills.length > 0 ? selectedSkills : null,
        equipment_provided: equipmentProvided.length > 0 ? equipmentProvided : null,
        special_requirements: data.special_requirements || null,
        is_remote: data.is_remote,
        status: 'draft',
      };

      const { data: newGig, error } = await supabase
        .from('gigs')
        .insert(gigData)
        .select()
        .single();

      if (error) throw error;

      toast.success('Gig created successfully!');
      navigate(`/gigs/${newGig.id}`);
    } catch (error: any) {
      console.error('Error creating gig:', error);
      toast.error(error.message || 'Failed to create gig');
    } finally {
      setLoading(false);
    }
  };

  if (!profile || profile.role !== 'company') {
    return (
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Card>
          <CardContent className="text-center py-12">
            <h3 className="text-lg font-medium text-gray-900 mb-2">Access Denied</h3>
            <p className="text-gray-600 mb-4">
              Only company accounts can create gigs.
            </p>
            <Button onClick={() => navigate('/gigs')}>
              Back to Gigs
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-8 flex items-center">
        <Button
          variant="ghost"
          onClick={() => navigate('/gigs')}
          className="mr-4"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Create New Gig</h1>
          <p className="text-gray-600 mt-2">
            Post a new gig opportunity for workers
          </p>
        </div>
      </div>

      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
        {/* Basic Information */}
        <Card>
          <CardHeader>
            <CardTitle>Basic Information</CardTitle>
            <CardDescription>
              Provide the essential details about your gig
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <Label htmlFor="title">Gig Title</Label>
              <Input
                id="title"
                {...form.register('title')}
                placeholder="e.g., Camera Operator for Corporate Event"
              />
              {form.formState.errors.title && (
                <p className="text-sm text-red-600 mt-1">
                  {form.formState.errors.title.message}
                </p>
              )}
            </div>

            <div>
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                rows={4}
                {...form.register('description')}
                placeholder="Describe the gig, responsibilities, and what you're looking for..."
              />
              {form.formState.errors.description && (
                <p className="text-sm text-red-600 mt-1">
                  {form.formState.errors.description.message}
                </p>
              )}
            </div>

            <div>
              <Label htmlFor="company_id">Company</Label>
              <Select onValueChange={(value) => form.setValue('company_id', value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a company" />
                </SelectTrigger>
                <SelectContent>
                  {companies.map((company) => (
                    <SelectItem key={company.id} value={company.id}>
                      {company.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {form.formState.errors.company_id && (
                <p className="text-sm text-red-600 mt-1">
                  {form.formState.errors.company_id.message}
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Location & Schedule */}
        <Card>
          <CardHeader>
            <CardTitle>Location & Schedule</CardTitle>
            <CardDescription>
              When and where will this gig take place?
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="location">Location</Label>
                <Input
                  id="location"
                  {...form.register('location')}
                  placeholder="City, State or Full Address"
                />
                {form.formState.errors.location && (
                  <p className="text-sm text-red-600 mt-1">
                    {form.formState.errors.location.message}
                  </p>
                )}
              </div>

              <div className="flex items-center space-x-2">
                <Switch
                  id="is_remote"
                  checked={form.watch('is_remote')}
                  onCheckedChange={(checked) => form.setValue('is_remote', checked)}
                />
                <Label htmlFor="is_remote">Remote Work Available</Label>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="start_date">Start Date & Time</Label>
                <Input
                  id="start_date"
                  type="datetime-local"
                  {...form.register('start_date')}
                />
                {form.formState.errors.start_date && (
                  <p className="text-sm text-red-600 mt-1">
                    {form.formState.errors.start_date.message}
                  </p>
                )}
              </div>

              <div>
                <Label htmlFor="end_date">End Date & Time</Label>
                <Input
                  id="end_date"
                  type="datetime-local"
                  {...form.register('end_date')}
                />
                {form.formState.errors.end_date && (
                  <p className="text-sm text-red-600 mt-1">
                    {form.formState.errors.end_date.message}
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Compensation & Team */}
        <Card>
          <CardHeader>
            <CardTitle>Compensation & Team Size</CardTitle>
            <CardDescription>
              Set the payment details and team requirements
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label htmlFor="hourly_rate">Hourly Rate ($)</Label>
                <Input
                  id="hourly_rate"
                  type="number"
                  step="0.01"
                  {...form.register('hourly_rate')}
                  placeholder="25.00"
                />
              </div>

              <div>
                <Label htmlFor="total_budget">Total Budget ($)</Label>
                <Input
                  id="total_budget"
                  type="number"
                  step="0.01"
                  {...form.register('total_budget')}
                  placeholder="500.00"
                />
              </div>

              <div>
                <Label htmlFor="required_workers">Workers Needed</Label>
                <Input
                  id="required_workers"
                  type="number"
                  min="1"
                  {...form.register('required_workers')}
                />
                {form.formState.errors.required_workers && (
                  <p className="text-sm text-red-600 mt-1">
                    {form.formState.errors.required_workers.message}
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Skills & Equipment */}
        <Card>
          <CardHeader>
            <CardTitle>Skills & Equipment</CardTitle>
            <CardDescription>
              Specify required skills and equipment you'll provide
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Skills Required */}
            <div>
              <Label>Skills Required</Label>
              <div className="mt-2">
                <Select onValueChange={addSkill}>
                  <SelectTrigger>
                    <SelectValue placeholder="Add required skills" />
                  </SelectTrigger>
                  <SelectContent>
                    {skills
                      .filter(skill => !selectedSkills.includes(skill.name))
                      .map((skill) => (
                        <SelectItem key={skill.id} value={skill.name}>
                          {skill.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              {selectedSkills.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-3">
                  {selectedSkills.map((skill) => (
                    <Badge key={skill} variant="secondary" className="flex items-center gap-1">
                      {skill}
                      <X 
                        className="h-3 w-3 cursor-pointer" 
                        onClick={() => removeSkill(skill)}
                      />
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            {/* Equipment Provided */}
            <div>
              <Label>Equipment Provided</Label>
              <div className="flex gap-2 mt-2">
                <Input
                  value={newEquipment}
                  onChange={(e) => setNewEquipment(e.target.value)}
                  placeholder="e.g., Camera, Lighting Kit"
                  onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addEquipment())}
                />
                <Button type="button" onClick={addEquipment} size="sm">
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              {equipmentProvided.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-3">
                  {equipmentProvided.map((equipment) => (
                    <Badge key={equipment} variant="outline" className="flex items-center gap-1">
                      {equipment}
                      <X 
                        className="h-3 w-3 cursor-pointer" 
                        onClick={() => removeEquipment(equipment)}
                      />
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Special Requirements */}
        <Card>
          <CardHeader>
            <CardTitle>Additional Details</CardTitle>
            <CardDescription>
              Any special requirements or additional information
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div>
              <Label htmlFor="special_requirements">Special Requirements</Label>
              <Textarea
                id="special_requirements"
                rows={3}
                {...form.register('special_requirements')}
                placeholder="Any special requirements, dress code, certifications needed, etc."
              />
            </div>
          </CardContent>
        </Card>

        {/* Submit */}
        <div className="flex justify-end space-x-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate('/gigs')}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={loading}>
            <Save className="h-4 w-4 mr-2" />
            {loading ? 'Creating...' : 'Create Gig'}
          </Button>
        </div>
      </form>
    </div>
  );
};

export default CreateGigForm;