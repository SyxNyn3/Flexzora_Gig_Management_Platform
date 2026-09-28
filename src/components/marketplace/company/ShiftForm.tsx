import React, { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CertificationType, Shift, ShiftFormData, Skill } from '@/lib/types';
import { projectedShiftCost } from '@/lib/marketplace/overtime';
import { money, toLocalInputValue } from '../format';

const ROLE_PRESETS = ['Stagehand', 'Ground Rigger', 'Up Rigger', 'A1 Audio', 'A2 Audio', 'L1 Lighting', 'L2 Lighting', 'Video Engineer', 'LED Tech', 'Carpenter', 'Forklift Operator', 'Truck Loader', 'Spot Op'];
const RIGGING_ROLES = ['Ground Rigger', 'Up Rigger'];

interface Props {
  eventDate: string;
  skills: Skill[];
  certTypes: CertificationType[];
  initial?: Shift;
  onSubmit: (form: ShiftFormData) => Promise<unknown>;
  submitting?: boolean;
}

const ShiftForm: React.FC<Props> = ({ eventDate, skills, certTypes, initial, onSubmit, submitting }) => {
  const [form, setForm] = useState<ShiftFormData>({
    title: initial?.title ?? '',
    role_name: initial?.role_name ?? 'Stagehand',
    skill_id: initial?.skill_id ?? '',
    min_proficiency: initial?.min_proficiency ?? 1,
    required_cert_codes: initial?.required_cert_codes ?? [],
    headcount: initial?.headcount ?? 4,
    starts_at: initial ? toLocalInputValue(initial.starts_at) : `${eventDate}T08:00`,
    ends_at: initial ? toLocalInputValue(initial.ends_at) : `${eventDate}T16:00`,
    hourly_rate: initial?.hourly_rate ?? 28,
    notes: initial?.notes ?? '',
  });

  const set = <K extends keyof ShiftFormData>(k: K, v: ShiftFormData[K]) => setForm((f) => ({ ...f, [k]: v }));

  const pickRole = (role: string) => {
    const certs = new Set(form.required_cert_codes);
    if (RIGGING_ROLES.includes(role)) certs.add('ETCP_RIGGING_ARENA');
    if (role === 'Forklift Operator') certs.add('FORKLIFT');
    setForm((f) => ({ ...f, role_name: role, title: f.title || role, required_cert_codes: Array.from(certs) }));
  };

  const toggleCert = (code: string, checked: boolean) => {
    set('required_cert_codes', checked ? [...form.required_cert_codes, code] : form.required_cert_codes.filter((c) => c !== code));
  };

  const projected = useMemo(() => {
    if (!form.starts_at || !form.ends_at) return 0;
    return projectedShiftCost(new Date(form.starts_at).toISOString(), new Date(form.ends_at).toISOString(), form.hourly_rate, form.headcount);
  }, [form.starts_at, form.ends_at, form.hourly_rate, form.headcount]);

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({
          ...form,
          starts_at: new Date(form.starts_at).toISOString(),
          ends_at: new Date(form.ends_at).toISOString(),
        });
      }}
    >
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Role</Label>
          <Select value={form.role_name} onValueChange={pickRole}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {ROLE_PRESETS.map((r) => (
                <SelectItem key={r} value={r}>{r}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="sh-title">Call name</Label>
          <Input id="sh-title" required value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="Load-in riggers" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="sh-start">Call time</Label>
          <Input id="sh-start" type="datetime-local" required value={form.starts_at} onChange={(e) => set('starts_at', e.target.value)} />
        </div>
        <div>
          <Label htmlFor="sh-end">Wrap time</Label>
          <Input id="sh-end" type="datetime-local" required value={form.ends_at} onChange={(e) => set('ends_at', e.target.value)} />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <Label htmlFor="sh-head">Headcount</Label>
          <Input id="sh-head" type="number" min={1} required value={form.headcount} onChange={(e) => set('headcount', Number(e.target.value))} />
        </div>
        <div>
          <Label htmlFor="sh-rate">Rate ($/hr)</Label>
          <Input id="sh-rate" type="number" min={0} step="0.5" required value={form.hourly_rate} onChange={(e) => set('hourly_rate', Number(e.target.value))} />
        </div>
        <div>
          <Label>Min skill tier</Label>
          <Select value={String(form.min_proficiency)} onValueChange={(v) => set('min_proficiency', Number(v))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {[1, 2, 3, 4, 5].map((n) => (
                <SelectItem key={n} value={String(n)}>Tier {n}{n === 1 ? ' (any)' : n === 5 ? ' (lead)' : ''}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div>
        <Label>Skill</Label>
        <Select value={form.skill_id || 'none'} onValueChange={(v) => set('skill_id', v === 'none' ? '' : v)}>
          <SelectTrigger><SelectValue placeholder="Any skill" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Any skill</SelectItem>
            {skills.map((s) => (
              <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label>Required certifications (hard gate)</Label>
        <div className="grid grid-cols-2 gap-2 mt-1">
          {certTypes.map((c) => (
            <label key={c.code} className="flex items-center gap-2 text-sm">
              <Checkbox checked={form.required_cert_codes.includes(c.code)} onCheckedChange={(v) => toggleCert(c.code, v === true)} />
              <span>{c.name}</span>
            </label>
          ))}
        </div>
        {form.required_cert_codes.some((c) => c.startsWith('ETCP')) && (
          <p className="text-xs text-amber-700 mt-1">Only workers with a verified, unexpired ETCP credential will see this call.</p>
        )}
      </div>
      <div>
        <Label htmlFor="sh-notes">Notes to crew</Label>
        <Textarea id="sh-notes" rows={2} value={form.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Steel toes, hi-vis, bring harness…" />
      </div>
      <div className="flex items-center justify-between rounded-md bg-gray-50 border p-3 text-sm">
        <span className="text-gray-600">Projected labor (incl. OT)</span>
        <span className="font-semibold">{money(projected)}</span>
      </div>
      <Button type="submit" className="w-full" disabled={submitting}>
        {submitting ? 'Saving…' : initial ? 'Save shift' : 'Add shift'}
      </Button>
    </form>
  );
};

export default ShiftForm;
