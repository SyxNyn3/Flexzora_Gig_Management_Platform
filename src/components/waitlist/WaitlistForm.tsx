import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/lib/supabase';
import { WaitlistRoleInterest } from '@/lib/types';
import { 
  Mail, 
  Users, 
  Building2, 
  MessageSquare, 
  Lightbulb, 
  AlertTriangle, 
  CheckCircle, 
  Copy, 
  Share2, 
  Twitter, 
  Linkedin, 
  Send, 
  ArrowRight, 
  Sparkles,
  Clock,
  DollarSign,
  Star
} from 'lucide-react';
import { toast } from 'sonner';

const waitlistSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  role_interest: z.enum(['worker', 'company'], {
    required_error: 'Please select your role',
  }),
  production_companies_worked_with: z.string().optional(),
  past_communication_methods: z.string().optional(),
  desired_features: z.string().optional(),
  challenges: z.string().optional(),
});

type WaitlistFormData = z.infer<typeof waitlistSchema>;

const WaitlistForm: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [verificationSent, setVerificationSent] = useState(false);
  const [userEmail, setUserEmail] = useState<string>('');
  const [referralCode, setReferralCode] = useState<string | null>(null);
  const [waitlistCount, setWaitlistCount] = useState<number>(0);
  const [referredBy, setReferredBy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [verificationError, setVerificationError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<WaitlistFormData>({
    resolver: zodResolver(waitlistSchema),
    defaultValues: {
      email: '',
      role_interest: undefined,
      production_companies_worked_with: '',
      past_communication_methods: '',
      desired_features: '',
      challenges: '',
    },
  });

  // Get the referral code from the URL if present
  useEffect(() => {
    const ref = searchParams.get('ref');
    if (ref) {
      setReferredBy(ref);
    }

    // Simulate fetching waitlist count
    setWaitlistCount(Math.floor(Math.random() * 500) + 1500);
  }, [searchParams]);

  const onSubmit = async (data: WaitlistFormData) => {
    setLoading(true);
    setError(null);

    try {
      // Call the Supabase Edge Function to submit the waitlist entry
      const { data: responseData, error: responseError } = await supabase.functions.invoke('submit-waitlist', {
        body: {
          ...data,
          referred_by_email: referredBy,
        },
      });

      if (responseError) {
        throw new Error(responseError.message);
      }

      if (responseData?.error) {
        throw new Error(responseData.error);
      }

      // Check if verification is required
      if (responseData.verification_required) {
        setUserEmail(data.email);
        setVerificationSent(true);
        toast.success('Verification email sent! Please check your inbox.');
      } else {
        // Set the referral code from the response
        setReferralCode(responseData.referral_code);
        setSuccess(true);
      }
      toast.success('You have been added to the waitlist!');
    } catch (err: any) {
      console.error('Error submitting to waitlist:', err);
      setError(err.message || 'An error occurred while submitting your information');
      toast.error(err.message || 'Failed to join waitlist');
    } finally {
      setLoading(false);
    }
  };

  const resendVerification = async () => {
    if (!userEmail) return;
    
    setLoading(true);
    setVerificationError(null);
    
    try {
      const { data: responseData, error: responseError } = await supabase.functions.invoke('resend-waitlist-verification', {
        body: { email: userEmail },
      });

      if (responseError) {
        throw new Error(responseError.message);
      }

      if (responseData?.error) {
        throw new Error(responseData.error);
      }

      toast.success('Verification email resent!');
    } catch (err: any) {
      console.error('Error resending verification:', err);
      setVerificationError(err.message || 'Failed to resend verification email');
    } finally {
      setLoading(false);
    }
  };

  const copyReferralLink = () => {
    if (!referralCode) return;
    
    const link = `${window.location.origin}/waitlist?ref=${referralCode}`;
    navigator.clipboard.writeText(link);
    toast.success('Referral link copied to clipboard!');
  };

  const shareOnTwitter = () => {
    if (!referralCode) return;
    
    const link = `${window.location.origin}/waitlist?ref=${referralCode}`;
    const text = encodeURIComponent(`I just joined the waitlist for @FlexZora, a new platform for freelance professionals in production and events! Join me and get early access: ${link}`);
    window.open(`https://twitter.com/intent/tweet?text=${text}`, '_blank');
  };

  const shareOnLinkedIn = () => {
    if (!referralCode) return;
    
    const link = `${window.location.origin}/waitlist?ref=${referralCode}`;
    const url = encodeURIComponent(link);
    const title = encodeURIComponent('Join the FlexZora Waitlist');
    const summary = encodeURIComponent('FlexZora is a new platform for freelance professionals in production and events. Join the waitlist for early access!');
    window.open(`https://www.linkedin.com/sharing/share-offsite/?url=${url}&title=${title}&summary=${summary}`, '_blank');
  };

  const shareByEmail = () => {
    if (!referralCode) return;
    
    const link = `${window.location.origin}/waitlist?ref=${referralCode}`;
    const subject = encodeURIComponent('Join me on FlexZora - The Professional Gig Management Platform');
    const body = encodeURIComponent(`Hey,\n\nI just joined the waitlist for FlexZora, a new platform for freelance professionals in production and events. I thought you might be interested too!\n\nJoin using my referral link to get early access: ${link}\n\nBest,\n`);
    window.open(`mailto:?subject=${subject}&body=${body}`, '_blank');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-green-50 py-16 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto">
        {/* Back to Home Button */}
        <Button
          variant="ghost"
          onClick={() => navigate('/')}
          className="mb-6 text-gray-600 hover:text-gray-900"
        >
          <ArrowRight className="w-4 h-4 mr-2 rotate-180" />
          Back to Home
        </Button>

        {/* Waitlist Counter */}
        <div className="text-center mb-8">
          <Badge variant="outline" className="px-4 py-2 text-base font-medium bg-blue-50 border-blue-200 text-blue-700">
            <Users className="w-4 h-4 mr-2" />
            {waitlistCount.toLocaleString()}+ professionals on the waitlist
          </Badge>
        </div>

        {success ? (
          <Card className="shadow-xl border-0 animate-fade-in">
            <CardHeader className="text-center pb-6">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="w-8 h-8 text-green-600" />
              </div>
              <CardTitle className="text-2xl font-bold">You're on the List!</CardTitle>
              <CardDescription className="text-lg">
                Thanks for joining the FlexZora waitlist. We're excited to have you!
              </CardDescription>
            </CardHeader>
        ) : verificationSent ? (
          <Card className="shadow-xl border-0 animate-fade-in">
            <CardHeader className="text-center pb-6">
              <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Mail className="w-8 h-8 text-blue-600" />
              </div>
              <CardTitle className="text-2xl font-bold">Check Your Email</CardTitle>
              <CardDescription className="text-lg">
                We've sent a verification link to {userEmail}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="bg-blue-50 p-6 rounded-lg border border-blue-200">
                <h3 className="text-lg font-semibold text-blue-800 mb-3">Next Steps</h3>
                <ol className="space-y-2 text-blue-700">
                  <li className="flex items-start">
                    <span className="inline-block w-6 h-6 bg-blue-200 text-blue-800 rounded-full text-sm font-medium mr-3 mt-0.5 text-center leading-6">1</span>
                    Check your email inbox (and spam folder)
                  </li>
                  <li className="flex items-start">
                    <span className="inline-block w-6 h-6 bg-blue-200 text-blue-800 rounded-full text-sm font-medium mr-3 mt-0.5 text-center leading-6">2</span>
                    Click the verification link in the email
                  </li>
                  <li className="flex items-start">
                    <span className="inline-block w-6 h-6 bg-blue-200 text-blue-800 rounded-full text-sm font-medium mr-3 mt-0.5 text-center leading-6">3</span>
                    Complete your waitlist registration
                  </li>
                </ol>
              </div>

              {verificationError && (
                <Alert className="bg-red-50 border-red-200">
                  <AlertTriangle className="h-4 w-4 text-red-600" />
                  <AlertDescription className="text-red-800">{verificationError}</AlertDescription>
                </Alert>
              )}

              <div className="text-center">
                <p className="text-gray-600 mb-4">
                  Didn't receive the email? Check your spam folder or resend it.
                </p>
                <Button 
                  variant="outline" 
                  onClick={resendVerification}
                  disabled={loading}
                  className="mb-4"
                >
                  {loading ? 'Sending...' : 'Resend Verification Email'}
                </Button>
                <div>
                  <Button variant="ghost" onClick={() => navigate('/')}>
                    Return to Home
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
            <CardContent className="space-y-6">
              <div className="bg-blue-50 p-6 rounded-lg border border-blue-200">
                <h3 className="text-lg font-semibold text-blue-800 mb-3 flex items-center">
                  <Sparkles className="w-5 h-5 mr-2" />
                  Skip the line with referrals
                </h3>
                <p className="text-blue-700 mb-4">
                  Share your unique link with friends and colleagues. For every person who joins using your link, you'll move up in the waitlist and get access sooner!
                </p>
                <div className="bg-white p-3 rounded-md flex items-center justify-between border border-blue-200 mb-4">
                  <code className="text-sm font-mono text-blue-800 truncate">
                    {window.location.origin}/waitlist?ref={referralCode}
                  </code>
                  <Button variant="ghost" size="sm" onClick={copyReferralLink}>
                    <Copy className="w-4 h-4" />
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={copyReferralLink} className="flex-1">
                    <Copy className="w-4 h-4 mr-2" />
                    Copy Link
                  </Button>
                  <Button variant="outline" size="sm" onClick={shareOnTwitter} className="flex-1">
                    <Twitter className="w-4 h-4 mr-2" />
                    Twitter
                  </Button>
                  <Button variant="outline" size="sm" onClick={shareOnLinkedIn} className="flex-1">
                    <Linkedin className="w-4 h-4 mr-2" />
                    LinkedIn
                  </Button>
                  <Button variant="outline" size="sm" onClick={shareByEmail} className="flex-1">
                    <Mail className="w-4 h-4 mr-2" />
                    Email
                  </Button>
                </div>
              </div>

              <div className="text-center">
                <h3 className="text-lg font-semibold mb-2">What happens next?</h3>
                <p className="text-gray-600 mb-4">
                  We'll keep you updated on our progress and let you know when you're granted early access. In the meantime, keep an eye on your inbox for updates!
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
                <span className="text-white font-bold text-2xl">F</span>
              </div>
              <CardTitle className="text-2xl font-bold">Join the FlexZora Waitlist</CardTitle>
              <CardDescription className="text-lg">
                Be among the first to experience the future of gig management for production and event professionals.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {referredBy && (
                <Alert className="mb-6 bg-blue-50 border-blue-200">
                  <div className="flex items-center">
                    <Users className="h-4 w-4 text-blue-600 mr-2" />
                    <AlertDescription className="text-blue-800">
                      You were referred by a friend! You'll both get priority access.
                    </AlertDescription>
                  </div>
                </Alert>
              )}

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
                  <div>
                    <Label htmlFor="email" className="text-base">Email Address</Label>
                    <div className="relative mt-1">
                      <Mail className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
                      <Input
                        id="email"
                        type="email"
                        placeholder="you@example.com"
                        className="pl-10 h-12"
                        {...register('email')}
                      />
                    </div>
                    {errors.email && (
                      <p className="text-sm text-red-600 mt-1">{errors.email.message}</p>
                    )}
                  </div>

                  <div>
                    <Label htmlFor="role_interest" className="text-base">I am a...</Label>
                    <Select
                      onValueChange={(value: WaitlistRoleInterest) => setValue('role_interest', value)}
                    >
                      <SelectTrigger className="h-12 mt-1">
                        <SelectValue placeholder="Select your role" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="worker">
                          <div className="flex items-center">
                            <Users className="w-4 h-4 mr-2 text-blue-600" />
                            Freelance Worker
                          </div>
                        </SelectItem>
                        <SelectItem value="company">
                          <div className="flex items-center">
                            <Building2 className="w-4 h-4 mr-2 text-green-600" />
                            Company/Employer
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    {errors.role_interest && (
                      <p className="text-sm text-red-600 mt-1">{errors.role_interest.message}</p>
                    )}
                  </div>
                </div>

                <div className="border-t border-gray-200 pt-6">
                  <h3 className="text-lg font-semibold mb-4">Help us build a better platform</h3>
                  <p className="text-gray-600 mb-4">
                    Your insights will help us tailor FlexZora to your specific needs. These questions are optional but valuable!
                  </p>

                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="production_companies_worked_with" className="text-base flex items-center">
                        <Building2 className="w-4 h-4 mr-2 text-gray-500" />
                        What production companies have you worked for or do you currently work with?
                      </Label>
                      <Textarea
                        id="production_companies_worked_with"
                        placeholder="e.g., Rhino Staging, Giglife, PCE, etc."
                        className="mt-1"
                        rows={3}
                        {...register('production_companies_worked_with')}
                      />
                    </div>

                    <div>
                      <Label htmlFor="past_communication_methods" className="text-base flex items-center">
                        <MessageSquare className="w-4 h-4 mr-2 text-gray-500" />
                        How did your past employers typically reach out to you about gigs?
                      </Label>
                      <Textarea
                        id="past_communication_methods"
                        placeholder="e.g., email, phone calls, text messages, specific platforms, etc."
                        className="mt-1"
                        rows={3}
                        {...register('past_communication_methods')}
                      />
                    </div>

                    <div>
                      <Label htmlFor="desired_features" className="text-base flex items-center">
                        <Lightbulb className="w-4 h-4 mr-2 text-gray-500" />
                        What features do you wish a gig management platform could offer?
                      </Label>
                      <Textarea
                        id="desired_features"
                        placeholder="e.g., automatic scheduling, payment tracking, etc."
                        className="mt-1"
                        rows={3}
                        {...register('desired_features')}
                      />
                    </div>

                    <div>
                      <Label htmlFor="challenges" className="text-base flex items-center">
                        <AlertTriangle className="w-4 h-4 mr-2 text-gray-500" />
                        What are your biggest challenges in managing your freelance career/workforce?
                      </Label>
                      <Textarea
                        id="challenges"
                        placeholder="e.g., scheduling conflicts, late payments, communication issues, etc."
                        className="mt-1"
                        rows={3}
                        {...register('challenges')}
                      />
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
                        Join the Waitlist
                        <ArrowRight className="ml-2 h-5 w-5" />
                      </>
                    )}
                  </Button>
                </div>

                <div className="text-center text-sm text-gray-500">
                  By joining, you agree to receive updates about FlexZora. We'll never spam you or share your information.
                </div>
              </form>
            </CardContent>
            <CardFooter className="bg-gray-50 border-t border-gray-100 p-6">
              <div className="w-full space-y-4">
                <h3 className="text-lg font-semibold text-center">Why Join the Waitlist?</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-white p-4 rounded-lg border border-gray-200 text-center">
                    <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-3">
                      <Clock className="h-5 w-5 text-blue-600" />
                    </div>
                    <h4 className="font-medium">Early Access</h4>
                    <p className="text-sm text-gray-600">Be among the first to use FlexZora</p>
                  </div>
                  <div className="bg-white p-4 rounded-lg border border-gray-200 text-center">
                    <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
                      <DollarSign className="h-5 w-5 text-green-600" />
                    </div>
                    <h4 className="font-medium">Special Pricing</h4>
                    <p className="text-sm text-gray-600">Exclusive discounts for early adopters</p>
                  </div>
                  <div className="bg-white p-4 rounded-lg border border-gray-200 text-center">
                    <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-3">
                      <Lightbulb className="h-5 w-5 text-purple-600" />
                    </div>
                    <h4 className="font-medium">Shape the Product</h4>
                    <p className="text-sm text-gray-600">Influence features and development</p>
                  </div>
                </div>
              </div>
            </CardFooter>
          </Card>
        )}

        {/* Testimonials Section */}
        <div className="mt-12 space-y-6">
          <h2 className="text-2xl font-bold text-center mb-8">What Industry Professionals Are Saying</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card className="bg-white border-0 shadow-md">
              <CardContent className="pt-6">
                <div className="flex items-start space-x-4">
                  <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-lg">
                    S
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
                      "As a sound engineer working with multiple production companies, I'm excited about a platform that could keep me organized and ensure I never double-book."
                    </p>
                    <p className="font-medium mt-3">Sarah Chen</p>
                    <p className="text-sm text-gray-600">Sound Engineer</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card className="bg-white border-0 shadow-md">
              <CardContent className="pt-6">
                <div className="flex items-start space-x-4">
                  <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center text-green-600 font-bold text-lg">
                    M
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
                      "Managing freelancers across multiple events is a logistical challenge. A platform that streamlines this would be a game-changer for our production company."
                    </p>
                    <p className="font-medium mt-3">Michael Rodriguez</p>
                    <p className="text-sm text-gray-600">Event Production Manager</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Final CTA */}
        <div className="mt-12 text-center">
          <h2 className="text-2xl font-bold mb-4">Ready to transform how you manage your gigs?</h2>
          <p className="text-gray-600 mb-6 max-w-2xl mx-auto">
            Join thousands of professionals who are already on the waitlist to revolutionize their freelance careers and workforce management.
          </p>
          <Button 
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            className="bg-gradient-to-r from-blue-600 to-green-500 hover:from-blue-700 hover:to-green-600 text-lg px-8 py-3"
          >
            Join the Waitlist Now
            <ArrowRight className="ml-2 h-5 w-5" />
          </Button>
        </div>
      </div>
    </div>
  );
};

export default WaitlistForm;