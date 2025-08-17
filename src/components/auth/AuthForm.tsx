import React, { useState, useEffect } from 'react';
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
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { storeAuthData } from '@/lib/auth';
import { Mail, Apple, Chrome, ArrowLeft, Shield, CheckCircle, Eye, EyeOff, Sparkles, Lock } from 'lucide-react';

const signInSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

const signUpSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  confirmPassword: z.string(),
  fullName: z.string().min(2, 'Full name must be at least 2 characters'),
  username: z.string()
    .min(3, 'Username must be at least 3 characters')
    .max(20, 'Username must be less than 20 characters')
    .regex(/^[a-zA-Z0-9_-]+$/, 'Username can only contain letters, numbers, underscores, and hyphens'),
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
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState('');
  const { signIn, signUp } = useAuth();
  const navigate = useNavigate();

  const signInForm = useForm<SignInForm>({
    resolver: zodResolver(signInSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  });

  const signUpForm = useForm<SignUpForm>({
    resolver: zodResolver(signUpSchema),
    defaultValues: {
      email: '',
      password: '',
      confirmPassword: '',
      fullName: '',
      username: '',
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
        toast.success('Welcome back!', {
          description: 'You have been signed in successfully.',
        });
        // Navigate immediately to prevent blank screen
        navigate('/dashboard', { replace: true });
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
      if (!data.fullName.trim()) {
        setError('Full name is required');
        setLoading(false);
        return;
      }

      if (!data.username.trim()) {
        setError('Username is required');
        setLoading(false);
        return;
      }

      const { error } = await signUp(data.email, data.password, {
        full_name: data.fullName,
        username: data.username,
        role: data.role,
      });

      if (error) {
        console.error('Sign up error:', error);
        setError(error.message);
      } else {
        toast.success('Account created successfully!', {
          description: 'Welcome to FlexZora! Your account has been created.',
        });
        // Navigate immediately to prevent blank screen
        navigate('/dashboard', { replace: true });
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred during sign up');
      console.error('Sign up exception:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSocialLogin = async (provider: 'google' | 'apple') => {
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

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-white to-blue-50 p-4">
      <div className="w-full max-w-md">
        {/* Back to Home Button */}
        <Button
          variant="ghost"
          onClick={() => navigate('/')}
          className="mb-6 text-gray-600 hover:text-gray-900 transition-colors"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Home
        </Button>

        <Card className="shadow-2xl border-0 animate-fade-in backdrop-blur-sm bg-white/95">
          <CardHeader className="text-center pb-8 pt-8">
            <div className="flex justify-center mb-6">
              <div className="relative">
                <div className="w-16 h-16 bg-gradient-to-r from-blue-600 to-green-500 rounded-xl flex items-center justify-center shadow-lg">
                  <span className="text-white font-bold text-3xl">F</span>
                </div>
                <div className="absolute -top-1 -right-1 w-6 h-6 bg-gradient-to-r from-yellow-400 to-orange-500 rounded-full flex items-center justify-center">
                  <Sparkles className="w-3 h-3 text-white" />
                </div>
              </div>
            </div>
            <CardTitle className="text-3xl font-bold bg-gradient-to-r from-gray-900 to-gray-700 bg-clip-text text-transparent mb-2">
              {isSignUp ? 'Join FlexZora' : 'Welcome Back'}
            </CardTitle>
            <CardDescription className="text-base text-gray-600 max-w-sm mx-auto leading-relaxed">
              {isSignUp 
                ? 'Create your account and start managing your gigs like a pro' 
                : 'Sign in to your FlexZora account and continue your journey'
              }
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-6 px-8">
            {/* Social Login Buttons */}
            <div className="space-y-3">
              <Button
                variant="outline"
                onClick={() => handleSocialLogin('google')}
                disabled={socialLoading !== null || loading}
                className="w-full h-12 text-gray-700 border-gray-300 hover:bg-gray-50 hover:border-gray-400 transition-all duration-200 font-medium"
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
                className="w-full h-12 text-gray-700 border-gray-300 hover:bg-gray-50 hover:border-gray-400 transition-all duration-200 font-medium"
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
                  <span className="w-full border-t border-gray-200" />
                </div>
                <div className="relative flex justify-center text-sm uppercase">
                  <span className="bg-white px-4 text-gray-500 font-medium tracking-wide">Or continue with email</span>
                </div>
              </div>
            </div>

            {/* Error Display */}
            {error && (
              <Alert variant="destructive" className="bg-red-50 border-red-200">
                <AlertDescription className="text-red-800 text-sm">{error}</AlertDescription>
              </Alert>
            )}

            {/* Email/Password Forms */}
            {isSignUp ? (
              <form onSubmit={signUpForm.handleSubmit(onSignUp)} className="space-y-5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="fullName" className="text-sm font-medium text-gray-700">Full Name</Label>
                    <Input
                      id="fullName"
                      type="text"
                      {...signUpForm.register('fullName')}
                      className="mt-1.5 h-11 transition-all duration-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="Enter your full name"
                    />
                    {signUpForm.formState.errors.fullName && (
                      <p className="text-sm text-red-600 mt-1">
                        {signUpForm.formState.errors.fullName.message}
                      </p>
                    )}
                  </div>

                  <div>
                    <Label htmlFor="username" className="text-sm font-medium text-gray-700">Username</Label>
                    <Input
                      name="username"
                      id="username"
                      type="text"
                      {...signUpForm.register('username')}
                      className="mt-1.5 h-11 transition-all duration-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="Choose a unique username"
                    />
                    {signUpForm.formState.errors.username && (
                      <p className="text-sm text-red-600 mt-1">
                        {signUpForm.formState.errors.username.message}
                      </p>
                    )}
                  </div>
                </div>

                <div>
                  <Label htmlFor="email" className="text-sm font-medium text-gray-700">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                    <Input
                      id="email"
                      type="email"
                      {...signUpForm.register('email')}
                      className="mt-1.5 h-11 pl-10 transition-all duration-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="Enter your email"
                    />
                  </div>
                  {signUpForm.formState.errors.email && (
                    <p className="text-sm text-red-600 mt-1">
                      {signUpForm.formState.errors.email.message}
                    </p>
                  )}
                </div>

                <div>
                  <Label htmlFor="role" className="text-sm font-medium text-gray-700">I am a...</Label>
                  <Select onValueChange={(value) => signUpForm.setValue('role', value as 'worker' | 'company')}>
                    <SelectTrigger className="mt-1.5 h-11 transition-all duration-200 focus:ring-2 focus:ring-blue-500">
                      <SelectValue placeholder="Select your role" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="worker">
                        <div className="flex items-center py-2">
                          <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center mr-3">
                            <span className="text-lg">👤</span>
                          </div>
                          <div>
                            <div className="font-medium">Freelance Professional</div>
                            <div className="text-xs text-gray-500">Camera operator, sound engineer, etc.</div>
                          </div>
                        </div>
                      </SelectItem>
                      <SelectItem value="company">
                        <div className="flex items-center py-2">
                          <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center mr-3">
                            <span className="text-lg">🏢</span>
                          </div>
                          <div>
                            <div className="font-medium">Company/Employer</div>
                            <div className="text-xs text-gray-500">Production company, event organizer</div>
                          </div>
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
                  <Label htmlFor="password" className="text-sm font-medium text-gray-700">Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      {...signUpForm.register('password')}
                      className="mt-1.5 h-11 pl-10 pr-10 transition-all duration-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="Create a strong password"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-2 top-1/2 transform -translate-y-1/2 h-8 w-8 p-0 hover:bg-gray-100"
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                  {signUpForm.formState.errors.password && (
                    <p className="text-sm text-red-600 mt-1">
                      {signUpForm.formState.errors.password.message}
                    </p>
                  )}
                  <div className="mt-2 space-y-1">
                    <div className="flex items-center text-xs text-gray-500">
                      <div className="w-1 h-1 bg-gray-400 rounded-full mr-2"></div>
                      At least 8 characters
                    </div>
                  </div>
                </div>

                <div>
                  <Label htmlFor="confirmPassword" className="text-sm font-medium text-gray-700">Confirm Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                    <Input
                      id="confirmPassword"
                      type={showConfirmPassword ? "text" : "password"}
                      {...signUpForm.register('confirmPassword')}
                      className="mt-1.5 h-11 pl-10 pr-10 transition-all duration-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="Confirm your password"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-2 top-1/2 transform -translate-y-1/2 h-8 w-8 p-0 hover:bg-gray-100"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    >
                      {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                  {signUpForm.formState.errors.confirmPassword && (
                    <p className="text-sm text-red-600 mt-1">
                      {signUpForm.formState.errors.confirmPassword.message}
                    </p>
                  )}
                </div>

                <Button 
                  type="submit" 
                  className="w-full h-12 bg-gradient-to-r from-blue-600 to-green-500 hover:from-blue-700 hover:to-green-600 text-white font-semibold text-base shadow-lg hover:shadow-xl transition-all duration-200 transform hover:scale-[1.02]" 
                  disabled={loading || socialLoading !== null}
                >
                  {loading ? (
                    <div className="flex items-center">
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-3"></div>
                      Creating Account...
                    </div>
                  ) : (
                    'Create Account'
                  )}
                </Button>
              </form>
            ) : (
              <form onSubmit={signInForm.handleSubmit(onSignIn)} className="space-y-5">
                <div>
                  <Label htmlFor="email" className="text-sm font-medium text-gray-700">Email or Username</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                    <Input
                      id="email"
                      type="email"
                      {...signInForm.register('email')}
                      className="mt-1.5 h-11 pl-10 transition-all duration-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="Enter your email or username"
                    />
                  </div>
                  {signInForm.formState.errors.email && (
                    <p className="text-sm text-red-600 mt-1">
                      {signInForm.formState.errors.email.message}
                    </p>
                  )}
                </div>

                <div>
                  <Label htmlFor="password" className="text-sm font-medium text-gray-700">Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      {...signInForm.register('password')}
                      className="mt-1.5 h-11 pl-10 pr-10 transition-all duration-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="Enter your password"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-2 top-1/2 transform -translate-y-1/2 h-8 w-8 p-0 hover:bg-gray-100"
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                  {signInForm.formState.errors.password && (
                    <p className="text-sm text-red-600 mt-1">
                      {signInForm.formState.errors.password.message}
                    </p>
                  )}
                </div>

                <Button 
                  type="submit" 
                  className="w-full h-12 bg-gradient-to-r from-blue-600 to-green-500 hover:from-blue-700 hover:to-green-600 text-white font-semibold text-base shadow-lg hover:shadow-xl transition-all duration-200 transform hover:scale-[1.02]" 
                  disabled={loading || socialLoading !== null}
                >
                  {loading ? (
                    <div className="flex items-center">
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-3"></div>
                      Signing In...
                    </div>
                  ) : (
                    'Sign In'
                  )}
                </Button>

                <div className="text-center">
                  <Button variant="link" className="text-sm text-blue-600 hover:text-blue-700 font-medium">
                    Forgot your password?
                  </Button>
                </div>
              </form>
            )}

            {/* Security Features */}
            <div className="pt-4 border-t border-gray-100">
              <div className="flex items-center justify-center space-x-6 text-xs text-gray-500">
                <div className="flex items-center">
                  <Shield className="w-3 h-3 mr-1.5" />
                  256-bit SSL
                </div>
                <div className="flex items-center">
                  <CheckCircle className="w-3 h-3 mr-1.5" />
                  GDPR Compliant
                </div>
                <div className="flex items-center">
                  <Lock className="w-3 h-3 mr-1.5" />
                  SOC 2 Certified
                </div>
              </div>
            </div>
          </CardContent>

          <CardFooter className="text-center pb-8 px-8">
            <Button
              variant="link"
              className="w-full text-base"
              onClick={() => setIsSignUp(!isSignUp)}
              disabled={loading || socialLoading !== null}
            >
              {isSignUp 
                ? (
                  <span className="text-gray-600">
                    Already have an account? <span className="text-blue-600 font-medium hover:text-blue-700">Sign in</span>
                  </span>
                )
                : (
                  <span className="text-gray-600">
                    Don't have an account? <span className="text-blue-600 font-medium hover:text-blue-700">Sign up</span>
                  </span>
                )
              }
            </Button>
          </CardFooter>
        </Card>

        {/* Trust Indicators */}
        <div className="mt-8 text-center">
          <p className="text-sm text-gray-500 mb-3 font-medium">Trusted by 10,000+ professionals</p>
          <div className="flex justify-center space-x-8 text-xs text-gray-400">
            <div className="flex flex-col items-center">
              <div className="text-base font-bold text-gray-700">99.9%</div>
              <span>Uptime</span>
            </div>
            <div className="flex flex-col items-center">
              <div className="text-base font-bold text-gray-700">24/7</div>
              <span>Support</span>
            </div>
            <div className="flex flex-col items-center">
              <div className="text-base font-bold text-gray-700">256-bit</div>
              <span>Security</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AuthForm;