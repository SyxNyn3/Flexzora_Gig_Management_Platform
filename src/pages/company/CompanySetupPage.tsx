import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { invalidateCompanyMemberships } from '@/hooks/useMarketplace';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Building2, ArrowRight, CheckCircle2 } from 'lucide-react';

// Company setup — the open front door for production companies.
// Any authenticated user can create a company here (worker-profile accounts
// can operate a company under the same login via company_members); the
// create_company RPC writes the company + owner membership atomically and is
// the ONLY API path that creates companies.
//
// This page replaced the "book a demo" gate: companies self-serve onboarding
// instead of waiting on a sales call. The demo form still exists for teams
// that want a walkthrough — it's just no longer the only door.

const CompanySetupPage: React.FC = () => {
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [form, setForm] = useState({
    name: '',
    website_url: '',
    contact_email: '',
    contact_phone: '',
    description: '',
    address: '',
  });

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async () => {
    if (!form.name.trim() || submitting) return;
    setSubmitting(true);
    const { error } = await supabase.rpc('create_company', {
      p_name: form.name.trim(),
      p_contact_email: form.contact_email.trim() || null,
      p_description: form.description.trim() || null,
      p_website_url: form.website_url.trim() || null,
      p_contact_phone: form.contact_phone.trim() || null,
      p_address: form.address.trim() || null,
    });
    setSubmitting(false);
    if (error) {
      toast.error(error.message || 'Could not create company');
      return;
    }
    invalidateCompanyMemberships();
    setDone(true);
    toast.success('Company created', { description: 'Your production company is ready.' });
  };

  if (done) {
    return (
      <div className="max-w-lg mx-auto px-4 py-16">
        <Card>
          <CardContent className="p-8 text-center space-y-4">
            <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto" />
            <h1 className="text-2xl font-bold">You're in</h1>
            <p className="text-muted-foreground">
              {form.name} is set up. Next: create your first event, post a call,
              and invite your team.
            </p>
            <div className="flex flex-col gap-2 pt-2">
              <Button onClick={() => navigate('/events')}>
                Create your first event <ArrowRight className="ml-2 w-4 h-4" />
              </Button>
              <Button variant="outline" onClick={() => navigate('/dashboard')}>
                Go to dashboard
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto px-4 py-12">
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 bg-primary/15 rounded-lg flex items-center justify-center">
            <Building2 className="w-5 h-5 text-primary" />
          </div>
          <h1 className="text-2xl font-bold">Set up your production company</h1>
        </div>
        <p className="text-muted-foreground">
          Free to start. Post calls, manage rosters, timesheets, and paperwork in one place.
          Takes about a minute — you can fill in the rest later.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Company details</CardTitle>
          <CardDescription>Only the name is required right now.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="co-name">Company name *</Label>
            <Input id="co-name" value={form.name} onChange={set('name')} placeholder="e.g. Axios Pro Solutions" />
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="co-website">Website</Label>
              <Input id="co-website" value={form.website_url} onChange={set('website_url')} placeholder="https://…" />
            </div>
            <div>
              <Label htmlFor="co-phone">Phone</Label>
              <Input id="co-phone" value={form.contact_phone} onChange={set('contact_phone')} placeholder="(555) 555-5555" />
            </div>
          </div>
          <div>
            <Label htmlFor="co-email">Contact email</Label>
            <Input id="co-email" type="email" value={form.contact_email} onChange={set('contact_email')} placeholder="ops@company.com" />
          </div>
          <div>
            <Label htmlFor="co-address">Address / base</Label>
            <Input id="co-address" value={form.address} onChange={set('address')} placeholder="City, state" />
          </div>
          <div>
            <Label htmlFor="co-desc">What do you do?</Label>
            <Textarea id="co-desc" rows={2} value={form.description} onChange={set('description')}
              placeholder="Event production, AV install, labor brokerage…" />
          </div>
          <Button className="w-full" disabled={!form.name.trim() || submitting} onClick={submit}>
            {submitting ? 'Creating…' : 'Create company'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default CompanySetupPage;
