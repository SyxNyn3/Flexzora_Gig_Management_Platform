import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { z } from 'zod';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { ComplianceService } from '@/lib/compliance/service';
import {
  CLASSIFICATION_LABELS,
  LLC_TYPES,
  W9_CLASSIFICATIONS,
  maskTin,
  w9Schema,
  w9ToFile,
  type W9Classification,
  type W9FormData,
} from '@/lib/compliance/w9';

const STEPS = ['Tax identity', 'Address & taxpayer ID', 'Review & sign'] as const;

/** Fields validated when leaving each step — later steps aren't required yet. */
const STEP_FIELDS: Record<number, (keyof W9FormData)[]> = {
  0: ['name', 'classification', 'llcType'],
  1: ['address', 'city', 'state', 'zip', 'ssn', 'ein'],
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmitted: () => void;
}

// Field must live at module scope: defining it inside the component gives
// it a new identity every render, so React unmounts/remounts the input on
// each keystroke (watch() re-renders) and the field loses focus after a
// single character.
const Field: React.FC<{ label: string; htmlFor: string; hint?: string; children: React.ReactNode }> = ({ label, htmlFor, hint, children }) => (
  <div className="space-y-1.5">
    <Label htmlFor={htmlFor} className="text-xs">{label}</Label>
    {children}
    {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
  </div>
);

/**
 * Guided W-9 wizard — collects the official form fields, renders a filled
 * facsimile PDF client-side, and files it through the same
 * uploadDocument → submit pipeline as a manual upload (pending → company
 * review → approved W-9 unlocks payouts). The taxpayer ID lives only in form
 * state and inside the generated PDF — never in a database column.
 */
const W9Wizard: React.FC<Props> = ({ open, onOpenChange, onSubmitted }) => {
  const { profile } = useAuth();
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);

  // zod 4 + coerce: field values use z.input, submit handlers get z.infer
  const form = useForm<z.input<typeof w9Schema>, unknown, W9FormData>({
    resolver: zodResolver(w9Schema),
    defaultValues: {
      name: profile?.full_name ?? '',
      businessName: '',
      classification: undefined,
      llcType: undefined,
      llcMembers: undefined,
      llcOrganizedUS: undefined,
      exemptPayeeCode: '',
      exemptFatcaCode: '',
      address: '',
      city: '',
      state: '',
      zip: '',
      accountNumber: '',
      requesterName: '',
      requesterAddress: '',
      ssn: '',
      ein: '',
      certificationAck: false,
      signatureName: '',
    },
    mode: 'onTouched',
  });

  const { register, handleSubmit, trigger, watch, setValue, formState: { errors } } = form;
  const classification = watch('classification');
  const values = watch();

  const next = async () => {
    const fields = STEP_FIELDS[step];
    const okStep = fields ? await trigger(fields) : true;
    if (okStep) setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };

  const back = () => setStep((s) => Math.max(s - 1, 0));

  const onSubmit = async (data: W9FormData) => {
    if (!profile?.id) return;
    setBusy(true);
    try {
      const file = w9ToFile(data);
      const up = await ComplianceService.uploadDocument(profile.id, 'w9', file);
      if (up.error || !up.data) {
        toast.error(up.error ?? 'Upload failed');
        return;
      }
      const sub = await ComplianceService.submit(profile.id, 'w9', up.data);
      if (sub.error) {
        toast.error(sub.error);
        return;
      }
      toast.success('W-9 submitted for review');
      onOpenChange(false);
      onSubmitted();
    } finally {
      setBusy(false);
    }
  };

  const err = (field: keyof W9FormData) =>
    errors[field] ? <p className="text-xs text-destructive dark:text-red-400 mt-1">{errors[field]?.message}</p> : null;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!busy) onOpenChange(o); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Fill out your W-9</DialogTitle>
          <DialogDescription>
            Step {step + 1} of {STEPS.length} — {STEPS[step]}. We generate the official form PDF for you to sign.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {step === 0 && (
            <>
              <Field label="Name shown on your income tax return" htmlFor="w9-name">
                <Input id="w9-name" autoComplete="name" {...register('name')} placeholder="e.g. Jordan Rivera" />
                {err('name')}
              </Field>
              <Field label="Business name / disregarded entity (if different)" htmlFor="w9-biz" hint="Optional — DBA or single-member LLC name">
                <Input id="w9-biz" {...register('businessName')} />
              </Field>
              <Field label="Federal tax classification" htmlFor="w9-cls">
                <Select value={classification ?? ''} onValueChange={(v) => setValue('classification', v as W9Classification, { shouldValidate: true })}>
                  <SelectTrigger id="w9-cls"><SelectValue placeholder="Select classification" /></SelectTrigger>
                  <SelectContent>
                    {W9_CLASSIFICATIONS.map((c) => (
                      <SelectItem key={c} value={c}>{CLASSIFICATION_LABELS[c]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {err('classification')}
              </Field>
              {classification === 'llc' && (
                <div className="grid grid-cols-2 gap-3 rounded-md border p-3">
                  <Field label="LLC tax treatment" htmlFor="w9-llctype">
                    <Select value={values.llcType ?? ''} onValueChange={(v) => setValue('llcType', v as W9FormData['llcType'], { shouldValidate: true })}>
                      <SelectTrigger id="w9-llctype"><SelectValue placeholder="C, S, or P" /></SelectTrigger>
                      <SelectContent>
                        {LLC_TYPES.map((t) => (
                          <SelectItem key={t} value={t}>{t === 'P' ? 'P — partnership' : t === 'C' ? 'C corporation' : 'S corporation'}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {err('llcType')}
                  </Field>
                  <Field label="LLC members" htmlFor="w9-llcmembers">
                    <Input id="w9-llcmembers" type="number" min={0} {...register('llcMembers')} placeholder="Optional" />
                  </Field>
                  <Field label="LLC organized in the U.S.?" htmlFor="w9-llcus">
                    <Select value={values.llcOrganizedUS === undefined ? '' : values.llcOrganizedUS ? 'yes' : 'no'} onValueChange={(v) => setValue('llcOrganizedUS', v === 'yes', { shouldValidate: true })}>
                      <SelectTrigger id="w9-llcus"><SelectValue placeholder="Yes / No" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="yes">Yes</SelectItem>
                        <SelectItem value="no">No</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <Field label="Exempt payee code" htmlFor="w9-payee" hint="Rare — most leave blank">
                  <Input id="w9-payee" {...register('exemptPayeeCode')} />
                </Field>
                <Field label="Exempt FATCA code" htmlFor="w9-fatca">
                  <Input id="w9-fatca" {...register('exemptFatcaCode')} />
                </Field>
              </div>
            </>
          )}

          {step === 1 && (
            <>
              <Field label="Street address" htmlFor="w9-addr">
                <Input id="w9-addr" autoComplete="street-address" {...register('address')} placeholder="123 Main St, Apt 4" />
                {err('address')}
              </Field>
              <div className="grid grid-cols-[1fr_80px_110px] gap-3">
                <Field label="City" htmlFor="w9-city">
                  <Input id="w9-city" {...register('city')} />
                  {err('city')}
                </Field>
                <Field label="State" htmlFor="w9-state">
                  <Input id="w9-state" maxLength={2} {...register('state')} placeholder="TX" className="uppercase" />
                  {err('state')}
                </Field>
                <Field label="ZIP" htmlFor="w9-zip">
                  <Input id="w9-zip" {...register('zip')} placeholder="78701" />
                  {err('zip')}
                </Field>
              </div>
              <Field label="Account number(s) the requester gave you" htmlFor="w9-acct" hint="Optional — line 7 on the form">
                <Input id="w9-acct" {...register('accountNumber')} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Requester's name (optional)" htmlFor="w9-reqname">
                  <Input id="w9-reqname" {...register('requesterName')} placeholder="Company that asked" />
                </Field>
                <Field label="Requester's address (optional)" htmlFor="w9-reqaddr">
                  <Input id="w9-reqaddr" {...register('requesterAddress')} />
                </Field>
              </div>
              <div className="rounded-md border p-3 space-y-3">
                <p className="text-xs font-medium">Taxpayer identification number — required</p>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="SSN" htmlFor="w9-ssn" hint="Individuals — XXX-XX-XXXX">
                    <Input id="w9-ssn" inputMode="numeric" autoComplete="off" {...register('ssn')} placeholder="123-45-6789" />
                  </Field>
                  <Field label="or EIN" htmlFor="w9-ein" hint="Businesses — XX-XXXXXXX">
                    <Input id="w9-ein" inputMode="numeric" autoComplete="off" {...register('ein')} placeholder="12-3456789" />
                  </Field>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Your SSN/EIN is written only into the generated PDF in the private compliance vault — it's never stored in your profile or anywhere companies can read directly.
                </p>
                {err('ssn')}
              </div>
            </>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div className="rounded-md border p-3 text-sm space-y-1.5">
                <p><span className="text-muted-foreground">Name:</span> {values.name}</p>
                {values.businessName && <p><span className="text-muted-foreground">Business:</span> {values.businessName}</p>}
                <p><span className="text-muted-foreground">Classification:</span> {values.classification ? CLASSIFICATION_LABELS[values.classification] : '—'}</p>
                {values.classification === 'llc' && <p><span className="text-muted-foreground">LLC treatment:</span> {values.llcType ?? '—'}</p>}
                <p><span className="text-muted-foreground">Address:</span> {values.address}, {values.city}, {values.state?.toUpperCase()} {values.zip}</p>
                <p><span className="text-muted-foreground">SSN:</span> {maskTin(values.ssn) || '—'} · <span className="text-muted-foreground">EIN:</span> {maskTin(values.ein) || '—'}</p>
              </div>
              <label className="flex items-start gap-2 text-xs cursor-pointer">
                <Checkbox
                  checked={values.certificationAck === true}
                  onCheckedChange={(c) => setValue('certificationAck', c === true, { shouldValidate: true })}
                  className="mt-0.5"
                />
                <span>
                  Under penalties of perjury, I certify that the information on this form is correct and that I am a U.S. citizen or other U.S. person as defined in the instructions.
                </span>
              </label>
              {err('certificationAck')}
              <Field label="Type your full legal name to sign" htmlFor="w9-sign">
                <Input id="w9-sign" autoComplete="name" {...register('signatureName')} placeholder={values.name ?? ''} />
                {err('signatureName')}
              </Field>
              <p className="text-[11px] text-muted-foreground">
                By submitting you sign the W-9 electronically — your typed name and today's date are printed as the signature on the PDF. A company admin reviews it before it's approved; an approved W-9 is what releases your payouts.
              </p>
            </div>
          )}

          <DialogFooter className="gap-2">
            {step > 0 && (
              <Button type="button" variant="outline" onClick={back} disabled={busy}>Back</Button>
            )}
            {step < STEPS.length - 1 ? (
              <Button type="button" onClick={next}>Continue</Button>
            ) : (
              <Button type="submit" disabled={busy}>
                {busy && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
                Sign &amp; submit W-9
              </Button>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default W9Wizard;
