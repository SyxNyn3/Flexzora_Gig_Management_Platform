import React, { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CertificationType, RateGuidance, Shift, ShiftFormData, ShiftTemplate, Skill } from '@/lib/types';
import { projectedShiftCost } from '@/lib/marketplace/overtime';
import { MarketplaceService } from '@/lib/marketplace/service';
import { TemplateService } from '@/lib/templates/service';
import { money, toLocalInputValue } from '../format';
import { toast } from 'sonner';

const ROLE_PRESETS = ['Stagehand', 'Ground Rigger', 'Up Rigger', 'A1 Audio', 'A2 Audio', 'L1 Lighting', 'L2 Lighting', 'Video Engineer', 'LED Tech', 'Carpenter', 'Forklift Operator', 'Truck Loader', 'Spot Op'];
const RIGGING_ROLES = ['Ground Rigger', 'Up Rigger'];

interface Props {
  eventDate: string;
  skills: Skill[];
  certTypes: CertificationType[];
  initial?: Shift;
  onSubmit: (form: ShiftFormData) => Promise<unknown>;
  submitting?: boolean;
  /** Enables the "save as call pack" row + the start-from-pack picker. */
  companyId?: string;
  templates?: ShiftTemplate[];
  /** Event venue coords — scopes the market-rate hint under the rate field. */
  market?: { lat: number; lng: number } | null;
}

const ShiftForm: React.FC<Props> = ({ eventDate, skills, certTypes, initial, onSubmit, submitting, companyId, templates, market }) => {
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

  const [savePack, setSavePack] = useState(false);
  const [packName, setPackName] = useState('');
  const [guidance, setGuidance] = useState<RateGuidance | null>(null);

  // Cleared-rate guidance for this role family around the venue — debounced so
  // preset clicks don't spam the RPC.
  useEffect(() => {
    if (!companyId || (!form.role_name.trim() && !form.skill_id)) {
      setGuidance(null);
      return;
    }
    const t = setTimeout(async () => {
      const r = await MarketplaceService.rateGuidance(
        companyId,
        form.role_name.trim() || null,
        form.skill_id || null,
        market?.lat ?? null,
        market?.lng ?? null,
      );
      setGuidance(r.data);
    }, 350);
    return () => clearTimeout(t);
  }, [companyId, form.role_name, form.skill_id, market?.lat, market?.lng]);

  const set = <K extends keyof ShiftFormData>(k: K, v: ShiftFormData[K]) => setForm((f) => ({ ...f, [k]: v }));

  // One-tap from a call pack: everything prefills except the clock — the pack's
  // typical length moves the wrap time so the crew math stays honest.
  const applyTemplate = (templateId: string) => {
    const t = templates?.find((x) => x.id === templateId);
    if (!t) return;
    const start = form.starts_at || `${eventDate}T08:00`;
    const end = new Date(new Date(start).getTime() + t.duration_minutes * 60000);
    setForm((f) => ({
      ...f,
      title: t.name,
      role_name: t.role_name,
      skill_id: t.skill_id ?? '',
      min_proficiency: t.min_proficiency,
      required_cert_codes: t.required_cert_codes,
      headcount: t.headcount,
      hourly_rate: t.hourly_rate,
      ends_at: toLocalInputValue(end.toISOString()),
      notes: t.notes ?? f.notes,
    }));
  };

  const pickRole = (role: string) => {
    const certs = new Set(form.required_cert_codes);
    if (RIGGING_ROLES.includes(role)) certs.add('ETCP_ARENA');
    if (role === 'Forklift Operator') certs.add('FORKLIFT');
    setForm((f) => ({ ...f, role_name: role, title: f.title || role, required_cert_codes: Array.from(certs) }));
  };

  const toggleCert = (code: string, checked: boolean) => {
    set('required_cert_codes', checked ? [...form.required_cert_codes, code] : form.required_cert_codes.filter((c) => c !== code));
  };

  const projected = useMemo(() => {
    if (!form.starts_at || !form.ends_at) return 0;
    const start = new Date(form.starts_at);
    const end = new Date(form.ends_at);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) return 0;
    return projectedShiftCost(start.toISOString(), end.toISOString(), form.hourly_rate, form.headcount);
  }, [form.starts_at, form.ends_at, form.hourly_rate, form.headcount]);

  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const isoForm = {
          ...form,
          starts_at: new Date(form.starts_at).toISOString(),
          ends_at: new Date(form.ends_at).toISOString(),
        };
        if (savePack && companyId && packName.trim()) {
          const r = await TemplateService.savePack(companyId, packName.trim(), isoForm);
          if (r.error) toast.error(`Pack not saved: ${r.error}`);
          else toast.success(`Saved "${packName.trim()}" — reusable next time`);
        }
        onSubmit(isoForm);
      }}
    >
      {!initial && templates && templates.length > 0 && (
        <div className="rounded-md border border-border bg-muted/40 p-3 space-y-1">
          <Label className="text-xs">Start from a call pack</Label>
          <Select onValueChange={applyTemplate}>
            <SelectTrigger className="bg-background"><SelectValue placeholder="Pick a pack — fills everything but the clock" /></SelectTrigger>
            <SelectContent>
              {templates.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name} — {t.headcount}× {t.role_name} @ {money(t.hourly_rate)}/hr · {Math.round(t.duration_minutes / 60)}h
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
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
          {guidance && guidance.count >= 3 && guidance.p25 != null && guidance.p50 != null && guidance.p75 != null && (
            <p className="text-[11px] text-muted-foreground mt-1">
              Clears {money(guidance.p25)}–{money(guidance.p75)} · median {money(guidance.p50)} ({guidance.count} booked{market ? ' nearby' : ''})
            </p>
          )}
          {guidance && guidance.count >= 3 && guidance.p25 != null && form.hourly_rate < guidance.p25 && (
            <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-0.5">Below market — underpriced calls fill slower</p>
          )}
          {guidance && guidance.count >= 3 && guidance.p75 != null && form.hourly_rate > guidance.p75 && (
            <p className="text-[11px] text-muted-foreground mt-0.5">Above market P75 — premium rate</p>
          )}
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
          <p className="text-xs text-amber-500 mt-1">Only workers with a verified, unexpired ETCP credential will see this call.</p>
        )}
      </div>
      <div>
        <Label htmlFor="sh-notes">Notes to crew</Label>
        <Textarea id="sh-notes" rows={2} value={form.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Steel toes, hi-vis, bring harness…" />
      </div>
      <div className="flex items-center justify-between rounded-md bg-muted/50 border border-border p-3 text-sm">
        <span className="text-muted-foreground">Projected labor (incl. OT)</span>
        <span className="font-semibold">{money(projected)}</span>
      </div>
      {!initial && companyId && (
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <Checkbox checked={savePack} onCheckedChange={(v) => {
              setSavePack(v === true);
              if (v === true && !packName) setPackName(form.title || form.role_name);
            }} />
            <span>Save as a call pack — reuse this setup next time</span>
          </label>
          {savePack && (
            <Input
              required
              value={packName}
              onChange={(e) => setPackName(e.target.value)}
              placeholder="Pack name — e.g. Arena load-in pack"
            />
          )}
        </div>
      )}
      <Button type="submit" className="w-full" disabled={submitting}>
        {submitting ? 'Saving…' : initial ? 'Save shift' : 'Add shift'}
      </Button>
    </form>
  );
};

export default ShiftForm;
