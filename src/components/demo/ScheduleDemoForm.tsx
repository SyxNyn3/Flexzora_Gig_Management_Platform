import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { supabase } from '@/lib/supabase';
import {
  Building2,
  Users,
  Calendar,
  DollarSign,
  MessageSquare,
  Clock,
  CheckCircle,
  AlertTriangle,
  ArrowRight,
  Mail,
  Phone,
  Globe,
  Star
} from 'lucide-react';
import { toast } from 'sonner';

const demoFormSchema = z.object({
  company_name: z.string().min(2, 'Company name is required'),
  contact_name: z.string().min(2, 'Contact name is required'),
  contact_email: z.string().email('Please enter a valid email address'),
  contact_phone: z.string().min(10, 'Please enter a valid phone number'),
  company_website: z.string().url('Please enter a valid URL').optional().or(z.literal('')),
  company_size: z.string().min(1, 'Please select company size'),
  industry_focus: z.string().min(1, 'Please select primary industry focus'),
  num_workers_managed: z.string().min(1, 'Please select number of workers managed'),
  annual_gigs: z.string().min(1, 'Please select annual number of gigs'),
  current_software: z.string().min(2, 'Please describe your current software'),
  communication_methods: z.string().min(2, 'Please describe your communication methods'),
  payroll_process: z.string().min(2, 'Please describe your payroll process'),
  pain_points: z.string().min(2, 'Please describe your pain points'),
  preferred_date: z.string().min(1, 'Please select a preferred date'),
  preferred_time: z.string().min(1, 'Please select a preferred time'),
  additional_notes: z.string().optional(),
  has_roster: z.boolean().default(false),
  has_scheduling_docs: z.boolean().default(false),
  has_payment_docs: z.boolean().default(false),
  marketing_consent: z.boolean().default(true),
});

type DemoFormData = z.infer<typeof demoFormSchema>;

