import React, { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight, CheckCircle, Copy, Mail, MessageSquare, Share2, Users, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useWaitlistStats } from '@/hooks/useWaitlistStats';
import { supabase } from '@/lib/supabase';
import { WaitlistRoleInterest } from '@/lib/types';
import { COMPANY_TYPES, CREW_ROLES, HEARD_FROM, PAIN_POINTS } from './funnelOptions';

const waitlistSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  role_interest: z.enum(['worker', 'company'], { required_error: 'Please select your role' }),
  market_city: z.string().optional(),
  crew_roles: z.array(z.string()).optional(),
  company_type: z.string().optional(),
  events_per_month: z.coerce.number().optional(),
  typical_crew_size: z.coerce.number().optional(),
  pain_points: z.array(z.string()).optional(),
  heard_from: z.string().optional(),
  beta_tester: z.boolean().optional(),
  production_companies_worked_with: z.string().optional(),
  past_communication_methods: z.string().optional(),
  desired_features: z.string().optional(),
  challenges: z.string().optional(),
});

type WaitlistFormData = z.infer<typeof waitlistSchema>;
type ReferralStatus = { position: number; referral_count: number; beta_tester: boolean };

const shareText = (link: string) =>
  `I joined the Flexzora founding crew for concert and corporate event production crews. Join me for early access: ${link}`;

