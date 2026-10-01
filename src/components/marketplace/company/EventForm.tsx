import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { EventFormData, EventType, OvertimeRule, Venue, VenueFormData } from '@/lib/types';
import { Plus } from 'lucide-react';

const EVENT_TYPES: { value: EventType; label: string }[] = [
  { value: 'concert', label: 'Concert / Tour' },
  { value: 'festival', label: 'Festival' },
  { value: 'corporate', label: 'Corporate / AV' },
  { value: 'theatre', label: 'Theatre' },
  { value: 'broadcast', label: 'Broadcast' },
  { value: 'sports', label: 'Sports' },
  { value: 'other', label: 'Other' },
];

interface Props {
  venues: Venue[];
  overtimeRules: OvertimeRule[];
  onCreateVenue: (form: VenueFormData) => Promise<Venue | null>;
  onSubmit: (form: EventFormData) => Promise<unknown>;
  submitting?: boolean;
}

const EventForm: React.FC<Props> = ({ venues, overtimeRules, onCreateVenue, onSubmit, submitting }) => {
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState<EventFormData>({
    name: '',
    event_type: 'concert',
    description: '',
    venue_id: '',
    starts_on: today,
    ends_on: today,
    budget_cap: undefined,
    overtime_rule_code: overtimeRules[0]?.code ?? 'US_FLSA',
  });
  const [showVenue, setShowVenue] = useState(false);
  const [venue, setVenue] = useState<VenueFormData>({ name: '', address: '', city: '', region: '', latitude: 0, longitude: 0, geofence_radius_m: 250 });
  const [savingVenue, setSavingVenue] = useState(false);

  const set = <K extends keyof EventFormData>(k: K, v: EventFormData[K]) => setForm((f) => ({ ...f, [k]: v }));

  const saveVenue = async () => {
    setSavingVenue(true);
    const created = await onCreateVenue(venue);
    setSavingVenue(false);
    if (created) {
      set('venue_id', created.id);
      setShowVenue(false);
    }
  };

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(form);
      }}
    >
      <div>
        <Label htmlFor="ev-name">Event name</Label>
        <Input id="ev-name" required value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Fall Arena Tour – Night 1" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Type</Label>
          <Select value={form.event_type} onValueChange={(v) => set('event_type', v as EventType)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {EVENT_TYPES.map((t) => (
                <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Overtime rule</Label>
          <Select value={form.overtime_rule_code} onValueChange={(v) => set('overtime_rule_code', v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {overtimeRules.map((r) => (
                <SelectItem key={r.code} value={r.code}>{r.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="ev-start">Load-in date</Label>
          <Input id="ev-start" type="date" required value={form.starts_on} onChange={(e) => set('starts_on', e.target.value)} />
        </div>
        <div>
          <Label htmlFor="ev-end">Load-out date</Label>
          <Input id="ev-end" type="date" required min={form.starts_on} value={form.ends_on} onChange={(e) => set('ends_on', e.target.value)} />
        </div>
      </div>
      <div>
        <div className="flex items-center justify-between">
          <Label>Venue</Label>
          <Button type="button" variant="ghost" size="sm" onClick={() => setShowVenue((s) => !s)}>
            <Plus className="w-3 h-3 mr-1" /> New venue
          </Button>
        </div>
        <Select value={form.venue_id || 'none'} onValueChange={(v) => set('venue_id', v === 'none' ? '' : v)}>
          <SelectTrigger><SelectValue placeholder="Select venue" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">No venue yet</SelectItem>
            {venues.map((v) => (
              <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {showVenue && (
          <div className="mt-3 p-3 border rounded-md bg-gray-50 space-y-2">
            <Input placeholder="Venue name" value={venue.name} onChange={(e) => setVenue({ ...venue, name: e.target.value })} />
            <Input placeholder="Street address" value={venue.address} onChange={(e) => setVenue({ ...venue, address: e.target.value })} />
            <div className="grid grid-cols-2 gap-2">
              <Input placeholder="City" value={venue.city} onChange={(e) => setVenue({ ...venue, city: e.target.value })} />
              <Input placeholder="State / Region" value={venue.region} onChange={(e) => setVenue({ ...venue, region: e.target.value })} />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Input type="number" step="any" placeholder="Latitude" value={venue.latitude || ''} onChange={(e) => setVenue({ ...venue, latitude: Number(e.target.value) })} />
              <Input type="number" step="any" placeholder="Longitude" value={venue.longitude || ''} onChange={(e) => setVenue({ ...venue, longitude: Number(e.target.value) })} />
              <Input type="number" placeholder="Geofence (m)" value={venue.geofence_radius_m} onChange={(e) => setVenue({ ...venue, geofence_radius_m: Number(e.target.value) })} />
            </div>
            <p className="text-xs text-gray-500">Coordinates power geofenced clock-in and proximity matching.</p>
            <Button type="button" size="sm" disabled={savingVenue || !venue.name || !venue.address || !venue.latitude} onClick={saveVenue}>
              {savingVenue ? 'Saving…' : 'Save venue'}
            </Button>
          </div>
        )}
      </div>
      <div>
        <Label htmlFor="ev-budget">Labor budget cap (optional)</Label>
        <Input id="ev-budget" type="number" min={0} step="100" value={form.budget_cap ?? ''} onChange={(e) => set('budget_cap', e.target.value ? Number(e.target.value) : undefined)} placeholder="25000" />
      </div>
      <div>
        <Label htmlFor="ev-desc">Notes</Label>
        <Textarea id="ev-desc" rows={2} value={form.description} onChange={(e) => set('description', e.target.value)} placeholder="Parking, dock access, call times…" />
      </div>
      <Button type="submit" className="w-full" disabled={submitting}>
        {submitting ? 'Creating…' : 'Create event'}
      </Button>
    </form>
  );
};

export default EventForm;
