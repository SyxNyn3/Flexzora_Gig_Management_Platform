import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/contexts/AuthContext';
import { supabase, isDemoMode } from '@/lib/supabase';
import { toast } from 'sonner';
import { Mail, Apple, Chrome, ArrowLeft, Shield, CheckCircle } from 'lucide-react';

const signInSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

const signUpSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  confirmPassword: z.string(),
  fullName: z.string().min(2, 'Full name must be at least 2 characters'),
  role: z.enum(['worker', 'company'], { required_error: 'Please select a role' }),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

type SignInForm = z.infer<typeof signInSchema>;
type SignUpForm = z.infer<typeof signUpSchema>;

const AuthForm: React.FC = () => {
  const [searchParams] = useSearchParams();
  const [isSignUp, setIsSignUp] = useState(searchParams.get('mode') === 'signup');
  const [loading, setLoading] = useState(false);
  const [socialLoading, setSocialLoading] = useState<string | null>(null);
  const [error, setError] = useState('');
  const { signIn, signUp } = useAuth();
  const navigate = useNavigate();

  const signInForm = useForm<SignInForm>({
    resolver: zodResolver(signInSchema),
    defaultValues: {
      email: isDemoMode ? 'demo@flexora.com' : '',
      password: isDemoMode ? 'password' : '',
    },
  });

  const signUpForm = useForm<SignUpForm>({
    resolver: zodResolver(signUpSchema),
    defaultValues: {
      email: '',
      password: '',
      confirmPassword: '',
      fullName: '',
      role: undefined,
    },
  });

  const onSignIn = async (data: SignInForm) => {
    setLoading(true);
    setError('');

    try {
      const { error } = await signIn(data.email, data.password);

      if (error) {
        console.error('Sign in error:', error);
        setError(error.message);
      } else {
        toast.success('Signed in successfully!');
        navigate('/dashboard');
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred during sign in');
      console.error('Sign in exception:', err);
    } finally {
      setLoading(false);
    }
  };

  const onSignUp = async (data: SignUpForm) => {
    setLoading(true);
    setError('');

    try {
      // Validate form data
      if (!data.fullName.trim()) {
        setError('Full name is required');
        setLoading(false);
        return;
      }

      const { error } = await signUp(data.email, data.password, {
        full_name: data.fullName,
        role: data.role,
      });

      if (error) {
        console.error('Sign up error:', error);
        setError(error.message);
      } else {
        toast.success('Account created successfully!');
        navigate('/dashboard');
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred during sign up');
      console.error('Sign up exception:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSocialLogin = async (provider: 'google' | 'apple') => {
    if (isDemoMode) {
      toast.info('Social login not available in demo mode. Use the demo login instead.');
      return;
    }

    setSocialLoading(provider);
    setError('');

    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: provider,
        options: {
          redirectTo: `${window.location.origin}/dashboard`,
          queryParams: {
            access_type: 'offline',
            prompt: 'consent',
          },
        },
      });

      if (error) {
        throw error;
      }

      // The redirect will happen automatically
    } catch (err: any) {
      console.error(`${provider} login error:`, err);
      setError(err.message || `Failed to sign in with ${provider}`);
      setSocialLoading(null);
    }
  };

  const handleDemoLogin = async () => {
    setLoading(true);
    setError('');

    try {
      const { error } = await signIn('demo@flexora.com', 'password');

      if (error) {
        setError(error.message);
      } else {
        toast.success('Demo login successful!');
        navigate('/dashboard');
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred during demo login');
      console.error('Demo login exception:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-green-50 p-4">
      <div className="w-full max-w-md">
        {/* Back to Home Button */}
        <Button
          variant="ghost"
          onClick={() => navigate('/')}
          className="mb-6 text-gray-600 hover:text-gray-900"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Home
        </Button>

        <Card className="shadow-xl border-0">
          <CardHeader className="text-center pb-6">
            <div className="flex justify-center mb-4">
              <div className="w-12 h-12 bg-gradient-to-r from-blue-600 to-green-500 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-2xl">F</span>
              </div>
            </div>
            <CardTitle className="text-2xl font-bold">
              {isSignUp ? 'Create Your Account' : 'Welcome Back'}
            </CardTitle>
            <CardDescription>
              {isSignUp 
                ? 'Join the Flexora community and start managing your gigs' 
                : 'Sign in to your Flexora account'
              }
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-6">
            {/* Demo Mode Alert */}
            {isDemoMode && (
              <Alert className="border-blue-200 bg-blue-50">
                <Shield className="h-4 w-4" />
                <AlertDescription className="text-blue-800">
                  <div className="space-y-3">
                    <div>
                      <strong>Demo Mode:</strong> Supabase not configured
                    </div>
                    <Button 
                      onClick={handleDemoLogin}
                      disabled={loading}
                      className="w-full bg-gradient-to-r from-blue-600 to-green-500"
                    >
                      {loading ? 'Signing In...' : 'Try Demo (No Registration Required)'}
                    </Button>
                  </div>
                </AlertDescription>
              </Alert>
            )}

            {/* Social Login Buttons */}
            {!isDemoMode && (
              <div className="space-y-3">
                <Button
                  variant="outline"
                  onClick={() => handleSocialLogin('google')}
                  disabled={socialLoading !== null || loading}
                  className="w-full h-12 text-gray-700 border-gray-300 hover:bg-gray-50"
                >
                  {socialLoading === 'google' ? (
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-gray-600"></div>
                  ) : (
                    <>
                      <Chrome className="w-5 h-5 mr-3" />
                      Continue with Google
                    </>
                  )}
                </Button>

                <Button
                  variant="outline"
                  onClick={() => handleSocialLogin('apple')}
                  disabled={socialLoading !== null || loading}
                  className="w-full h-12 text-gray-700 border-gray-300 hover:bg-gray-50"
                >
                  {socialLoading === 'apple' ? (
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-gray-600"></div>
                  ) : (
                    <>
                      <Apple className="w-5 h-5 mr-3" />
                      Continue with Apple
                    </>
                  )}
                </Button>

                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t border-gray-300" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-white px-2 text-gray-500">Or continue with email</span>
                  </div>
                </div>
              </div>
            )}

            {/* Error Display */}
            {error && (
              <Alert className="border-red-200 bg-red-50">
                <AlertDescription className="text-red-800">{error}</AlertDescription>
              </Alert>
            )}

            {/* Email/Password Forms */}
            {isSignUp ? (
              <form onSubmit={signUpForm.handleSubmit(onSignUp)} className="space-y-4">
                <div>
                  <Label htmlFor="fullName">Full Name</Label>
                  <Input
                    id="fullName"
                    type="text"
                    {...signUpForm.register('fullName')}
                    className="mt-1 h-12"
                    placeholder="Enter your full name"
                  />
                  {signUpForm.formState.errors.fullName && (
                    <p className="text-sm text-red-600 mt-1">
                      {signUpForm.formState.errors.fullName.message}
                    </p>
                  )}
                </div>

                <div>
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    {...signUpForm.register('email')}
                    className="mt-1 h-12"
                    placeholder="Enter your email"
                  />
                  {signUpForm.formState.errors.email && (
                    <p className="text-sm text-red-600 mt-1">
                      {signUpForm.formState.errors.email.message}
                    </p>
                  )}
                </div>

                <div>
                  <Label htmlFor="role">I am a...</Label>
                  <Select onValueChange={(value) => signUpForm.setValue('role', value as 'worker' | 'company')}>
                    <SelectTrigger className="mt-1 h-12">
                      <SelectValue placeholder="Select your role" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="worker">
                        <div className="flex items-center">
                          <span className="mr-2">👤</span>
                          Freelance Worker
                        </div>
                      </SelectItem>
                      <SelectItem value="company">
                        <div className="flex items-center">
                          <span className="mr-2">🏢</span>
                          Company/Employer
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  {signUpForm.formState.errors.role && (
                    <p className="text-sm text-red-600 mt-1">
                      {signUpForm.formState.errors.role.message}
                    </p>
                  )}
                </div>

                <div>
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    {...signUpForm.register('password')}
                    className="mt-1 h-12"
                    placeholder="Create a password"
                  />
                  {signUpForm.formState.errors.password && (
                    <p className="text-sm text-red-600 mt-1">
                      {signUpForm.formState.errors.password.message}
                    </p>
                  )}
                </div>

                <div>
                  <Label htmlFor="confirmPassword">Confirm Password</Label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    {...signUpForm.register('confirmPassword')}
                    className="mt-1 h-12"
                    placeholder="Confirm your password"
                  />
                  {signUpForm.formState.errors.confirmPassword && (
                    <p className="text-sm text-red-600 mt-1">
                      {signUpForm.formState.errors.confirmPassword.message}
                    </p>
                  )}
                </div>

                <Button 
                  type="submit" 
                  className="w-full h-12 bg-gradient-to-r from-blue-600 to-green-500 hover:from-blue-700 hover:to-green-600" 
                  disabled={loading || socialLoading !== null}
                >
                  {loading ? 'Creating Account...' : 'Create Account'}
                </Button>
              </form>
            ) : (
              <form onSubmit={signInForm.handleSubmit(onSignIn)} className="space-y-4">
                <div>
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    {...signInForm.register('email')}
                    className="mt-1 h-12"
                    placeholder={isDemoMode ? 'demo@flexora.com' : 'Enter your email'}
                  />
                  {signInForm.formState.errors.email && (
                    <p className="text-sm text-red-600 mt-1">
                      {signInForm.formState.errors.email.message}
                    </p>
                  )}
                </div>

                <div>
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    {...signInForm.register('password')}
                    className="mt-1 h-12"
                    placeholder={isDemoMode ? 'password' : 'Enter your password'}
                  />
                  {signInForm.formState.errors.password && (
                    <p className="text-sm text-red-600 mt-1">
                      {signInForm.formState.errors.password.message}
                    </p>
                  )}
                </div>

                {isDemoMode && (
                  <div className="bg-blue-50 p-3 rounded-lg text-sm text-blue-800">
                    <strong>Demo Mode:</strong> Use any email and password to explore the platform
                  </div>
                )}

                <Button 
                  type="submit" 
                  className="w-full h-12 bg-gradient-to-r from-blue-600 to-green-500 hover:from-blue-700 hover:to-green-600" 
                  disabled={loading || socialLoading !== null}
                >
                  {loading ? 'Signing In...' : 'Sign In'}
                </Button>

                {!isDemoMode && (
                  <div className="text-center">
                    <Button variant="link" className="text-sm text-gray-600 hover:text-gray-900">
                      Forgot your password?
                    </Button>
                  </div>
                )}
              </form>
            )}

            {/* Security Features */}
            {!isDemoMode && (
              <div className="pt-4 border-t border-gray-200">
                <div className="flex items-center justify-center space-x-6 text-xs text-gray-500">
                  <div className="flex items-center">
                    <Shield className="w-3 h-3 mr-1" />
                    SSL Encrypted
                  </div>
                  <div className="flex items-center">
                    <CheckCircle className="w-3 h-3 mr-1" />
                    GDPR Compliant
                  </div>
                </div>
              </div>
            )}
          </CardContent>

          <CardFooter className="text-center">
            <Button
              variant="link"
              className="w-full"
              onClick={() => setIsSignUp(!isSignUp)}
              disabled={loading || socialLoading !== null}
            >
              {isSignUp 
                ? 'Already have an account? Sign in' 
                : "Don't have an account? Sign up"
              }
            </Button>
          </CardFooter>
        </Card>

        {/* Trust Indicators */}
        <div className="mt-6 text-center">
          <p className="text-xs text-gray-500 mb-2">Trusted by 10,000+ professionals</p>
          <div className="flex justify-center space-x-4 text-xs text-gray-400">
            <span>• Enterprise Security</span>
            <span>• 99.9% Uptime</span>
            <span>• 24/7 Support</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AuthForm;