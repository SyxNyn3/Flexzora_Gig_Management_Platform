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
import { toast } from 'sonner';

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
      role: undefined,
    },
  });

  const onSignIn = async (data: SignInForm) => {
    setLoading(true);
    setError('');

    try {
      const { error } = await signIn(data.email, data.password);

      if (error) {
        setError(error.message);
      } else {
        toast.success('Signed in successfully!');
        navigate('/dashboard');
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred during sign in');
    } finally {
      setLoading(false);
    }
  };

  const onSignUp = async (data: SignUpForm) => {
    setLoading(true);
    setError('');

    try {
      const { error } = await signUp(data.email, data.password, {
        full_name: data.fullName,
        role: data.role,
      });

      if (error) {
        setError(error.message);
      } else {
        toast.success('Account created successfully!');
        // For demo mode, redirect immediately
        navigate('/dashboard');
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred during sign up');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-green-50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
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

        <CardContent>
          {error && (
            <Alert className="mb-4 border-red-200 bg-red-50">
              <AlertDescription className="text-red-800">{error}</AlertDescription>
            </Alert>
          )}

          {isSignUp ? (
            <form onSubmit={signUpForm.handleSubmit(onSignUp)} className="space-y-4">
              <div>
                <Label htmlFor="fullName">Full Name</Label>
                <Input
                  id="fullName"
                  type="text"
                  {...signUpForm.register('fullName')}
                  className="mt-1"
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
                  className="mt-1"
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
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select your role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="worker">Freelance Worker</SelectItem>
                    <SelectItem value="company">Company/Employer</SelectItem>
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
                  className="mt-1"
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
                  className="mt-1"
                />
                {signUpForm.formState.errors.confirmPassword && (
                  <p className="text-sm text-red-600 mt-1">
                    {signUpForm.formState.errors.confirmPassword.message}
                  </p>
                )}
              </div>

              <Button type="submit" className="w-full bg-gradient-to-r from-blue-600 to-green-500" disabled={loading}>
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
                  className="mt-1"
                  placeholder="demo@flexora.com"
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
                  className="mt-1"
                  placeholder="password"
                />
                {signInForm.formState.errors.password && (
                  <p className="text-sm text-red-600 mt-1">
                    {signInForm.formState.errors.password.message}
                  </p>
                )}
              </div>

              <div className="bg-blue-50 p-3 rounded-lg text-sm text-blue-800">
                <strong>Demo Mode:</strong> Use any email and password to explore the platform
              </div>

              <Button type="submit" className="w-full bg-gradient-to-r from-blue-600 to-green-500" disabled={loading}>
                {loading ? 'Signing In...' : 'Sign In'}
              </Button>
            </form>
          )}
        </CardContent>

        <CardFooter className="text-center">
          <Button
            variant="link"
            className="w-full"
            onClick={() => setIsSignUp(!isSignUp)}
          >
            {isSignUp 
              ? 'Already have an account? Sign in' 
              : "Don't have an account? Sign up"
            }
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
};

export default AuthForm;