const WaitlistForm: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const stats = useWaitlistStats();
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [verificationSent, setVerificationSent] = useState(false);
  const [userEmail, setUserEmail] = useState('');
  const [referralCode, setReferralCode] = useState<string | null>(null);
  const [referralStatus, setReferralStatus] = useState<ReferralStatus | null>(null);
  const [referredBy, setReferredBy] = useState<string | null>(null);
  const [utmSource, setUtmSource] = useState<string | null>(null);
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
    defaultValues: { crew_roles: [], pain_points: [], beta_tester: false },
  });
  const role = watch('role_interest');
  const crewRoles = watch('crew_roles') || [];
  const painPoints = watch('pain_points') || [];

  useEffect(() => {
    setReferredBy(searchParams.get('ref'));
    setUtmSource(searchParams.get('utm_source'));
  }, [searchParams]);

  const loadReferralStatus = async (code: string) => {
    const { data } = await supabase.rpc('waitlist_referral_status', { p_code: code });
    if (data) setReferralStatus(data as ReferralStatus);
  };

  const onSubmit = async (data: WaitlistFormData) => {
    setLoading(true);
    setError(null);
    try {
      const { data: responseData, error: responseError } = await supabase.functions.invoke('submit-waitlist', {
        body: { ...data, referred_by_email: referredBy, utm_source: utmSource },
      });
      if (responseError || responseData?.error) throw new Error(responseError?.message || responseData.error);
      const code = responseData.referral_code as string;
      setReferralCode(code);
      if (responseData.verification_required) {
        setUserEmail(data.email);
        setVerificationSent(true);
        toast.success('Verification email sent! Please check your inbox.');
      } else {
        await loadReferralStatus(code);
        setSuccess(true);
        toast.success('You have been added to the founding crew!');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to join the founding crew';
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const resendVerification = async () => {
    if (!userEmail) return;
    setLoading(true);
    setVerificationError(null);
    try {
      const { data, error: invokeError } = await supabase.functions.invoke('resend-waitlist-verification', {
        body: { email: userEmail },
      });
      if (invokeError || data?.error) throw new Error(invokeError?.message || data.error);
      toast.success('Verification email resent!');
    } catch (err) {
      setVerificationError(err instanceof Error ? err.message : 'Failed to resend verification email');
    } finally {
      setLoading(false);
    }
  };

  const referralLink = referralCode ? `${window.location.origin}/waitlist?ref=${referralCode}` : '';
  const copyReferralLink = () => {
    if (!referralLink) return;
    navigator.clipboard.writeText(referralLink);
    toast.success('Referral link copied to clipboard!');
  };
  const openShare = (url: string) => window.open(url, '_blank', 'noopener,noreferrer');
  const toggleValue = (field: 'crew_roles' | 'pain_points', value: string) => {
    const values = field === 'crew_roles' ? crewRoles : painPoints;
    setValue(field, values.includes(value) ? values.filter((item) => item !== value) : [...values, value], {
      shouldDirty: true,
    });
  };

  if (verificationSent) {
    return (
      <PageShell>
        <Card>
          <CardHeader className="text-center">
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-secondary/15">
              <Mail className="h-7 w-7 text-secondary" />
            </div>
            <CardTitle>Check your inbox</CardTitle>
            <CardDescription>We sent a verification link to {userEmail}.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-center">
            {verificationError && (
              <Alert variant="destructive">
                <AlertDescription>{verificationError}</AlertDescription>
              </Alert>
            )}
            <div className="flex flex-col sm:flex-row justify-center gap-3">
              <Button variant="outline" onClick={resendVerification} disabled={loading} className="h-11">
                Resend verification email
              </Button>
              <Button variant="ghost" onClick={() => navigate('/')} className="h-11">
                Return to home
              </Button>
            </div>
          </CardContent>
        </Card>
      </PageShell>
    );
  }

  if (success && referralCode) {
    const text = encodeURIComponent(shareText(referralLink));
    return (
      <PageShell>
        <Card>
          <CardHeader className="text-center">
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-success/15">
              <CheckCircle className="h-8 w-8 text-success" />
            </div>
            <CardTitle>You're in the Founding Crew!</CardTitle>
            <CardDescription>Thanks for helping shape the future of event production.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {referralStatus && (
              <div className="rounded-xl border border-primary/30 bg-primary/10 p-5 text-center">
                <p className="text-2xl font-bold text-primary">You're #{referralStatus.position} in line</p>
                <p className="text-muted-foreground">{referralStatus.referral_count} referrals</p>
                {referralStatus.beta_tester && <Badge className="mt-3">Founding beta tester</Badge>}
              </div>
            )}
            <div className="rounded-xl border border-border p-4">
              <p className="mb-3 text-sm text-muted-foreground">
                Invite concert and corporate event crews to move up together.
              </p>
              <div className="mb-4 flex items-center justify-between gap-2 rounded-lg border border-border bg-muted/60 p-3">
                <code className="truncate text-sm text-foreground/90">{referralLink}</code>
                <Button variant="ghost" size="sm" onClick={copyReferralLink}>
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={copyReferralLink}>
                  <Copy className="mr-2 h-4 w-4" />
                  Copy Link
                </Button>
                <Button variant="outline" size="sm" onClick={() => openShare(`sms:?&body=${text}`)}>
                  <MessageSquare className="mr-2 h-4 w-4" />
                  Text
                </Button>
                <Button variant="outline" size="sm" onClick={() => openShare(`https://wa.me/?text=${text}`)}>
                  <Share2 className="mr-2 h-4 w-4" />
                  WhatsApp
                </Button>
              </div>
            </div>
            <Button onClick={() => navigate('/')} className="h-11 w-full">
              Return to Home
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </CardContent>
        </Card>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <Card>
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary">
            <Zap className="h-7 w-7 text-primary-foreground" strokeWidth={2.5} />
          </div>
          <CardTitle className="text-2xl sm:text-3xl">Join the Founding Crew</CardTitle>
          <CardDescription className="text-base sm:text-lg">
            Flexzora is the operating system for load-in, show call and load-out crews — replacing the Excel sheets and
            text groups. Get early access and help shape it.
          </CardDescription>
          {stats.total > 0 && (
            <Badge variant="outline" className="mx-auto mt-4 w-fit border-border">
              <Users className="mr-2 h-4 w-4 text-primary" />
              {stats.total.toLocaleString()} crew &amp; companies already lined up
            </Badge>
          )}
        </CardHeader>
        <CardContent>
          {referredBy && (
            <Alert className="mb-5 border-secondary/40 bg-secondary/10">
              <AlertDescription>You were referred by a friend — you'll both get priority access.</AlertDescription>
            </Alert>
          )}
          {error && (
            <Alert variant="destructive" className="mb-5">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Email address" error={errors.email?.message}>
                <Input type="email" placeholder="you@example.com" className="h-11" {...register('email')} />
              </Field>
              <div>
                <Label>I am a...</Label>
                <Select
                  onValueChange={(value: WaitlistRoleInterest) =>
                    setValue('role_interest', value, { shouldValidate: true })
                  }
                >
                  <SelectTrigger className="mt-2 h-11">
                    <SelectValue placeholder="Select your role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="worker">Freelance crew member</SelectItem>
                    <SelectItem value="company">Production company</SelectItem>
                  </SelectContent>
                </Select>
                {errors.role_interest && <p className="mt-1 text-sm text-destructive">{errors.role_interest.message}</p>}
              </div>
            </div>
            <Field label="Primary market / city">
              <Input placeholder="Los Angeles, CA" className="h-11" {...register('market_city')} />
            </Field>
            {role === 'worker' && (
              <ChipGroup
                label="What roles do you work?"
                values={CREW_ROLES}
                selected={crewRoles}
                onToggle={(value) => toggleValue('crew_roles', value)}
              />
            )}
            {role === 'company' && (
              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <Label>Company type</Label>
                  <Select onValueChange={(value) => setValue('company_type', value)}>
                    <SelectTrigger className="mt-2 h-11">
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      {COMPANY_TYPES.map((type) => (
                        <SelectItem key={type} value={type}>
                          {type}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Field label="Events per month">
                  <Input type="number" min="0" className="h-11" {...register('events_per_month')} />
                </Field>
                <Field label="Typical crew size">
                  <Input type="number" min="0" className="h-11" {...register('typical_crew_size')} />
                </Field>
              </div>
            )}
            <ChipGroup
              label="Where does it hurt most right now?"
              values={PAIN_POINTS}
              selected={painPoints}
              onToggle={(value) => toggleValue('pain_points', value)}
            />
            <div>
              <Label>How did you hear about us?</Label>
              <Select onValueChange={(value) => setValue('heard_from', value)}>
                <SelectTrigger className="mt-2 h-11">
                  <SelectValue placeholder="Select one" />
                </SelectTrigger>
                <SelectContent>
                  {HEARD_FROM.map((source) => (
                    <SelectItem key={source} value={source}>
                      {source}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <label className="flex items-start gap-3 rounded-xl border border-border bg-muted/40 p-4 cursor-pointer">
              <Checkbox
                checked={watch('beta_tester')}
                onCheckedChange={(checked) => setValue('beta_tester', checked === true)}
              />
              <span className="text-sm">
                Count me in as a founding beta tester — I'll test early builds and give feedback
              </span>
            </label>
            <div className="space-y-4 border-t pt-5">
              <h3 className="text-lg font-semibold">Help us build a better platform</h3>
              <Field label="What production companies have you worked for or do you currently work with?">
                <Textarea rows={3} {...register('production_companies_worked_with')} />
              </Field>
              <Field label="How did your past employers typically reach out to you about gigs?">
                <Textarea rows={3} {...register('past_communication_methods')} />
              </Field>
              <Field label="What features do you wish a gig management platform could offer?">
                <Textarea rows={3} {...register('desired_features')} />
              </Field>
              <Field label="What are your biggest challenges in managing your freelance career/workforce?">
                <Textarea rows={3} {...register('challenges')} />
              </Field>
            </div>
            <Button
              type="submit"
              disabled={loading}
              className="h-12 w-full text-base sm:text-lg font-semibold"
            >
              {loading ? 'Processing...' : 'Join the Founding Crew'}
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
            <p className="text-center text-sm text-muted-foreground">
              By joining, you agree to receive updates about Flexzora. We'll never spam you or share your information.
            </p>
          </form>
        </CardContent>
      </Card>
    </PageShell>
  );
};

const PageShell: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="relative min-h-screen bg-background px-4 py-10 sm:px-6 sm:py-16 lg:px-8 overflow-x-hidden">
    <div className="absolute inset-0 pointer-events-none" aria-hidden>
      <div className="absolute -top-32 -left-32 w-[600px] h-[400px] bg-primary/[0.08] rounded-full blur-[110px]" />
      <div className="absolute -bottom-40 -right-32 w-[500px] h-[400px] bg-secondary/[0.05] rounded-full blur-[110px]" />
    </div>
    <div className="relative mx-auto max-w-3xl">
      <a href="/" className="mb-8 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
        <span className="flex h-6 w-6 items-center justify-center rounded-md bg-primary">
          <Zap className="h-3.5 w-3.5 text-primary-foreground" strokeWidth={2.5} />
        </span>
        Flexzora
      </a>
      {children}
    </div>
  </div>
);
const Field: React.FC<{ label: string; error?: string; children: React.ReactNode }> = ({ label, error, children }) => (
  <div>
    <Label>{label}</Label>
    <div className="mt-2">{children}</div>
    {error && <p className="mt-1 text-sm text-destructive">{error}</p>}
  </div>
);
const ChipGroup: React.FC<{
  label: string;
  values: readonly (string | { value: string; label: string })[];
  selected: string[];
  onToggle: (value: string) => void;
}> = ({ label, values, selected, onToggle }) => (
  <div>
    <Label>{label}</Label>
    <div className="mt-2 flex flex-wrap gap-2">
      {values.map((item) => {
        const value = typeof item === 'string' ? item : item.value;
        const text = typeof item === 'string' ? item : item.label;
        return (
          <Button
            key={value}
            type="button"
            variant={selected.includes(value) ? 'default' : 'outline'}
            size="sm"
            className="rounded-full"
            onClick={() => onToggle(value)}
          >
            {text}
          </Button>
        );
      })}
    </div>
  </div>
);

export default WaitlistForm;
