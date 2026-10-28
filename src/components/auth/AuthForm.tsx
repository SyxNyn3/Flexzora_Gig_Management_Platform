import React, { useEffect, useState } from 'react';
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
import { Mail, Apple, Chrome, ArrowLeft, Shield, CircleCheck as CheckCircle, Eye, EyeOff, Zap, Lock, MailCheck } from 'lucide-react';

// OAuth providers render only when the matching flag is set — a button that
// errors because the provider was never configured is worse than no button.
const GOOGLE_AUTH_ENABLED = import.meta.env.VITE_ENABLE_GOOGLE_AUTH === 'true';
const APPLE_AUTH_ENABLED = import.meta.env.VITE_ENABLE_APPLE_AUTH === 'true';

type AuthView = 'signin' | 'signup' | 'forgot' | 'check-email';

const forgotSchema = z.object({
  email: z.string().email('Invalid email address'),
});
type ForgotForm = z.infer<typeof forgotSchema>;

// Map Supabase auth errors to copy that matches the rest of the app.
const friendlyAuthError = (message: string): string => {
  const m = message.toLowerCase();
  if (m.includes('invalid login credentials')) {
    return 'Incorrect email or password. Try again, or reset your password below.';
  }
  if (m.includes('email not confirmed')) {
    return 'Your email is not verified yet — check your inbox for the confirmation link.';
  }
  if (m.includes('user already registered') || m.includes('already been registered')) {
    return 'That email is already registered. Sign in instead, or reset your password.';
  }
  if (m.includes('rate limit') || m.includes('too many requests')) {
    return 'Too many attempts — wait a minute and try again.';
  }
  if (m.includes('user not found')) {
    return 'No account found for that username or email.';
  }
  if (m.includes('password should be')) {
    return message;
  }
  return message;
};

