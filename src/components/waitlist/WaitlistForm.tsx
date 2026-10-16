import React, { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight, CheckCircle, Copy, Mail, MessageSquare, Plus, Share2, Users, X } from 'lucide-react';
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
import { BUSINESS_ARRANGEMENTS, CALL_RESPONSE, COMPANY_TYPES, CREW_ROLES, CREW_SKILLS, DEPARTURE_NOTICE, EXPERIENCE_LEVELS, FARTHEST_TRAVEL, HEARD_FROM, PAIN_POINTS, PAYMENT_TYPES, REGIONS, TRAVEL_OPTIONS, VEHICLE_TYPES, WORKER_PAIN_POINTS } from './funnelOptions';

const waitlistSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  confirm_email: z.string(),
  full_name: z.string().min(2, 'Tell us your name'),
  phone: z.string().optional(),
  sms_consent: z.boolean().optional(),
  role_interest: z.enum(['worker', 'company'], { required_error: 'Please select your role' }),
  market_city: z.string().optional(),
  crew_roles: z.array(z.string()).optional(),
  skills: z.array(z.string()).optional(),
  experience_years: z.string().optional(),
  travel_availability: z.array(z.string()).optional(),
  union_affiliation: z.string().optional(),
  has_vehicle: z.boolean().optional(),
  companies_worked: z.array(z.object({ name: z.string(), current: z.boolean() })).optional(),
  markets_worked: z.array(z.string()).optional(),
  favorite_markets: z.array(z.string()).max(3).optional(),
  preferred_regions: z.array(z.string()).optional(),
  preferred_areas: z.array(z.string()).optional(),
  has_own_business: z.boolean().optional(),
  business_names: z.array(z.string()).optional(),
  business_arrangement: z.string().optional(),
  vehicles: z.array(z.string()).optional(),
  farthest_travel: z.string().optional(),
  willing_farther: z.boolean().optional(),
  has_passport: z.boolean().optional(),
  overseas_willing: z.boolean().optional(),
  departure_readiness: z.string().optional(),
  call_response_time: z.string().optional(),
  payment_type: z.string().optional(),
  referred_crew: z.string().optional(),
  day_rate_min: z.coerce.number().optional(),
  instagram_handle: z.string().optional(),
  company_name: z.string().optional(),
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
}).refine((data) => data.email.trim().toLowerCase() === data.confirm_email.trim().toLowerCase(), {
  message: 'Email addresses do not match',
  path: ['confirm_email'],
});

/* rough completeness score — feeds the "get ahead" ordering on the backend */
const computeCompleteness = (d: WaitlistFormData) =>
  Math.round(
    ([
      d.full_name, d.phone, d.market_city, d.crew_roles?.length, d.skills?.length,
      d.experience_years, d.travel_availability?.length, d.union_affiliation,
      d.vehicles?.length, d.day_rate_min, d.instagram_handle, d.company_name,
      d.companies_worked?.length, d.markets_worked?.length, d.favorite_markets?.length,
      d.preferred_regions?.length, d.preferred_areas?.length, d.farthest_travel, d.has_passport,
      d.has_own_business, d.business_names?.length,
      d.call_response_time, d.payment_type, d.sms_consent,
    ].filter(Boolean).length /
      24) *
      100,
  );

