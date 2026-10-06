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
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { Company, Skill } from '@/lib/types';
import { 
  Plus, 
  X, 


  Save,
  ArrowLeft,
  Check,
  ChevronsUpDown,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

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

const companySchema = z.object({
  name: z.string().min(2, 'Company name is required'),
  description: z.string().optional(),
  website_url: z.string().url('Please enter a valid URL').optional().or(z.literal('')),
  contact_email: z.string().email('Please enter a valid email').optional().or(z.literal('')),
  contact_phone: z.string().optional(),
  address: z.string().optional(),
});

type CompanyForm = z.infer<typeof companySchema>;
const CreateGigForm: React.FC = () => {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const [skillSearchTerm, setSkillSearchTerm] = useState('');
  const [openSkillsCombobox, setOpenSkillsCombobox] = useState(false);
  const [equipmentProvided, setEquipmentProvided] = useState<string[]>([]);
  const [newEquipment, setNewEquipment] = useState('');
  const [predefinedEquipment] = useState<string[]>([
    'Camera', 'Lighting Kit', 'Sound System', 'Microphones', 'Tripods',
    'Monitors', 'Cables', 'Headphones', 'Batteries', 'Memory Cards',
    'Laptop', 'Software Licenses', 'Drone', 'Stabilizer', 'Green Screen'
  ]);
  const [openCompanyCombobox, setOpenCompanyCombobox] = useState(false);
  const [companySearchTerm, setCompanySearchTerm] = useState('');
  const [showAddCompanyDialog, setShowAddCompanyDialog] = useState(false);
  const [showAddSkillDialog, setShowAddSkillDialog] = useState(false);
  const [newSkillName, setNewSkillName] = useState('');
  const [newSkillCategory, setNewSkillCategory] = useState('');

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
  
  const companyForm = useForm<CompanyForm>({
    resolver: zodResolver(companySchema),
    defaultValues: {
      name: '',
      description: '',
      website_url: '',
      contact_email: '',
      contact_phone: '',
      address: '',
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

  const addSkill = (skillName: string, fromDropdown = true) => {
    if (!skillName.trim()) return;
    
    if (!selectedSkills.includes(skillName)) {
      setSelectedSkills([...selectedSkills, skillName]);
      
      // If this is a new skill (not from dropdown), show dialog to add details
      if (!fromDropdown && !skills.some(s => s.name.toLowerCase() === skillName.toLowerCase())) {
        setNewSkillName(skillName);
        setShowAddSkillDialog(true);
      }
    }
    
    // Clear search term after adding
    setSkillSearchTerm('');
    setOpenSkillsCombobox(false);
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
  
  const addPredefinedEquipment = (equipment: string) => {
    if (!equipmentProvided.includes(equipment)) {
      setEquipmentProvided([...equipmentProvided, equipment]);
    }
  };

  const removeEquipment = (equipment: string) => {
    setEquipmentProvided(equipmentProvided.filter(item => item !== equipment));
  };
  
  const handleAddCompany = async () => {
    try {
      const formData = companyForm.getValues();
      
      if (!formData.name) {
        toast.error('Company name is required');
        return;
      }
      
      setLoading(true);
      
      const companyData = {
        name: formData.name,
        description: formData.description || null,
        website_url: formData.website_url || null,
        contact_email: formData.contact_email || null,
        contact_phone: formData.contact_phone || null,
        address: formData.address || null,
        created_by: profile?.id,
      };
      
      const { data: newCompany, error } = await supabase
        .from('companies')
        .insert(companyData)
        .select()
        .single();
      
      if (error) throw error;
      
      // Add the new company to the list and select it
      setCompanies(prev => [...prev, newCompany]);
      form.setValue('company_id', newCompany.id);
      
      // Close dialog and reset form
      setShowAddCompanyDialog(false);
      companyForm.reset();
      
      toast.success('Company added successfully!');
    } catch (error) {
      console.error('Error adding company:', error);
      toast.error((error as Error).message || 'Failed to add company');
    } finally {
      setLoading(false);
    }
  };
  
  const handleAddNewSkill = async () => {
    try {
      if (!newSkillName.trim()) {
        toast.error('Skill name is required');
        return;
      }
      
      setLoading(true);
      
      const skillData = {
        name: newSkillName,
        category: newSkillCategory || null,
        description: null,
      };
      
      const { data: newSkill, error } = await supabase
        .from('skills')
        .insert(skillData)
        .select()
        .single();
      
      if (error) throw error;
      
      // Add the new skill to the list
      setSkills(prev => [...prev, newSkill]);
      
      // Close dialog and reset form
      setShowAddSkillDialog(false);
      setNewSkillName('');
      setNewSkillCategory('');
      
      toast.success('Skill added successfully!');
    } catch (error) {
      console.error('Error adding skill:', error);
      toast.error((error as Error).message || 'Failed to add skill');
    } finally {
      setLoading(false);
    }
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
    } catch (error) {
      console.error('Error creating gig:', error);
      toast.error((error as Error).message || 'Failed to create gig');
    } finally {
      setLoading(false);
    }
  };

  if (!profile || profile.role !== 'company') {
    return (
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Card>
          <CardContent className="text-center py-12">
            <h3 className="text-lg font-medium text-foreground mb-2">Access Denied</h3>
            <p className="text-muted-foreground mb-4">
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
  
  // Filter skills based on search term
  const filteredSkills = skills.filter(skill => 
    skill.name.toLowerCase().includes(skillSearchTerm.toLowerCase())
  );
  
  // Filter companies based on search term
  const filteredCompanies = companies.filter(company => 
    company.name.toLowerCase().includes(companySearchTerm.toLowerCase())
  );

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
          <h1 className="text-3xl font-bold text-foreground">Create New Gig</h1>
          <p className="text-muted-foreground mt-2">
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
                <p className="text-sm text-destructive dark:text-red-400 mt-1">
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
                <p className="text-sm text-destructive dark:text-red-400 mt-1">
                  {form.formState.errors.description.message}
                </p>
              )}
            </div>

            <div>
              <Label htmlFor="company_id">Company</Label>
              <div className="relative mt-1">
                <Popover open={openCompanyCombobox} onOpenChange={setOpenCompanyCombobox}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={openCompanyCombobox}
                      className="w-full justify-between"
                    >
                      {form.watch('company_id')
                        ? companies.find((company) => company.id === form.watch('company_id'))?.name
                        : "Select a company"}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-full p-0">
                    <Command>
                      <CommandInput 
                        placeholder="Search companies..." 
                        value={companySearchTerm}
                        onValueChange={setCompanySearchTerm}
                      />
                      <CommandEmpty>
                        <div className="py-6 text-center text-sm">
                          <p>No company found.</p>
                          <Button 
                            variant="link" 
                            className="mt-2"
                            onClick={() => {
                              setShowAddCompanyDialog(true);
                              setOpenCompanyCombobox(false);
                              companyForm.setValue('name', companySearchTerm);
                            }}
                          >
                            <Plus className="h-4 w-4 mr-1" />
                            Add "{companySearchTerm}"
                          </Button>
                        </div>
                      </CommandEmpty>
                      <CommandGroup>
                        {filteredCompanies.map((company) => (
                          <CommandItem
                            key={company.id}
                            value={company.id}
                            onSelect={(value) => {
                              form.setValue('company_id', value);
                              setOpenCompanyCombobox(false);
                            }}
                          >
                            <Check
                              className={cn(
                                "mr-2 h-4 w-4",
                                form.watch('company_id') === company.id ? "opacity-100" : "opacity-0"
                              )}
                            />
                            {company.name}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                      <div className="p-2 border-t">
                        <Button 
                          variant="outline" 
                          className="w-full"
                          onClick={() => {
                            setShowAddCompanyDialog(true);
                            setOpenCompanyCombobox(false);
                          }}
                        >
                          <Plus className="h-4 w-4 mr-2" />
                          Add New Company
                        </Button>
                      </div>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
              {form.formState.errors.company_id && (
                <p className="text-sm text-destructive dark:text-red-400 mt-1">
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
                  <p className="text-sm text-destructive dark:text-red-400 mt-1">
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
                  <p className="text-sm text-destructive dark:text-red-400 mt-1">
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
                  <p className="text-sm text-destructive dark:text-red-400 mt-1">
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
                  <p className="text-sm text-destructive dark:text-red-400 mt-1">
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
              <div className="relative mt-2">
                <Popover open={openSkillsCombobox} onOpenChange={setOpenSkillsCombobox}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={openSkillsCombobox}
                      className="w-full justify-between"
                    >
                      {skillSearchTerm || "Search or add skills..."}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-full p-0">
                    <Command>
                      <CommandInput 
                        placeholder="Search skills..."
                        value={skillSearchTerm}
                        onValueChange={setSkillSearchTerm}
                      />
                      <CommandEmpty>
                        <div className="py-6 text-center text-sm">
                          <p>No skill found.</p>
                          <Button 
                            variant="link" 
                            className="mt-2"
                            onClick={() => {
                              if (skillSearchTerm.trim()) {
                                addSkill(skillSearchTerm, false);
                              }
                            }}
                          >
                            <Plus className="h-4 w-4 mr-1" />
                            Add "{skillSearchTerm}"
                          </Button>
                        </div>
                      </CommandEmpty>
                      <CommandGroup>
                        {filteredSkills
                          .filter(skill => !selectedSkills.includes(skill.name))
                          .map((skill) => (
                            <CommandItem
                              key={skill.id}
                              value={skill.name}
                              onSelect={(value) => {
                                addSkill(value, true);
                              }}
                            >
                              {skill.name}
                              {skill.category && (
                                <span className="ml-2 text-xs text-muted-foreground">
                                  {skill.category}
                                </span>
                              )}
                            </CommandItem>
                          ))}
                      </CommandGroup>
                      {skillSearchTerm && !filteredSkills.some(s => s.name.toLowerCase() === skillSearchTerm.toLowerCase()) && (
                        <div className="p-2 border-t">
                          <Button 
                            variant="outline" 
                            className="w-full"
                            onClick={() => {
                              addSkill(skillSearchTerm, false);
                            }}
                          >
                            <Plus className="h-4 w-4 mr-2" />
                            Add "{skillSearchTerm}" as new skill
                          </Button>
                        </div>
                      )}
                    </Command>
                  </PopoverContent>
                </Popover>
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
              <div className="mt-2 mb-3">
                <Label className="text-sm text-muted-foreground mb-2">Select from common equipment:</Label>
                <div className="flex flex-wrap gap-2 mt-1">
                  {predefinedEquipment.map((equipment) => (
                    <Button
                      key={equipment}
                      type="button"
                      variant={equipmentProvided.includes(equipment) ? "default" : "outline"}
                      size="sm"
                      onClick={() => addPredefinedEquipment(equipment)}
                      className="text-xs"
                    >
                      {equipment}
                    </Button>
                  ))}
                </div>
              </div>
              <Label className="text-sm text-muted-foreground">Or add custom equipment:</Label>
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
      {/* Add Company Dialog */}
      <Dialog open={showAddCompanyDialog} onOpenChange={setShowAddCompanyDialog}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Add New Company</DialogTitle>
            <DialogDescription>
              Create a new company to associate with your gig
            </DialogDescription>
          </DialogHeader>
          
          <form onSubmit={companyForm.handleSubmit(handleAddCompany)} className="space-y-4">
            <div>
              <Label htmlFor="company_name">Company Name*</Label>
              <Input
                id="company_name"
                {...companyForm.register('name')}
                placeholder="Enter company name"
              />
              {companyForm.formState.errors.name && (
                <p className="text-sm text-destructive dark:text-red-400 mt-1">
                  {companyForm.formState.errors.name.message}
                </p>
              )}
            </div>
            
            <div>
              <Label htmlFor="company_description">Description</Label>
              <Textarea
                id="company_description"
                {...companyForm.register('description')}
                placeholder="Brief description of the company"
                rows={3}
              />
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="company_website">Website</Label>
                <Input
                  id="company_website"
                  {...companyForm.register('website_url')}
                  placeholder="https://example.com"
                />
                {companyForm.formState.errors.website_url && (
                  <p className="text-sm text-destructive dark:text-red-400 mt-1">
                    {companyForm.formState.errors.website_url.message}
                  </p>
                )}
              </div>
              
              <div>
                <Label htmlFor="company_email">Contact Email</Label>
                <Input
                  id="company_email"
                  type="email"
                  {...companyForm.register('contact_email')}
                  placeholder="contact@example.com"
                />
                {companyForm.formState.errors.contact_email && (
                  <p className="text-sm text-destructive dark:text-red-400 mt-1">
                    {companyForm.formState.errors.contact_email.message}
                  </p>
                )}
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="company_phone">Contact Phone</Label>
                <Input
                  id="company_phone"
                  {...companyForm.register('contact_phone')}
                  placeholder="+1 (555) 123-4567"
                />
              </div>
              
              <div>
                <Label htmlFor="company_address">Address</Label>
                <Input
                  id="company_address"
                  {...companyForm.register('address')}
                  placeholder="123 Main St, City, State"
                />
              </div>
            </div>
            
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowAddCompanyDialog(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? 'Adding...' : 'Add Company'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      
      {/* Add Skill Dialog */}
      <Dialog open={showAddSkillDialog} onOpenChange={setShowAddSkillDialog}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Add New Skill</DialogTitle>
            <DialogDescription>
              Add details for the new skill to be added to the platform
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <Label htmlFor="skill_name">Skill Name*</Label>
              <Input
                id="skill_name"
                value={newSkillName}
                onChange={(e) => setNewSkillName(e.target.value)}
                placeholder="Enter skill name"
              />
            </div>
            
            <div>
              <Label htmlFor="skill_category">Category</Label>
              <Select value={newSkillCategory} onValueChange={setNewSkillCategory}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Technical">Technical</SelectItem>
                  <SelectItem value="Creative">Creative</SelectItem>
                  <SelectItem value="Management">Management</SelectItem>
                  <SelectItem value="Post-Production">Post-Production</SelectItem>
                  <SelectItem value="Safety">Safety</SelectItem>
                  <SelectItem value="Support">Support</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setShowAddSkillDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddNewSkill} disabled={loading}>
              {loading ? 'Adding...' : 'Add Skill'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CreateGigForm;