const signInSchema = z.object({
  // Accepts a username or an email — emails must look like emails, anything
  // else just needs to be non-trivial. Username lookup happens at sign-in.
  email: z.string().min(3, 'Enter your email or username').refine(
    (v) => !v.includes('@') || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
    'Invalid email address'
  ),
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
  const [view, setView] = useState<AuthView>(searchParams.get('mode') === 'signup' ? 'signup' : 'signin');
  const isSignUp = view === 'signup';
  const [loading, setLoading] = useState(false);
  const [socialLoading, setSocialLoading] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState('');
  const [checkEmail, setCheckEmail] = useState<{ email: string; kind: 'signup' | 'reset' } | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [emailNotConfirmed, setEmailNotConfirmed] = useState<string | null>(null);
  const { signIn, signUp } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setTimeout(() => setResendCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);

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

  const forgotForm = useForm<ForgotForm>({
    resolver: zodResolver(forgotSchema),
    defaultValues: { email: '' },
  });

  const onSignIn = async (data: SignInForm) => {
    setLoading(true);
    setError('');
    setEmailNotConfirmed(null);

    try {
      const { error } = await signIn(data.email, data.password);

      if (error) {
        console.error('Sign in error:', error);
        if (error.message.toLowerCase().includes('email not confirmed')) {
          // Only offer resend when we can resend to — signup resend needs an
          // email address, not a username.
          setEmailNotConfirmed(data.email.includes('@') ? data.email : null);
        }
        setError(friendlyAuthError(error.message));
      } else {
        toast.success('Welcome back!', {
          description: 'You have been signed in successfully.',
        });
        // Navigate immediately to prevent blank screen
        navigate('/dashboard', { replace: true });
      }
    } catch (err) {
      setError(friendlyAuthError(err instanceof Error ? err.message : 'An error occurred during sign in'));
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

      const { data: signUpData, error } = await signUp(data.email, data.password, {
        full_name: data.fullName,
        username: data.username,
        role: data.role,
      });

      if (error) {
        console.error('Sign up error:', error);
        setError(friendlyAuthError(error.message));
      } else if (signUpData?.session) {
        // Email confirmation disabled on the project — session exists, go in.
        toast.success('Account created successfully!', {
          description: 'Welcome to FlexZora! Your account has been created.',
        });
        navigate('/dashboard', { replace: true });
      } else {
        // Email verification is ON: no session until the link in their inbox
        // is clicked. Show the check-email state instead of dumping them on a
        // dashboard they can't reach.
        setCheckEmail({ email: data.email, kind: 'signup' });
        setView('check-email');
      }
    } catch (err) {
      setError(friendlyAuthError(err instanceof Error ? err.message : 'An error occurred during sign up'));
      console.error('Sign up exception:', err);
    } finally {
      setLoading(false);
    }
  };

  const onForgot = async (data: ForgotForm) => {
    setLoading(true);
    setError('');

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(data.email, {
        redirectTo: `${window.location.origin}${import.meta.env.BASE_URL}reset-password`,
      });

      if (error) {
        console.error('Password reset error:', error);
        setError(friendlyAuthError(error.message));
      } else {
        // Always show the sent state — never confirm whether the email exists.
        setCheckEmail({ email: data.email, kind: 'reset' });
        setView('check-email');
      }
    } catch (err) {
      setError(friendlyAuthError(err instanceof Error ? err.message : 'An error occurred'));
      console.error('Password reset exception:', err);
    } finally {
      setLoading(false);
    }
  };

  const resendVerification = async (email: string) => {
    if (resendCooldown > 0) return;
    const { error } = await supabase.auth.resend({ type: 'signup', email });
    if (error) {
      console.error('Resend verification error:', error);
      toast.error(friendlyAuthError(error.message));
      return;
    }
    setResendCooldown(60);
    toast.success('Verification email sent', { description: `Sent to ${email}` });
  };

  const handleSocialLogin = async (provider: 'google' | 'apple') => {
    setSocialLoading(provider);
    setError('');

    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: provider,
        options: {
          redirectTo: `${window.location.origin}${import.meta.env.BASE_URL}dashboard`,
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
    } catch (err) {
      console.error(`${provider} login error:`, err);
      setError(err instanceof Error ? err.message : `Failed to sign in with ${provider}`);
      setSocialLoading(null);
    }
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center bg-background p-4 overflow-x-hidden">
      <div className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 h-[480px] w-[720px] rounded-full bg-primary/10 blur-3xl" />
      <div className="pointer-events-none absolute bottom-0 right-0 h-[320px] w-[480px] rounded-full bg-secondary/10 blur-3xl" />
      <div className="relative w-full max-w-md">
        {/* Back to Home Button */}
        <Button
          variant="ghost"
          onClick={() => navigate('/')}
          className="mb-6 text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Home
        </Button>

        <Card className="shadow-2xl border-border bg-card animate-fade-in">
          <CardHeader className="text-center pb-8 pt-8">
            <div className="flex justify-center mb-6">
              <div className="w-16 h-16 bg-primary rounded-xl flex items-center justify-center shadow-lg shadow-primary/25">
                <Zap className="w-8 h-8 text-primary-foreground" />
              </div>
            </div>
            <CardTitle className="text-3xl font-bold text-foreground mb-2">
              {view === 'signup' && 'Join Flexzora'}
              {view === 'signin' && 'Welcome Back'}
              {view === 'forgot' && 'Reset Password'}
              {view === 'check-email' && 'Check Your Email'}
            </CardTitle>
            <CardDescription className="text-base text-muted-foreground max-w-sm mx-auto leading-relaxed">
              {view === 'signup' && 'Claim your spot on the call sheet — built for live-event crews'}
              {view === 'signin' && 'Sign in to your Flexzora account and get back on the call sheet'}
              {view === 'forgot' && 'Enter your account email and we will send you a reset link'}
              {view === 'check-email' && checkEmail?.kind === 'signup' &&
                `We sent a verification link to ${checkEmail.email}. Click it to activate your account.`}
              {view === 'check-email' && checkEmail?.kind === 'reset' &&
                `If an account exists for ${checkEmail.email}, a password reset link is on its way.`}
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-6 px-8">
            {/* Social Login Buttons — only providers that are actually configured */}
            {(GOOGLE_AUTH_ENABLED || APPLE_AUTH_ENABLED) && view !== 'check-email' && (
              <div className="space-y-3">
                {GOOGLE_AUTH_ENABLED && (
                  <Button
                    variant="outline"
                    onClick={() => handleSocialLogin('google')}
                    disabled={socialLoading !== null || loading}
                    className="w-full h-12 text-foreground border-border hover:bg-muted hover:border-border transition-all duration-200 font-medium"
                  >
                    {socialLoading === 'google' ? (
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-foreground"></div>
                    ) : (
                      <>
                        <Chrome className="w-5 h-5 mr-3" />
                        Continue with Google
                      </>
                    )}
                  </Button>
                )}

                {APPLE_AUTH_ENABLED && (
                  <Button
                    variant="outline"
                    onClick={() => handleSocialLogin('apple')}
                    disabled={socialLoading !== null || loading}
                    className="w-full h-12 text-foreground border-border hover:bg-muted hover:border-border transition-all duration-200 font-medium"
                  >
                    {socialLoading === 'apple' ? (
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-foreground"></div>
                    ) : (
                      <>
                        <Apple className="w-5 h-5 mr-3" />
                        Continue with Apple
                      </>
                    )}
                  </Button>
                )}

                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t border-border" />
                  </div>
                  <div className="relative flex justify-center text-sm uppercase">
                    <span className="bg-card px-4 text-muted-foreground font-medium tracking-wide">Or continue with email</span>
                  </div>
                </div>
              </div>
            )}

            {/* Error Display */}
            {error && (
              <Alert variant="destructive" className="bg-destructive/10 border-destructive/30">
                <AlertDescription className="text-destructive text-sm">
                  {error}
                  {emailNotConfirmed && (
                    <Button
                      variant="link"
                      className="text-sm text-destructive underline font-medium p-0 h-auto ml-1"
                      disabled={resendCooldown > 0}
                      onClick={() => resendVerification(emailNotConfirmed)}
                    >
                      {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend verification email'}
                    </Button>
                  )}
                </AlertDescription>
              </Alert>
            )}

            {/* Check-email state (post-signup verification / reset link sent) */}
            {view === 'check-email' && checkEmail && (
              <div className="space-y-5 text-center">
                <div className="flex justify-center">
                  <div className="w-14 h-14 bg-secondary/15 rounded-full flex items-center justify-center">
                    <MailCheck className="w-7 h-7 text-secondary" />
                  </div>
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {checkEmail.kind === 'signup'
                    ? 'Open the email and click the verification link. It may take a minute — check spam if you do not see it.'
                    : 'Open the email and click the reset link. It may take a minute — check spam if you do not see it.'}
                </p>
                {checkEmail.kind === 'signup' && (
                  <Button
                    variant="outline"
                    className="w-full h-11"
                    disabled={resendCooldown > 0}
                    onClick={() => resendVerification(checkEmail.email)}
                  >
                    {resendCooldown > 0 ? `Resend available in ${resendCooldown}s` : 'Resend verification email'}
                  </Button>
                )}
                <Button
                  variant="link"
                  className="text-sm text-primary hover:text-primary/80 font-medium"
                  onClick={() => { setView('signin'); setError(''); }}
                >
                  Back to sign in
                </Button>
              </div>
            )}

            {/* Forgot password form */}
            {view === 'forgot' && (
              <form onSubmit={forgotForm.handleSubmit(onForgot)} className="space-y-5">
                <div>
                  <Label htmlFor="forgot-email" className="text-sm font-medium text-foreground">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                    <Input
                      id="forgot-email"
                      type="email"
                      {...forgotForm.register('email')}
                      className="mt-1.5 h-11 pl-10 transition-all duration-200 focus:ring-2 focus:ring-primary focus:border-transparent"
                      placeholder="Enter your account email"
                    />
                  </div>
                  {forgotForm.formState.errors.email && (
                    <p className="text-sm text-destructive mt-1">
                      {forgotForm.formState.errors.email.message}
                    </p>
                  )}
                </div>

                <Button
                  type="submit"
                  className="w-full h-12 bg-primary text-primary-foreground hover:bg-primary/90 font-semibold text-base shadow-lg shadow-primary/25 hover:shadow-primary/40 transition-all duration-200"
                  disabled={loading || socialLoading !== null}
                >
                  {loading ? (
                    <div className="flex items-center">
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary-foreground mr-3"></div>
                      Sending Link...
                    </div>
                  ) : (
                    'Send Reset Link'
                  )}
                </Button>
              </form>
            )}

            {/* Email/Password Forms */}
            {isSignUp && (
              <form onSubmit={signUpForm.handleSubmit(onSignUp)} className="space-y-5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="fullName" className="text-sm font-medium text-foreground">Full Name</Label>
                    <Input
                      id="fullName"
                      type="text"
                      {...signUpForm.register('fullName')}
                      className="mt-1.5 h-11 transition-all duration-200 focus:ring-2 focus:ring-primary focus:border-transparent"
                      placeholder="Enter your full name"
                    />
                    {signUpForm.formState.errors.fullName && (
                      <p className="text-sm text-destructive mt-1">
                        {signUpForm.formState.errors.fullName.message}
                      </p>
                    )}
                  </div>

                  <div>
                    <Label htmlFor="username" className="text-sm font-medium text-foreground">Username</Label>
                    <Input
                      id="username"
                      type="text"
                      {...signUpForm.register('username')}
                      className="mt-1.5 h-11 transition-all duration-200 focus:ring-2 focus:ring-primary focus:border-transparent"
                      placeholder="Choose a unique username"
                    />
                    {signUpForm.formState.errors.username && (
                      <p className="text-sm text-destructive mt-1">
                        {signUpForm.formState.errors.username.message}
                      </p>
                    )}
                  </div>
                </div>

                <div>
                  <Label htmlFor="email" className="text-sm font-medium text-foreground">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                    <Input
                      id="email"
                      type="email"
                      {...signUpForm.register('email')}
                      className="mt-1.5 h-11 pl-10 transition-all duration-200 focus:ring-2 focus:ring-primary focus:border-transparent"
                      placeholder="Enter your email"
                    />
                  </div>
                  {signUpForm.formState.errors.email && (
                    <p className="text-sm text-destructive mt-1">
                      {signUpForm.formState.errors.email.message}
                    </p>
                  )}
                </div>

                <div>
                  <Label htmlFor="role" className="text-sm font-medium text-foreground">I am a...</Label>
                  <Select onValueChange={(value) => signUpForm.setValue('role', value as 'worker' | 'company', { shouldValidate: true })}>
                    <SelectTrigger className="mt-1.5 h-11 transition-all duration-200 focus:ring-2 focus:ring-primary">
                      <SelectValue placeholder="Select your role" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="worker">
                        <div className="flex items-center py-2">
                          <div className="w-8 h-8 bg-secondary/15 rounded-lg flex items-center justify-center mr-3">
                            <span className="text-lg">👤</span>
                          </div>
                          <div>
                            <div className="font-medium">Crew Member</div>
                            <div className="text-xs text-muted-foreground">Stagehand, A1, L2, rigger, video lead</div>
                          </div>
                        </div>
                      </SelectItem>
                      <SelectItem value="company">
                        <div className="flex items-center py-2">
                          <div className="w-8 h-8 bg-primary/15 rounded-lg flex items-center justify-center mr-3">
                            <span className="text-lg">🏟️</span>
                          </div>
                          <div>
                            <div className="font-medium">Production Company</div>
                            <div className="text-xs text-muted-foreground">Promoters, AV providers, labor brokers</div>
                          </div>
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  {signUpForm.formState.errors.role && (
                    <p className="text-sm text-destructive mt-1">
                      {signUpForm.formState.errors.role.message}
                    </p>
                  )}
                </div>

                <div>
                  <Label htmlFor="password" className="text-sm font-medium text-foreground">Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      {...signUpForm.register('password')}
                      className="mt-1.5 h-11 pl-10 pr-10 transition-all duration-200 focus:ring-2 focus:ring-primary focus:border-transparent"
                      placeholder="Create a strong password"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-2 top-1/2 transform -translate-y-1/2 h-8 w-8 p-0 hover:bg-muted"
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                  {signUpForm.formState.errors.password && (
                    <p className="text-sm text-destructive mt-1">
                      {signUpForm.formState.errors.password.message}
                    </p>
                  )}
                  <div className="mt-2 space-y-1">
                    <div className="flex items-center text-xs text-muted-foreground">
                      <div className="w-1 h-1 bg-muted-foreground rounded-full mr-2"></div>
                      At least 8 characters
                    </div>
                  </div>
                </div>

                <div>
                  <Label htmlFor="confirmPassword" className="text-sm font-medium text-foreground">Confirm Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                    <Input
                      id="confirmPassword"
                      type={showConfirmPassword ? "text" : "password"}
                      {...signUpForm.register('confirmPassword')}
                      className="mt-1.5 h-11 pl-10 pr-10 transition-all duration-200 focus:ring-2 focus:ring-primary focus:border-transparent"
                      placeholder="Confirm your password"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-2 top-1/2 transform -translate-y-1/2 h-8 w-8 p-0 hover:bg-muted"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    >
                      {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                  {signUpForm.formState.errors.confirmPassword && (
                    <p className="text-sm text-destructive mt-1">
                      {signUpForm.formState.errors.confirmPassword.message}
                    </p>
                  )}
                </div>

                <Button 
                  type="submit" 
                  className="w-full h-12 bg-primary text-primary-foreground hover:bg-primary/90 font-semibold text-base shadow-lg shadow-primary/25 hover:shadow-primary/40 transition-all duration-200" 
                  disabled={loading || socialLoading !== null}
                >
                  {loading ? (
                    <div className="flex items-center">
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary-foreground mr-3"></div>
                      Creating Account...
                    </div>
                  ) : (
                    'Create Account'
                  )}
                </Button>
              </form>
            )}
            {view === 'signin' && (
              <form onSubmit={signInForm.handleSubmit(onSignIn)} className="space-y-5">
                <div>
                  <Label htmlFor="email" className="text-sm font-medium text-foreground">Email or Username</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                    <Input
                      id="email"
                      type="text"
                      autoComplete="username"
                      {...signInForm.register('email')}
                      className="mt-1.5 h-11 pl-10 transition-all duration-200 focus:ring-2 focus:ring-primary focus:border-transparent"
                      placeholder="Enter your email or username"
                    />
                  </div>
                  {signInForm.formState.errors.email && (
                    <p className="text-sm text-destructive mt-1">
                      {signInForm.formState.errors.email.message}
                    </p>
                  )}
                </div>

                <div>
                  <Label htmlFor="password" className="text-sm font-medium text-foreground">Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      {...signInForm.register('password')}
                      className="mt-1.5 h-11 pl-10 pr-10 transition-all duration-200 focus:ring-2 focus:ring-primary focus:border-transparent"
                      placeholder="Enter your password"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-2 top-1/2 transform -translate-y-1/2 h-8 w-8 p-0 hover:bg-muted"
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                  {signInForm.formState.errors.password && (
                    <p className="text-sm text-destructive mt-1">
                      {signInForm.formState.errors.password.message}
                    </p>
                  )}
                </div>

                <Button 
                  type="submit" 
                  className="w-full h-12 bg-primary text-primary-foreground hover:bg-primary/90 font-semibold text-base shadow-lg shadow-primary/25 hover:shadow-primary/40 transition-all duration-200" 
                  disabled={loading || socialLoading !== null}
                >
                  {loading ? (
                    <div className="flex items-center">
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary-foreground mr-3"></div>
                      Signing In...
                    </div>
                  ) : (
                    'Sign In'
                  )}
                </Button>

                <div className="text-center">
                  <Button
                    type="button"
                    variant="link"
                    className="text-sm text-primary hover:text-primary/80 font-medium"
                    onClick={() => { setView('forgot'); setError(''); }}
                  >
                    Forgot your password?
                  </Button>
                </div>
              </form>
            )}

            {/* Security Features */}
            <div className="pt-4 border-t border-border">
              <div className="flex items-center justify-center space-x-6 text-xs text-muted-foreground">
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
            {(view === 'signin' || view === 'signup') && (
              <Button
                variant="link"
                className="w-full text-base"
                onClick={() => { setView(isSignUp ? 'signin' : 'signup'); setError(''); }}
                disabled={loading || socialLoading !== null}
              >
                {isSignUp
                  ? (
                    <span className="text-muted-foreground">
                      Already have an account? <span className="text-primary font-medium hover:text-primary/80">Sign in</span>
                    </span>
                  )
                  : (
                    <span className="text-muted-foreground">
                      Don't have an account? <span className="text-primary font-medium hover:text-primary/80">Sign up</span>
                    </span>
                  )
                }
              </Button>
            )}
            {view === 'forgot' && (
              <Button
                variant="link"
                className="w-full text-base"
                onClick={() => { setView('signin'); setError(''); }}
                disabled={loading || socialLoading !== null}
              >
                <span className="text-muted-foreground">
                  Remembered it? <span className="text-primary font-medium hover:text-primary/80">Back to sign in</span>
                </span>
              </Button>
            )}
          </CardFooter>
        </Card>

        {/* Trust Indicators */}
        <div className="mt-8 text-center">
          <p className="text-sm text-muted-foreground mb-3 font-medium">Built for live-event crews and production companies</p>
          <div className="flex justify-center space-x-8 text-xs text-muted-foreground">
            <div className="flex flex-col items-center">
              <div className="text-base font-bold text-foreground">99.9%</div>
              <span>Uptime</span>
            </div>
            <div className="flex flex-col items-center">
              <div className="text-base font-bold text-foreground">24/7</div>
              <span>Support</span>
            </div>
            <div className="flex flex-col items-center">
              <div className="text-base font-bold text-foreground">256-bit</div>
              <span>Security</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AuthForm;