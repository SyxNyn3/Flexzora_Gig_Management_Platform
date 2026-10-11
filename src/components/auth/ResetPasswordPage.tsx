import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { ArrowLeft, Eye, EyeOff, Lock, Shield, Zap } from 'lucide-react';

const resetSchema = z.object({
  password: z.string().min(8, 'Password must be at least 8 characters'),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ['confirmPassword'],
});

type ResetForm = z.infer<typeof resetSchema>;

/**
 * Landing target for the Supabase recovery link
 * (`resetPasswordForEmail(redirectTo)`). The client SDK exchanges the token in
 * the URL for a recovery session; once a session exists the user can set a new
 * password via updateUser. Expired/used links get a clear dead-end state with
 * a path back to requesting a fresh one.
 */
const ResetPasswordPage: React.FC = () => {
  const navigate = useNavigate();
  const [status, setStatus] = useState<'checking' | 'ready' | 'invalid'>('checking');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState('');

  const form = useForm<ResetForm>({
    resolver: zodResolver(resetSchema),
    defaultValues: { password: '', confirmPassword: '' },
  });

  useEffect(() => {
    let mounted = true;

    // The session may already be exchanged by detectSessionInUrl, or arrive a
    // tick later via the PASSWORD_RECOVERY event (PKCE code exchange).
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      if (event === 'PASSWORD_RECOVERY' || (event === 'SIGNED_IN' && session)) {
        setStatus('ready');
      }
    });

    supabase.auth.getSession().then(({ data }) => {
      if (mounted && data.session) setStatus('ready');
    });

    // If nothing produced a session shortly after mount, the link is stale.
    const timeout = setTimeout(() => {
      if (mounted) {
        setStatus((s) => (s === 'checking' ? 'invalid' : s));
      }
    }, 4000);

    return () => {
      mounted = false;
      clearTimeout(timeout);
      subscription.unsubscribe();
    };
  }, []);

  const onSubmit = async (data: ResetForm) => {
    setLoading(true);
    setError('');

    try {
      const { error } = await supabase.auth.updateUser({ password: data.password });
      if (error) {
        console.error('Password update error:', error);
        setError(error.message);
        if (error.message.toLowerCase().includes('session')) {
          setStatus('invalid');
        }
      } else {
        toast.success('Password updated', {
          description: 'Your password has been changed. You are signed in.',
        });
        navigate('/dashboard', { replace: true });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center bg-background p-4 overflow-x-hidden">
      <div className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 h-[480px] w-[720px] rounded-full bg-primary/10 blur-3xl" />
      <div className="pointer-events-none absolute bottom-0 right-0 h-[320px] w-[480px] rounded-full bg-secondary/10 blur-3xl" />
      <div className="relative w-full max-w-md">
        <Button
          variant="ghost"
          onClick={() => navigate('/auth')}
          className="mb-6 text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Sign In
        </Button>

        <Card className="shadow-2xl border-border bg-card animate-fade-in">
          <CardHeader className="text-center pb-8 pt-8">
            <div className="flex justify-center mb-6">
              <div className="w-16 h-16 bg-primary rounded-xl flex items-center justify-center shadow-lg shadow-primary/25">
                <Zap className="w-8 h-8 text-primary-foreground" />
              </div>
            </div>
            <CardTitle className="text-3xl font-bold text-foreground mb-2">
              {status === 'invalid' ? 'Link Expired' : 'Set New Password'}
            </CardTitle>
            <CardDescription className="text-base text-muted-foreground max-w-sm mx-auto leading-relaxed">
              {status === 'invalid'
                ? 'This reset link has expired or already been used.'
                : 'Choose a new password for your Flexzora account.'}
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-6 px-8 pb-8">
            {status === 'checking' && (
              <div className="flex justify-center py-6">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
              </div>
            )}

            {status === 'invalid' && (
              <div className="space-y-5 text-center">
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Reset links are single-use and expire after a short window.
                  Request a fresh one from the sign-in page.
                </p>
                <Button
                  className="w-full h-12 bg-primary text-primary-foreground hover:bg-primary/90 font-semibold text-base shadow-lg shadow-primary/25"
                  onClick={() => navigate('/auth')}
                >
                  Request New Reset Link
                </Button>
              </div>
            )}

            {status === 'ready' && (
              <>
                {error && (
                  <Alert variant="destructive" className="bg-destructive/10 border-destructive/30">
                    <AlertDescription className="text-destructive text-sm">{error}</AlertDescription>
                  </Alert>
                )}

                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
                  <div>
                    <Label htmlFor="password" className="text-sm font-medium text-foreground">New Password</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                      <Input
                        id="password"
                        type={showPassword ? 'text' : 'password'}
                        autoComplete="new-password"
                        {...form.register('password')}
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
                    {form.formState.errors.password && (
                      <p className="text-sm text-destructive mt-1">
                        {form.formState.errors.password.message}
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
                        type={showConfirmPassword ? 'text' : 'password'}
                        autoComplete="new-password"
                        {...form.register('confirmPassword')}
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
                    {form.formState.errors.confirmPassword && (
                      <p className="text-sm text-destructive mt-1">
                        {form.formState.errors.confirmPassword.message}
                      </p>
                    )}
                  </div>

                  <Button
                    type="submit"
                    className="w-full h-12 bg-primary text-primary-foreground hover:bg-primary/90 font-semibold text-base shadow-lg shadow-primary/25 hover:shadow-primary/40 transition-all duration-200"
                    disabled={loading}
                  >
                    {loading ? (
                      <div className="flex items-center">
                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary-foreground mr-3"></div>
                        Updating...
                      </div>
                    ) : (
                      'Update Password'
                    )}
                  </Button>
                </form>
              </>
            )}

            <div className="pt-4 border-t border-border">
              <div className="flex items-center justify-center space-x-6 text-xs text-muted-foreground">
                <div className="flex items-center">
                  <Shield className="w-3 h-3 mr-1.5" />
                  256-bit SSL
                </div>
                <div className="flex items-center">
                  <Lock className="w-3 h-3 mr-1.5" />
                  Single-use link
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default ResetPasswordPage;