const ScheduleDemoForm: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [demoDate, setDemoDate] = useState<string | null>(null);
  const [demoTime, setDemoTime] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<DemoFormData>({
    resolver: zodResolver(demoFormSchema),
    defaultValues: {
      company_name: '',
      contact_name: '',
      contact_email: '',
      contact_phone: '',
      company_website: '',
      company_size: '',
      industry_focus: '',
      num_workers_managed: '',
      annual_gigs: '',
      current_software: '',
      communication_methods: '',
      payroll_process: '',
      pain_points: '',
      preferred_date: '',
      preferred_time: '',
      additional_notes: '',
      has_roster: false,
      has_scheduling_docs: false,
      has_payment_docs: false,
      marketing_consent: true,
    },
  });

  const onSubmit = async (data: DemoFormData) => {
    setLoading(true);
    setError(null);

    try {
      // Call the Supabase Edge Function to submit the demo request
      const { data: responseData, error: responseError } = await supabase.functions.invoke('schedule-demo', {
        body: data,
      });

      if (responseError) {
        throw new Error(responseError.message);
      }

      if (responseData?.error) {
        throw new Error(responseData.error);
      }

      // Set the demo date and time for the confirmation screen
      setDemoDate(data.preferred_date);
      setDemoTime(data.preferred_time);
      setSuccess(true);
      toast.success('Your demo request has been submitted!');
    } catch (err: any) {
      console.error('Error submitting demo request:', err);
      setError(err.message || 'An error occurred while submitting your information');
      toast.error(err.message || 'Failed to schedule demo');
    } finally {
      setLoading(false);
    }
  };

  // Generate available dates (next 14 business days)
  const generateAvailableDates = () => {
    const dates = [];
    const today = new Date();
    let daysAdded = 0;
    let currentDate = new Date(today);
    
    // Skip to next business day if today is weekend
    if (currentDate.getDay() === 0) { // Sunday
      currentDate.setDate(currentDate.getDate() + 1);
    } else if (currentDate.getDay() === 6) { // Saturday
      currentDate.setDate(currentDate.getDate() + 2);
    } else {
      // If it's after 3pm, start from next business day
      if (currentDate.getHours() >= 15) {
        currentDate.setDate(currentDate.getDate() + 1);
        if (currentDate.getDay() === 6) { // If next day is Saturday
          currentDate.setDate(currentDate.getDate() + 2);
        } else if (currentDate.getDay() === 0) { // If next day is Sunday
          currentDate.setDate(currentDate.getDate() + 1);
        }
      }
    }
    
    // Add 14 business days
    while (daysAdded < 14) {
      // Skip weekends
      if (currentDate.getDay() !== 0 && currentDate.getDay() !== 6) {
        dates.push({
          value: currentDate.toISOString().split('T')[0],
          label: currentDate.toLocaleDateString('en-US', { 
            weekday: 'short', 
            month: 'short', 
            day: 'numeric' 
          })
        });
        daysAdded++;
      }
      currentDate.setDate(currentDate.getDate() + 1);
    }
    
    return dates;
  };

  // Generate available time slots (9am to 5pm, 1-hour slots)
  const generateTimeSlots = () => {
    const slots = [];
    for (let hour = 9; hour <= 16; hour++) {
      const hourFormatted = hour % 12 === 0 ? 12 : hour % 12;
      const ampm = hour < 12 ? 'AM' : 'PM';
      slots.push({
        value: `${hour}:00`,
        label: `${hourFormatted}:00 ${ampm}`
      });
    }
    return slots;
  };

  const availableDates = generateAvailableDates();
  const timeSlots = generateTimeSlots();

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-green-50 py-16 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        {/* Back to Home Button */}
        <Button
          variant="ghost"
          onClick={() => navigate('/')}
          className="mb-6 text-gray-600 hover:text-gray-900"
        >
          <ArrowRight className="w-4 h-4 mr-2 rotate-180" />
          Back to Home
        </Button>

        {success ? (
          <Card className="shadow-xl border-0 animate-fade-in">
            <CardHeader className="text-center pb-6">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="w-8 h-8 text-green-600" />
              </div>
              <CardTitle className="text-2xl font-bold">Demo Scheduled!</CardTitle>
              <CardDescription className="text-lg">
                We're excited to show you how FlexZora can transform your production company's operations.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="bg-blue-50 p-6 rounded-lg border border-blue-200">
                <h3 className="text-lg font-semibold text-blue-800 mb-3">Your Demo Details</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-blue-700">
                  <div className="flex items-start">
                    <Calendar className="w-5 h-5 mr-2 mt-0.5 text-blue-600" />
                    <div>
                      <p className="font-medium">Date</p>
                      <p>{new Date(demoDate!).toLocaleDateString('en-US', { 
                        weekday: 'long', 
                        month: 'long', 
                        day: 'numeric' 
                      })}</p>
                    </div>
                  </div>
                  <div className="flex items-start">
                    <Clock className="w-5 h-5 mr-2 mt-0.5 text-blue-600" />
                    <div>
                      <p className="font-medium">Time</p>
                      <p>{parseInt(demoTime!.split(':')[0]) % 12 || 12}:00 {parseInt(demoTime!.split(':')[0]) >= 12 ? 'PM' : 'AM'} (Your local time)</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="text-lg font-semibold">What to Prepare</h3>
                <p className="text-gray-600">
                  To make the most of your demo, please have the following information ready:
                </p>
                <ul className="space-y-2">
                  <li className="flex items-start">
                    <CheckCircle className="w-5 h-5 mr-2 text-green-600 shrink-0 mt-0.5" />
                    <span>A list of your current workforce management challenges</span>
                  </li>
                  <li className="flex items-start">
                    <CheckCircle className="w-5 h-5 mr-2 text-green-600 shrink-0 mt-0.5" />
                    <span>Examples of your current scheduling process and documents</span>
                  </li>
                  <li className="flex items-start">
                    <CheckCircle className="w-5 h-5 mr-2 text-green-600 shrink-0 mt-0.5" />
                    <span>Questions about specific features you'd like to see demonstrated</span>
                  </li>
                </ul>
              </div>

              <div className="text-center">
                <h3 className="text-lg font-semibold mb-2">Calendar Invitation Sent</h3>
                <p className="text-gray-600 mb-4">
                  We've sent a calendar invitation to your email. You'll also receive a confirmation email with details about the demo.
                </p>
                <Button onClick={() => navigate('/')} className="bg-gradient-to-r from-blue-600 to-green-500">
                  Return to Home
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className="shadow-xl border-0 animate-fade-in">
            <CardHeader className="text-center pb-6">
              <div className="w-16 h-16 bg-gradient-to-r from-blue-600 to-green-500 rounded-full flex items-center justify-center mx-auto mb-4">
                <Calendar className="w-8 h-8 text-white" />
              </div>
              <CardTitle className="text-2xl font-bold">Schedule a Demo</CardTitle>
              <CardDescription className="text-lg">
                See how FlexZora can transform your production company's operations with a personalized demo.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {error && (
                <Alert className="mb-6 bg-red-50 border-red-200">
                  <div className="flex items-center">
                    <AlertTriangle className="h-4 w-4 text-red-600 mr-2" />
                    <AlertDescription className="text-red-800">{error}</AlertDescription>
                  </div>
                </Alert>
              )}

              <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold border-b pb-2">Company Information</h3>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="company_name" className="text-base">Company Name*</Label>
                      <div className="relative mt-1">
                        <Building2 className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
                        <Input
                          id="company_name"
                          placeholder="Your company name"
                          className="pl-10 h-12"
                          {...register('company_name')}
                        />
                      </div>
                      {errors.company_name && (
                        <p className="text-sm text-red-600 mt-1">{errors.company_name.message}</p>
                      )}
                    </div>

                    <div>
                      <Label htmlFor="company_website" className="text-base">Company Website</Label>
                      <div className="relative mt-1">
                        <Globe className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
                        <Input
                          id="company_website"
                          placeholder="https://yourcompany.com"
                          className="pl-10 h-12"
                          {...register('company_website')}
                        />
                      </div>
                      {errors.company_website && (
                        <p className="text-sm text-red-600 mt-1">{errors.company_website.message}</p>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="company_size" className="text-base">Company Size*</Label>
                      <Select
                        onValueChange={(value) => setValue('company_size', value)}
                      >
                        <SelectTrigger className="h-12 mt-1">
                          <SelectValue placeholder="Select company size" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1-10">1-10 employees</SelectItem>
                          <SelectItem value="11-50">11-50 employees</SelectItem>
                          <SelectItem value="51-200">51-200 employees</SelectItem>
                          <SelectItem value="201-500">201-500 employees</SelectItem>
                          <SelectItem value="501+">501+ employees</SelectItem>
                        </SelectContent>
                      </Select>
                      {errors.company_size && (
                        <p className="text-sm text-red-600 mt-1">{errors.company_size.message}</p>
                      )}
                    </div>

                    <div>
                      <Label htmlFor="industry_focus" className="text-base">Primary Industry Focus*</Label>
                      <Select
                        onValueChange={(value) => setValue('industry_focus', value)}
                      >
                        <SelectTrigger className="h-12 mt-1">
                          <SelectValue placeholder="Select industry focus" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="corporate_events">Corporate Events</SelectItem>
                          <SelectItem value="concerts_festivals">Concerts & Festivals</SelectItem>
                          <SelectItem value="theater_performing_arts">Theater & Performing Arts</SelectItem>
                          <SelectItem value="film_tv_production">Film & TV Production</SelectItem>
                          <SelectItem value="sports_events">Sports Events</SelectItem>
                          <SelectItem value="weddings_private">Weddings & Private Events</SelectItem>
                          <SelectItem value="other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                      {errors.industry_focus && (
                        <p className="text-sm text-red-600 mt-1">{errors.industry_focus.message}</p>
                      )}
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="text-lg font-semibold border-b pb-2">Contact Information</h3>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="contact_name" className="text-base">Contact Name*</Label>
                      <div className="relative mt-1">
                        <Users className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
                        <Input
                          id="contact_name"
                          placeholder="Your full name"
                          className="pl-10 h-12"
                          {...register('contact_name')}
                        />
                      </div>
                      {errors.contact_name && (
                        <p className="text-sm text-red-600 mt-1">{errors.contact_name.message}</p>
                      )}
                    </div>

                    <div>
                      <Label htmlFor="contact_email" className="text-base">Contact Email*</Label>
                      <div className="relative mt-1">
                        <Mail className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
                        <Input
                          id="contact_email"
                          type="email"
                          placeholder="you@example.com"
                          className="pl-10 h-12"
                          {...register('contact_email')}
                        />
                      </div>
                      {errors.contact_email && (
                        <p className="text-sm text-red-600 mt-1">{errors.contact_email.message}</p>
                      )}
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="contact_phone" className="text-base">Contact Phone*</Label>
                    <div className="relative mt-1">
                      <Phone className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
                      <Input
                        id="contact_phone"
                        placeholder="Your phone number"
                        className="pl-10 h-12"
                        {...register('contact_phone')}
                      />
                    </div>
                    {errors.contact_phone && (
                      <p className="text-sm text-red-600 mt-1">{errors.contact_phone.message}</p>
                    )}
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="text-lg font-semibold border-b pb-2">Current Operations</h3>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="num_workers_managed" className="text-base">Number of Workers Managed*</Label>
                      <Select
                        onValueChange={(value) => setValue('num_workers_managed', value)}
                      >
                        <SelectTrigger className="h-12 mt-1">
                          <SelectValue placeholder="Select number of workers" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1-10">1-10 workers</SelectItem>
                          <SelectItem value="11-50">11-50 workers</SelectItem>
                          <SelectItem value="51-100">51-100 workers</SelectItem>
                          <SelectItem value="101-500">101-500 workers</SelectItem>
                          <SelectItem value="501+">501+ workers</SelectItem>
                        </SelectContent>
                      </Select>
                      {errors.num_workers_managed && (
                        <p className="text-sm text-red-600 mt-1">{errors.num_workers_managed.message}</p>
                      )}
                    </div>

                    <div>
                      <Label htmlFor="annual_gigs" className="text-base">Annual Number of Gigs*</Label>
                      <Select
                        onValueChange={(value) => setValue('annual_gigs', value)}
                      >
                        <SelectTrigger className="h-12 mt-1">
                          <SelectValue placeholder="Select annual gigs" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1-20">1-20 gigs per year</SelectItem>
                          <SelectItem value="21-50">21-50 gigs per year</SelectItem>
                          <SelectItem value="51-100">51-100 gigs per year</SelectItem>
                          <SelectItem value="101-500">101-500 gigs per year</SelectItem>
                          <SelectItem value="501+">501+ gigs per year</SelectItem>
                        </SelectContent>
                      </Select>
                      {errors.annual_gigs && (
                        <p className="text-sm text-red-600 mt-1">{errors.annual_gigs.message}</p>
                      )}
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="current_software" className="text-base">Current Software Solutions*</Label>
                    <Textarea
                      id="current_software"
                      placeholder="What software do you currently use for scheduling, payroll, communication, etc.?"
                      className="mt-1"
                      rows={3}
                      {...register('current_software')}
                    />
                    {errors.current_software && (
                      <p className="text-sm text-red-600 mt-1">{errors.current_software.message}</p>
                    )}
                  </div>

                  <div>
                    <Label htmlFor="communication_methods" className="text-base">Current Communication Methods*</Label>
                    <Textarea
                      id="communication_methods"
                      placeholder="How do you currently communicate gig details to your workers? (e.g., email, phone calls, text messages, specific platforms)"
                      className="mt-1"
                      rows={3}
                      {...register('communication_methods')}
                    />
                    {errors.communication_methods && (
                      <p className="text-sm text-red-600 mt-1">{errors.communication_methods.message}</p>
                    )}
                  </div>

                  <div>
                    <Label htmlFor="payroll_process" className="text-base">Current Payroll Process*</Label>
                    <Textarea
                      id="payroll_process"
                      placeholder="Describe your current payroll process, including how you track hours, process payments, and handle tax documentation."
                      className="mt-1"
                      rows={3}
                      {...register('payroll_process')}
                    />
                    {errors.payroll_process && (
                      <p className="text-sm text-red-600 mt-1">{errors.payroll_process.message}</p>
                    )}
                  </div>

                  <div>
                    <Label htmlFor="pain_points" className="text-base">Current Pain Points*</Label>
                    <Textarea
                      id="pain_points"
                      placeholder="What are your biggest challenges in managing your workforce? (e.g., scheduling conflicts, communication issues, payroll complexity)"
                      className="mt-1"
                      rows={3}
                      {...register('pain_points')}
                    />
                    {errors.pain_points && (
                      <p className="text-sm text-red-600 mt-1">{errors.pain_points.message}</p>
                    )}
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="text-lg font-semibold border-b pb-2">Documents to Prepare</h3>
                  
                  <div className="space-y-3 bg-blue-50 p-4 rounded-lg">
                    <p className="text-blue-800 mb-2">
                      To make the most of your demo, please prepare the following documents. Check the boxes for documents you can provide:
                    </p>
                    
                    <div className="flex items-start space-x-2">
                      <Checkbox 
                        id="has_roster" 
                        checked={watch('has_roster')}
                        onCheckedChange={(checked) => setValue('has_roster', !!checked)}
                      />
                      <div className="grid gap-1.5 leading-none">
                        <Label htmlFor="has_roster" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                          Worker Roster
                        </Label>
                        <p className="text-sm text-blue-700">
                          A list of your current workers with their roles and contact information
                        </p>
                      </div>
                    </div>
                    
                    <div className="flex items-start space-x-2">
                      <Checkbox 
                        id="has_scheduling_docs" 
                        checked={watch('has_scheduling_docs')}
                        onCheckedChange={(checked) => setValue('has_scheduling_docs', !!checked)}
                      />
                      <div className="grid gap-1.5 leading-none">
                        <Label htmlFor="has_scheduling_docs" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                          Scheduling Documents
                        </Label>
                        <p className="text-sm text-blue-700">
                          Examples of your current scheduling process, templates, or documents
                        </p>
                      </div>
                    </div>
                    
                    <div className="flex items-start space-x-2">
                      <Checkbox 
                        id="has_payment_docs" 
                        checked={watch('has_payment_docs')}
                        onCheckedChange={(checked) => setValue('has_payment_docs', !!checked)}
                      />
                      <div className="grid gap-1.5 leading-none">
                        <Label htmlFor="has_payment_docs" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                          Payment Documentation
                        </Label>
                        <p className="text-sm text-blue-700">
                          Examples of your payment forms, invoices, or payroll reports (with sensitive information redacted)
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="text-lg font-semibold border-b pb-2">Schedule Your Demo</h3>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="preferred_date" className="text-base">Preferred Date*</Label>
                      <Select
                        onValueChange={(value) => setValue('preferred_date', value)}
                      >
                        <SelectTrigger className="h-12 mt-1">
                          <SelectValue placeholder="Select a date" />
                        </SelectTrigger>
                        <SelectContent>
                          {availableDates.map((date) => (
                            <SelectItem key={date.value} value={date.value}>
                              {date.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {errors.preferred_date && (
                        <p className="text-sm text-red-600 mt-1">{errors.preferred_date.message}</p>
                      )}
                    </div>

                    <div>
                      <Label htmlFor="preferred_time" className="text-base">Preferred Time*</Label>
                      <Select
                        onValueChange={(value) => setValue('preferred_time', value)}
                      >
                        <SelectTrigger className="h-12 mt-1">
                          <SelectValue placeholder="Select a time" />
                        </SelectTrigger>
                        <SelectContent>
                          {timeSlots.map((slot) => (
                            <SelectItem key={slot.value} value={slot.value}>
                              {slot.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {errors.preferred_time && (
                        <p className="text-sm text-red-600 mt-1">{errors.preferred_time.message}</p>
                      )}
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="additional_notes" className="text-base">Additional Notes</Label>
                    <Textarea
                      id="additional_notes"
                      placeholder="Any specific features you'd like to see demonstrated or questions you have"
                      className="mt-1"
                      rows={3}
                      {...register('additional_notes')}
                    />
                  </div>

                  <div className="flex items-start space-x-2">
                    <Checkbox 
                      id="marketing_consent" 
                      checked={watch('marketing_consent')}
                      onCheckedChange={(checked) => setValue('marketing_consent', !!checked)}
                    />
                    <div className="grid gap-1.5 leading-none">
                      <Label htmlFor="marketing_consent" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                        Marketing Communications
                      </Label>
                      <p className="text-sm text-gray-500">
                        I agree to receive marketing communications from FlexZora. You can unsubscribe at any time.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="pt-4">
                  <Button
                    type="submit"
                    className="w-full h-12 bg-gradient-to-r from-blue-600 to-green-500 hover:from-blue-700 hover:to-green-600 text-lg"
                    disabled={loading}
                  >
                    {loading ? (
                      <>
                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-3"></div>
                        Processing...
                      </>
                    ) : (
                      <>
                        Schedule Your Demo
                        <ArrowRight className="ml-2 h-5 w-5" />
                      </>
                    )}
                  </Button>
                </div>

                <div className="text-center text-sm text-gray-500">
                  By scheduling a demo, you agree to our Terms of Service and Privacy Policy.
                </div>
              </form>
            </CardContent>
            <CardFooter className="bg-gray-50 border-t border-gray-100 p-6">
              <div className="w-full space-y-4">
                <h3 className="text-lg font-semibold text-center">Why Schedule a Demo?</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-white p-4 rounded-lg border border-gray-200 text-center">
                    <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-3">
                      <Users className="h-5 w-5 text-blue-600" />
                    </div>
                    <h4 className="font-medium">Personalized Tour</h4>
                    <p className="text-sm text-gray-600">See features tailored to your needs</p>
                  </div>
                  <div className="bg-white p-4 rounded-lg border border-gray-200 text-center">
                    <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
                      <DollarSign className="h-5 w-5 text-green-600" />
                    </div>
                    <h4 className="font-medium">ROI Analysis</h4>
                    <p className="text-sm text-gray-600">Understand your potential savings</p>
                  </div>
                  <div className="bg-white p-4 rounded-lg border border-gray-200 text-center">
                    <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-3">
                      <MessageSquare className="h-5 w-5 text-purple-600" />
                    </div>
                    <h4 className="font-medium">Expert Advice</h4>
                    <p className="text-sm text-gray-600">Get insights from industry experts</p>
                  </div>
                </div>
              </div>
            </CardFooter>
          </Card>
        )}

        {/* Testimonials Section */}
        {!success && (
          <div className="mt-12 space-y-6">
            <h2 className="text-2xl font-bold text-center mb-8">What Production Companies Are Saying</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card className="bg-white border-0 shadow-md">
                <CardContent className="pt-6">
                  <div className="flex items-start space-x-4">
                    <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-lg">
                      R
                    </div>
                    <div>
                      <div className="flex items-center">
                        <Star className="h-4 w-4 text-yellow-500 fill-current" />
                        <Star className="h-4 w-4 text-yellow-500 fill-current" />
                        <Star className="h-4 w-4 text-yellow-500 fill-current" />
                        <Star className="h-4 w-4 text-yellow-500 fill-current" />
                        <Star className="h-4 w-4 text-yellow-500 fill-current" />
                      </div>
                      <p className="text-gray-700 italic mt-2">
                        "FlexZora has revolutionized how we manage our freelance workforce. Scheduling is seamless, communication is centralized, and our workers love the transparency."
                      </p>
                      <p className="font-medium mt-3">Robert Chen</p>
                      <p className="text-sm text-gray-600">Operations Director, EventPro Solutions</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              
              <Card className="bg-white border-0 shadow-md">
                <CardContent className="pt-6">
                  <div className="flex items-start space-x-4">
                    <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center text-green-600 font-bold text-lg">
                      J
                    </div>
                    <div>
                      <div className="flex items-center">
                        <Star className="h-4 w-4 text-yellow-500 fill-current" />
                        <Star className="h-4 w-4 text-yellow-500 fill-current" />
                        <Star className="h-4 w-4 text-yellow-500 fill-current" />
                        <Star className="h-4 w-4 text-yellow-500 fill-current" />
                        <Star className="h-4 w-4 text-yellow-500 fill-current" />
                      </div>
                      <p className="text-gray-700 italic mt-2">
                        "We've reduced our administrative overhead by 40% since implementing FlexZora. The platform pays for itself in time savings alone."
                      </p>
                      <p className="font-medium mt-3">Jessica Martinez</p>
                      <p className="text-sm text-gray-600">CEO, Spotlight Productions</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ScheduleDemoForm;