type WaitlistFormData = z.infer<typeof waitlistSchema>;
type ReferralStatus = { position: number; referral_count: number };

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
  /* bot friction — honeypot input + minimum time-on-form. Legit humans
     can't fill an invisible field and can't complete this form in <2s. */
  const [honeypot, setHoneypot] = useState('');
  const [mountedAt] = useState(() => Date.now());
  /* ?role=worker|company — deep links like "join as crew" preselect the track */
  const roleParam = searchParams.get('role');
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<WaitlistFormData>({
    resolver: zodResolver(waitlistSchema),
    defaultValues: {
      role_interest: roleParam === 'worker' || roleParam === 'company' ? roleParam : undefined,
      crew_roles: [], skills: [], travel_availability: [], pain_points: [],
      companies_worked: [], markets_worked: [], favorite_markets: [],
      preferred_regions: [], preferred_areas: [], vehicles: [], business_names: [],
      beta_tester: false, sms_consent: false,
    },
  });
  const role = watch('role_interest');
  const crewRoles = watch('crew_roles') || [];
  const skills = watch('skills') || [];
  const travelAvailability = watch('travel_availability') || [];
  const painPoints = watch('pain_points') || [];
  const companies = watch('companies_worked') || [];
  const marketsWorked = watch('markets_worked') || [];
  const favoriteMarkets = watch('favorite_markets') || [];
  const preferredRegions = watch('preferred_regions') || [];
  const preferredAreas = watch('preferred_areas') || [];
  const vehicles = watch('vehicles') || [];
  const hasOwnBusiness = watch('has_own_business');
  const businessNames = watch('business_names') || [];
  const hasPassport = watch('has_passport');
  const overseasWilling = watch('overseas_willing');
  const phone = watch('phone') || '';
  const completeness = computeCompleteness(watch());

  useEffect(() => {
    setReferredBy(searchParams.get('ref'));
    setUtmSource(searchParams.get('utm_source'));
  }, [searchParams]);

  const loadReferralStatus = async (code: string) => {
    const { data } = await supabase.rpc('waitlist_referral_status', { p_code: code });
    if (data) setReferralStatus(data as ReferralStatus);
  };

  const onSubmit = async (data: WaitlistFormData) => {
    /* bots that trip the honeypot or submit instantly get a silent fake
       success — no write, no error, nothing to adapt to */
    if (honeypot || Date.now() - mountedAt < 2000) {
      setSuccess(true);
      setReferralCode('thanks');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const payload = {
        ...data,
        referred_by_email: referredBy,
        utm_source: utmSource,
        profile_completeness: computeCompleteness(data),
      };
      /* workers answer the structured roster — keep the legacy text column
         readable for admin views that still scan it */
      if ((payload.companies_worked?.length || payload.business_names?.length) && !payload.production_companies_worked_with) {
        payload.production_companies_worked_with = [
          ...(payload.companies_worked ?? []).map((c) => `${c.name}${c.current ? ' (current)' : ''}`),
          ...(payload.business_names ?? []).map((b) => `${b} (own business)`),
        ].join(', ');
      }
      payload.has_vehicle = (payload.vehicles?.length ?? 0) > 0 ? true : payload.has_vehicle;
      payload.has_own_business = (payload.business_names?.length ?? 0) > 0 ? true : payload.has_own_business;
      const { data: responseData, error: responseError } = await supabase.functions.invoke('submit-waitlist', {
        body: payload,
      });
      if (responseError || responseData?.error) throw new Error(responseError?.message || responseData.error);
      /* the deployed function may lag the schema — the crew-card RPC completes
         the row it just inserted. First-write-wins: a no-op once the function
         persists these fields itself, and locked against anonymous overwrites. */
      const { error: fillError } = await supabase.rpc('waitlist_fill_crew_card', {
        p_email: data.email,
        p_full_name: payload.full_name,
        p_phone: payload.phone,
        p_sms_consent: payload.sms_consent,
        p_skills: payload.skills,
        p_experience_years: payload.experience_years,
        p_travel_availability: payload.travel_availability,
        p_union_affiliation: payload.union_affiliation,
        p_vehicles: payload.vehicles,
        p_has_vehicle: payload.has_vehicle,
        p_day_rate_min: payload.day_rate_min,
        p_instagram_handle: payload.instagram_handle,
        p_company_name: payload.company_name,
        p_profile_completeness: payload.profile_completeness,
        p_companies_worked: payload.companies_worked,
        p_markets_worked: payload.markets_worked,
        p_favorite_markets: payload.favorite_markets,
        p_preferred_regions: payload.preferred_regions,
        p_preferred_areas: payload.preferred_areas,
        p_farthest_travel: payload.farthest_travel,
        p_willing_farther: payload.willing_farther,
        p_has_passport: payload.has_passport,
        p_overseas_willing: payload.overseas_willing,
        p_departure_readiness: payload.departure_readiness,
        p_call_response_time: payload.call_response_time,
        p_payment_type: payload.payment_type,
        p_referred_crew: payload.referred_crew,
        p_has_own_business: payload.has_own_business,
        p_business_names: payload.business_names,
        p_business_arrangement: payload.business_arrangement,
      });
      if (fillError) console.warn('crew card fill failed — fields will sync once the function deploys', fillError);
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
  const toggleValue = (
    field:
      | 'crew_roles' | 'pain_points' | 'skills' | 'travel_availability'
      | 'vehicles' | 'preferred_regions',
    value: string,
  ) => {
    const values = (watch(field) as string[] | undefined) || [];
    setValue(field, values.includes(value) ? values.filter((item) => item !== value) : [...values, value], {
      shouldDirty: true,
    });
  };

  /* tap a worked-market chip to flag it top-3; tap again to release it */
  const toggleFavoriteMarket = (market: string) => {
    if (favoriteMarkets.includes(market)) {
      setValue('favorite_markets', favoriteMarkets.filter((m) => m !== market), { shouldDirty: true });
    } else if (favoriteMarkets.length < 3) {
      setValue('favorite_markets', [...favoriteMarkets, market], { shouldDirty: true });
    } else {
      toast.info('Top 3 only — tap one of your picks to swap it out');
    }
  };

  if (verificationSent) {
    return (
      <PageShell>
        <Card className="rounded-none border-0 bg-zinc-900/70 shadow-2xl backdrop-blur sm:rounded-2xl sm:border sm:border-white/10">
          <CardHeader className="text-center">
            <Mail className="mx-auto mb-3 h-12 w-12 text-amber-400" />
            <CardTitle>Check your inbox</CardTitle>
            <CardDescription>We sent a verification link to {userEmail}.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-center">
            {verificationError && (
              <Alert variant="destructive">
                <AlertDescription>{verificationError}</AlertDescription>
              </Alert>
            )}
            <Button variant="outline" onClick={resendVerification} disabled={loading}>
              Resend verification email
            </Button>
            <Button variant="ghost" onClick={() => navigate('/')}>
              Return to home
            </Button>
          </CardContent>
        </Card>
      </PageShell>
    );
  }

  if (success && referralCode) {
    const text = encodeURIComponent(shareText(referralLink));
    return (
      <PageShell>
        <Card className="rounded-none border-0 bg-zinc-900/70 shadow-2xl backdrop-blur sm:rounded-2xl sm:border sm:border-white/10">
          <CardHeader className="text-center">
            <CheckCircle className="mx-auto mb-3 h-14 w-14 text-amber-400" />
            <CardTitle>You're in the Founding Crew!</CardTitle>
            <CardDescription>Thanks for helping shape the future of event production.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {referralStatus && (
              <div className="rounded-xl border border-amber-400/30 bg-amber-400/10 p-5 text-center">
                <p className="text-2xl font-bold text-amber-300">You're #{referralStatus.position} in line</p>
                <p className="text-amber-200/80">{referralStatus.referral_count} referrals</p>
              </div>
            )}
            <div className="rounded-xl border border-white/10 bg-card/[0.03] p-4">
              <p className="mb-3 text-sm text-zinc-400">
                Invite concert and corporate event crews to move up together.
              </p>
              <div className="mb-4 flex items-center justify-between rounded-lg border border-white/10 bg-zinc-950/60 p-3">
                <code className="truncate text-sm text-zinc-300">{referralLink}</code>
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
            <Button
              onClick={() => navigate('/')}
              className="w-full bg-amber-400 font-semibold text-zinc-950 hover:bg-amber-300"
            >
              Return to Home
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </CardContent>
        </Card>
      </PageShell>
    );
  }

  return (
    <PageShell
      aside={
        <div className="text-center lg:text-left">
          <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-xl bg-amber-400 text-2xl font-black text-zinc-950 lg:mx-0">
            F
          </div>
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.25em] text-amber-400">
            For the crew, by the crew — private beta
          </p>
          <h1 className="text-3xl font-black tracking-tight text-white sm:text-4xl lg:text-5xl">
            Join the Founding Crew
          </h1>
          <p className="mt-4 text-lg leading-relaxed text-zinc-400">
            Flexzora is the operating system for load-in, show call and load-out crews — replacing the Excel sheets
            and text groups. Get early access and help shape it.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-2 lg:justify-start">
            {['A1 Audio Engineer', 'L2 Lighting Tech', 'Video Wall Lead', 'Stagehand', 'ETCP Arena Rigger'].map(
              (role) => (
                <span
                  key={role}
                  className="rounded-full border border-white/10 bg-card/[0.03] px-3 py-1.5 text-xs font-medium text-zinc-300"
                >
                  {role}
                </span>
              ),
            )}
          </div>
          {stats.total > 0 && (
            <Badge
              variant="outline"
              className="mt-6 w-fit border-white/15 bg-card/5 px-4 py-1.5 text-sm text-zinc-300"
            >
              <Users className="mr-2 h-4 w-4 text-amber-400" />
              {stats.total.toLocaleString()} crew &amp; companies already lined up
            </Badge>
          )}
        </div>
      }
    >
      <Card className="rounded-none border-0 bg-zinc-900/70 shadow-2xl backdrop-blur sm:rounded-2xl sm:border sm:border-white/10">
        <CardHeader>
          <CardTitle className="text-2xl">Get on the list</CardTitle>
          <CardDescription>
            Fill out your crew card — the more complete it is, the earlier you're in when calls open in
            your market.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {referredBy && (
            <Alert className="mb-5 border-amber-400/30 bg-amber-400/10 text-amber-100">
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
              <Field label="Full name" error={errors.full_name?.message}>
                <Input placeholder="Alex Rivera" autoComplete="name" {...register('full_name')} />
              </Field>
              <div>
                <Label>I am a...</Label>
                <Select
                  value={role}
                  onValueChange={(value: WaitlistRoleInterest) =>
                    setValue('role_interest', value, { shouldValidate: true })
                  }
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select your role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="worker">Freelance crew member</SelectItem>
                    <SelectItem value="company">Production company</SelectItem>
                  </SelectContent>
                </Select>
                {errors.role_interest && <p className="mt-1 text-sm text-red-400">{errors.role_interest.message}</p>}
              </div>
              <Field label="Email address" error={errors.email?.message}>
                <Input type="email" placeholder="you@example.com" autoComplete="email" {...register('email')} />
              </Field>
              <Field label="Confirm email" error={errors.confirm_email?.message}>
                <Input type="email" placeholder="Type it again" autoComplete="off" {...register('confirm_email')} />
              </Field>
              <Field label="Mobile number (optional)">
                <Input type="tel" placeholder="(555) 123-4567" autoComplete="tel" {...register('phone')} />
              </Field>
              <Field label="Primary market / city">
                <Input placeholder="Los Angeles, CA" {...register('market_city')} />
              </Field>
            </div>
            <div aria-hidden="true" className="absolute -left-[9999px] -top-[9999px] h-0 w-0 overflow-hidden">
              <label>
                Website
                <input
                  type="text"
                  tabIndex={-1}
                  autoComplete="off"
                  value={honeypot}
                  onChange={(e) => setHoneypot(e.target.value)}
                />
              </label>
            </div>
            {phone.trim().length > 5 && (
              <label className="flex items-start gap-3 rounded-lg border border-white/10 bg-card/[0.03] p-4">
                <Checkbox
                  checked={watch('sms_consent')}
                  onCheckedChange={(checked) => setValue('sms_consent', checked === true)}
                />
                <span className="text-sm text-zinc-300">
                  Text me when matching calls drop — calls move fast, SMS moves faster
                </span>
              </label>
            )}
            {role === 'worker' && (
              <div className="space-y-5 rounded-lg border border-amber-400/20 bg-amber-400/[0.03] p-4 sm:p-5">
                <div>
                  <h3 className="text-lg font-semibold text-white">Your crew card</h3>
                  <p className="mt-1 text-sm text-zinc-400">
                    This is your ticket ahead — tap everything that applies. Companies will match calls to
                    this card.
                  </p>
                  <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full bg-amber-400 transition-all duration-500"
                      style={{ width: `${completeness}%` }}
                    />
                  </div>
                  <p className="mt-1.5 font-mono text-[10px] uppercase tracking-[0.15em] text-amber-400/80">
                    Card {completeness}% complete{completeness >= 70 ? ' — top of the pile' : ' — fill it out, move up the list'}
                  </p>
                </div>
                <ChipGroup
                  label="Roles you work"
                  values={CREW_ROLES}
                  selected={crewRoles}
                  onToggle={(value) => toggleValue('crew_roles', value)}
                />
                <ChipGroup
                  label="Skills & certifications"
                  values={CREW_SKILLS}
                  selected={skills}
                  onToggle={(value) => toggleValue('skills', value)}
                />
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label>Experience</Label>
                    <Select onValueChange={(value) => setValue('experience_years', value)}>
                      <SelectTrigger className="mt-1">
                        <SelectValue placeholder="Years on the road" />
                      </SelectTrigger>
                      <SelectContent>
                        {EXPERIENCE_LEVELS.map((level) => (
                          <SelectItem key={level} value={level}>
                            {level}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Field label="Union / local # (optional)">
                    <Input placeholder="IATSE Local 33" {...register('union_affiliation')} />
                  </Field>
                  <Field label="Target day rate ($, optional)">
                    <Input type="number" min="0" placeholder="320" {...register('day_rate_min')} />
                  </Field>
                  <Field label="Instagram (optional)">
                    <Input placeholder="@yourhandle" {...register('instagram_handle')} />
                  </Field>
                </div>
                <TokenList
                  label="Production companies on your roster"
                  hint="Everyone you've loaded for — type a name, hit Add. Tap a chip to mark where you're still current."
                  placeholder="e.g. Rhino Staging"
                  tokens={companies.map((c) => ({
                    key: c.name,
                    label: c.current ? `${c.name} · current` : c.name,
                    active: c.current,
                  }))}
                  onAdd={(name) =>
                    !companies.some((c) => c.name.toLowerCase() === name.toLowerCase()) &&
                    setValue('companies_worked', [...companies, { name, current: false }], { shouldDirty: true })
                  }
                  onToggle={(key) =>
                    setValue(
                      'companies_worked',
                      companies.map((c) => (c.name === key ? { ...c, current: !c.current } : c)),
                      { shouldDirty: true },
                    )
                  }
                  onRemove={(key) =>
                    setValue('companies_worked', companies.filter((c) => c.name !== key), { shouldDirty: true })
                  }
                />
                <div className="space-y-3 rounded-lg border border-white/10 bg-card/[0.03] p-4">
                  <label className="flex items-start gap-3">
                    <Checkbox
                      checked={hasOwnBusiness}
                      onCheckedChange={(checked) => {
                        setValue('has_own_business', checked === true);
                        if (checked !== true) setValue('business_arrangement', undefined);
                      }}
                    />
                    <span className="text-sm text-zinc-300">I have my own business</span>
                  </label>
                  {hasOwnBusiness && (
                    <>
                      <TokenList
                        label="Your business(es)"
                        hint="LLC, corp, crew outfit — add every business you might take calls under."
                        placeholder="e.g. KnoShow Productions LLC"
                        tokens={businessNames.map((b) => ({ key: b, label: b }))}
                        onAdd={(name) =>
                          !businessNames.some((b) => b.toLowerCase() === name.toLowerCase()) &&
                          setValue('business_names', [...businessNames, name], { shouldDirty: true })
                        }
                        onRemove={(key) =>
                          setValue('business_names', businessNames.filter((b) => b !== key), { shouldDirty: true })
                        }
                      />
                      <div>
                        <Label>How do you work under it?</Label>
                        <Select onValueChange={(value) => setValue('business_arrangement', value)}>
                          <SelectTrigger className="mt-1">
                            <SelectValue placeholder="Pick what fits" />
                          </SelectTrigger>
                          <SelectContent>
                            {BUSINESS_ARRANGEMENTS.map((b) => (
                              <SelectItem key={b} value={b}>{b}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </>
                  )}
                </div>
                <TokenList
                  label="Markets you've worked"
                  hint="Add every market you've ever taken a call in — no limit. Then tap up to 3 to flag your favorites."
                  placeholder="e.g. Nashville, TN"
                  tokens={marketsWorked.map((m) => {
                    const rank = favoriteMarkets.indexOf(m);
                    return { key: m, label: rank >= 0 ? `${m} ★${rank + 1}` : m, active: rank >= 0 };
                  })}
                  onAdd={(name) =>
                    !marketsWorked.some((m) => m.toLowerCase() === name.toLowerCase()) &&
                    setValue('markets_worked', [...marketsWorked, name], { shouldDirty: true })
                  }
                  onToggle={toggleFavoriteMarket}
                  onRemove={(key) => {
                    setValue('markets_worked', marketsWorked.filter((m) => m !== key), { shouldDirty: true });
                    if (favoriteMarkets.includes(key))
                      setValue('favorite_markets', favoriteMarkets.filter((m) => m !== key), { shouldDirty: true });
                  }}
                />
                {favoriteMarkets.length > 0 && (
                  <p className="font-mono text-[11px] uppercase tracking-[0.15em] text-amber-400/80">
                    Your top 3: {favoriteMarkets.join(' · ')}
                  </p>
                )}
                <ChipGroup
                  label="Regions you'd rather be in"
                  values={REGIONS}
                  selected={preferredRegions}
                  onToggle={(value) => toggleValue('preferred_regions', value)}
                />
                <TokenList
                  label="Specific areas you'd jump on"
                  hint="No limit — every city, town or venue inside those regions you'd want calls from."
                  placeholder="e.g. Atlanta, GA or Bridgestone Arena"
                  tokens={preferredAreas.map((a) => ({ key: a, label: a }))}
                  onAdd={(name) =>
                    !preferredAreas.some((a) => a.toLowerCase() === name.toLowerCase()) &&
                    setValue('preferred_areas', [...preferredAreas, name], { shouldDirty: true })
                  }
                  onRemove={(key) =>
                    setValue('preferred_areas', preferredAreas.filter((a) => a !== key), { shouldDirty: true })
                  }
                />
                <ChipGroup
                  label="Where will you work?"
                  values={TRAVEL_OPTIONS}
                  selected={travelAvailability}
                  onToggle={(value) => toggleValue('travel_availability', value)}
                />
                <ChipGroup
                  label="What do you roll in? (tap all that apply)"
                  values={VEHICLE_TYPES}
                  selected={vehicles}
                  onToggle={(value) => toggleValue('vehicles', value)}
                />
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label>Farthest you've traveled for a call</Label>
                    <Select onValueChange={(value) => setValue('farthest_travel', value)}>
                      <SelectTrigger className="mt-1">
                        <SelectValue placeholder="Longest haul" />
                      </SelectTrigger>
                      <SelectContent>
                        {FARTHEST_TRAVEL.map((d) => (
                          <SelectItem key={d} value={d}>{d}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>How fast can you take a call?</Label>
                    <Select onValueChange={(value) => setValue('call_response_time', value)}>
                      <SelectTrigger className="mt-1">
                        <SelectValue placeholder="Response time" />
                      </SelectTrigger>
                      <SelectContent>
                        {CALL_RESPONSE.map((r) => (
                          <SelectItem key={r} value={r}>{r}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Pay structure that works for you</Label>
                    <Select onValueChange={(value) => setValue('payment_type', value)}>
                      <SelectTrigger className="mt-1">
                        <SelectValue placeholder="1099 / W2" />
                      </SelectTrigger>
                      <SelectContent>
                        {PAYMENT_TYPES.map((p) => (
                          <SelectItem key={p} value={p}>{p}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <label className="flex items-center gap-3 self-end rounded-lg border border-white/10 bg-card/[0.03] p-3.5">
                    <Checkbox
                      checked={watch('willing_farther')}
                      onCheckedChange={(checked) => setValue('willing_farther', checked === true)}
                    />
                    <span className="text-sm text-zinc-300">I'd go farther for the right call</span>
                  </label>
                </div>
                <div className="space-y-3 rounded-lg border border-white/10 bg-card/[0.03] p-4">
                  <label className="flex items-start gap-3">
                    <Checkbox
                      checked={watch('has_passport')}
                      onCheckedChange={(checked) => {
                        setValue('has_passport', checked === true);
                        if (checked !== true) {
                          setValue('overseas_willing', false);
                          setValue('departure_readiness', undefined);
                        }
                      }}
                    />
                    <span className="text-sm text-zinc-300">I have a current passport</span>
                  </label>
                  {hasPassport && (
                    <label className="ml-7 flex items-start gap-3">
                      <Checkbox
                        checked={overseasWilling}
                        onCheckedChange={(checked) => {
                          setValue('overseas_willing', checked === true);
                          if (checked !== true) setValue('departure_readiness', undefined);
                        }}
                      />
                      <span className="text-sm text-zinc-300">Willing to work overseas</span>
                    </label>
                  )}
                  {hasPassport && overseasWilling && (
                    <div className="ml-7">
                      <Label>If the call came today, how fast could you go?</Label>
                      <Select onValueChange={(value) => setValue('departure_readiness', value)}>
                        <SelectTrigger className="mt-1">
                          <SelectValue placeholder="Departure readiness" />
                        </SelectTrigger>
                        <SelectContent>
                          {DEPARTURE_NOTICE.map((d) => (
                            <SelectItem key={d} value={d}>{d}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
                <Field label="Who do you usually roll with? (optional)">
                  <Input
                    placeholder="Names or crew name — we'll fast-track your people"
                    {...register('referred_crew')}
                  />
                </Field>
              </div>
            )}
            {role === 'company' && (
              <div className="space-y-4">
                <Field label="Company name (optional)">
                  <Input placeholder="Stadium Ops Inc." {...register('company_name')} />
                </Field>
                <div className="grid gap-4 sm:grid-cols-3">
                  <div>
                    <Label>Company type</Label>
                    <Select onValueChange={(value) => setValue('company_type', value)}>
                      <SelectTrigger className="mt-1">
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
                    <Input type="number" min="0" {...register('events_per_month')} />
                  </Field>
                  <Field label="Typical crew size">
                    <Input type="number" min="0" {...register('typical_crew_size')} />
                  </Field>
                </div>
              </div>
            )}
            {role && (
              <ChipGroup
                label={
                  role === 'company'
                    ? 'Where does it hurt most right now?'
                    : 'What makes gig work hardest right now?'
                }
                values={role === 'company' ? PAIN_POINTS : WORKER_PAIN_POINTS}
                selected={painPoints}
                onToggle={(value) => toggleValue('pain_points', value)}
              />
            )}
            <div>
              <Label>How did you hear about us?</Label>
              <Select onValueChange={(value) => setValue('heard_from', value)}>
                <SelectTrigger className="mt-1">
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
            <label className="flex items-start gap-3 rounded-lg border border-white/10 bg-card/[0.03] p-4">
              <Checkbox
                checked={watch('beta_tester')}
                onCheckedChange={(checked) => setValue('beta_tester', checked === true)}
              />
              <span className="text-sm">
                Founding beta tester — I'll test early builds and give feedback. Completed crew cards get
                the first real calls.
              </span>
            </label>
            <div className="space-y-4 border-t border-white/10 pt-5">
              <h3 className="text-lg font-semibold text-white">Help us build a better platform</h3>
              {role !== 'worker' && (
                <Field label="What production companies have you worked for or do you currently work with?">
                  <Textarea rows={3} {...register('production_companies_worked_with')} />
                </Field>
              )}
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
              className="h-12 w-full bg-amber-400 text-base font-semibold text-zinc-950 hover:bg-amber-300"
            >
              {loading ? 'Processing...' : 'Join the Founding Crew'}
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
            <p className="text-center text-sm text-zinc-500">
              By joining, you agree to receive updates about Flexzora. We'll never spam you or share your information.
            </p>
          </form>
        </CardContent>
      </Card>
    </PageShell>
  );
};

const PageShell: React.FC<{ children: React.ReactNode; aside?: React.ReactNode }> = ({ children, aside }) => (
  <div className="dark relative min-h-screen overflow-x-hidden bg-[#0A0A0B] text-zinc-100">
    <div
      className="pointer-events-none absolute inset-0 opacity-[0.04]"
      style={{
        backgroundImage:
          'linear-gradient(rgba(255,255,255,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.6) 1px, transparent 1px)',
        backgroundSize: '56px 56px',
      }}
    />
    <div className="pointer-events-none absolute -top-32 left-1/2 h-[400px] w-[700px] -translate-x-1/2 rounded-full bg-amber-400/10 blur-[120px]" />
    <div className="relative mx-auto w-full max-w-6xl px-0 py-0 sm:px-6 sm:py-12 lg:px-8">
      {aside ? (
        <div className="grid gap-10 px-5 py-10 sm:px-0 sm:py-0 lg:grid-cols-2 lg:gap-16 lg:py-8">
          <div className="flex flex-col justify-center">{aside}</div>
          <div>{children}</div>
        </div>
      ) : (
        <div className="mx-auto max-w-2xl px-0 py-0 sm:py-8">{children}</div>
      )}
    </div>
  </div>
);
const Field: React.FC<{ label: string; error?: string; children: React.ReactNode }> = ({ label, error, children }) => (
  <div>
    <Label>{label}</Label>
    <div className="mt-1">{children}</div>
    {error && <p className="mt-1 text-sm text-red-400">{error}</p>}
  </div>
);
/** Type-and-add token list — chips toggle `active` on tap, X removes. */
const TokenList: React.FC<{
  label: string;
  hint?: string;
  placeholder: string;
  tokens: { key: string; label: string; active?: boolean }[];
  onAdd: (name: string) => void;
  onToggle?: (key: string) => void;
  onRemove: (key: string) => void;
}> = ({ label, hint, placeholder, tokens, onAdd, onToggle, onRemove }) => {
  const [draft, setDraft] = useState('');
  const add = () => {
    const value = draft.trim();
    if (value) {
      onAdd(value);
      setDraft('');
    }
  };
  return (
    <div>
      <Label>{label}</Label>
      {hint && <p className="mt-1 text-xs text-zinc-500">{hint}</p>}
      <div className="mt-2 flex gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
          placeholder={placeholder}
        />
        <Button type="button" variant="outline" size="sm" onClick={add} disabled={!draft.trim()}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>
      {tokens.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {tokens.map((t) => (
            <span
              key={t.key}
              className={`inline-flex items-center rounded-md border text-sm font-medium ${
                t.active
                  ? 'border-amber-400 bg-amber-400/15 text-amber-300'
                  : 'border-white/15 text-zinc-300'
              }`}
            >
              {onToggle ? (
                <button type="button" onClick={() => onToggle(t.key)} className="px-3 py-1.5">
                  {t.label}
                </button>
              ) : (
                <span className="px-3 py-1.5">{t.label}</span>
              )}
              <button
                type="button"
                onClick={() => onRemove(t.key)}
                aria-label={`Remove ${t.key}`}
                className="pr-2 text-zinc-500 hover:text-white"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
};

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
            onClick={() => onToggle(value)}
            className={
              selected.includes(value)
                ? 'bg-amber-400 font-medium text-zinc-950 hover:bg-amber-300'
                : 'border-white/15 text-zinc-300 hover:bg-card/5 hover:text-white'
            }
          >
            {text}
          </Button>
        );
      })}
    </div>
  </div>
);

export default WaitlistForm;
