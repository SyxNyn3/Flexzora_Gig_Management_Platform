import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { format, parseISO } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useAuth } from '@/contexts/AuthContext';
import { useEvents, useMyCompany, useOvertimeRules, useVenues } from '@/hooks/useMarketplace';
import { MarketplaceService } from '@/lib/marketplace/service';
import { EventFormData, ProductionEvent, VenueFormData } from '@/lib/types';
import EventForm from '@/components/marketplace/company/EventForm';
import { confirmedCount } from '@/components/marketplace/format';
import { CalendarDays, MapPin, Plus, Users } from 'lucide-react';

const statusTone: Record<ProductionEvent['status'], string> = {
  draft: 'bg-gray-100 text-gray-700',
  published: 'bg-blue-100 text-blue-800',
  in_progress: 'bg-green-100 text-green-800',
  completed: 'bg-purple-100 text-purple-800',
  cancelled: 'bg-red-100 text-red-800',
};

const EventsPage: React.FC = () => {
  const { profile } = useAuth();
  const { company, loading: companyLoading, createCompany } = useMyCompany();
  const events = useEvents(company?.id);
  const venues = useVenues(company?.id);
  const rules = useOvertimeRules();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [companyName, setCompanyName] = useState('');

  const onCreate = async (form: EventFormData) => {
    if (!company || !profile) return;
    setSubmitting(true);
    const { error } = await MarketplaceService.createEvent(company.id, profile.id, form);
    setSubmitting(false);
    if (error) return toast.error(error);
    toast.success('Event created');
    setOpen(false);
    events.refetch();
  };

  const onCreateVenue = async (form: VenueFormData) => {
    if (!company) return null;
    const { data, error } = await MarketplaceService.createVenue(company.id, form);
    if (error) toast.error(error);
    else venues.refetch();
    return data;
  };

  if (companyLoading) return <div className="max-w-6xl mx-auto p-6"><Skeleton className="h-32 w-full" /></div>;

  if (!company) {
    return (
      <div className="max-w-lg mx-auto p-6 mt-12">
        <Card>
          <CardContent className="p-6 space-y-3">
            <h2 className="text-xl font-semibold">Set up your production company</h2>
            <p className="text-sm text-gray-600">Events, shifts, rosters and escrow are all scoped to your company.</p>
            <Input placeholder="Company name" value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
            <Button disabled={!companyName.trim()} onClick={() => createCompany(companyName.trim())}>Create company</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Events</h1>
          <p className="text-sm text-gray-600">{company.name} · multi-day productions and their crew calls</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="w-4 h-4 mr-1" /> New event</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Create event</DialogTitle></DialogHeader>
            <EventForm venues={venues.data} overtimeRules={rules.data} onCreateVenue={onCreateVenue} onSubmit={onCreate} submitting={submitting} />
          </DialogContent>
        </Dialog>
      </div>

      {events.loading && <Skeleton className="h-40 w-full" />}
      {!events.loading && events.data.length === 0 && (
        <Card>
          <CardContent className="p-10 text-center text-gray-500">
            <CalendarDays className="w-10 h-10 mx-auto mb-3 text-gray-300" />
            No events yet. Create your first production to start building crew calls.
          </CardContent>
        </Card>
      )}

      <div className="grid md:grid-cols-2 gap-4">
        {events.data.map((ev) => {
          const shifts = ev.shifts ?? [];
          const required = shifts.reduce((n, s) => n + s.headcount, 0);
          const filled = shifts.reduce((n, s) => n + confirmedCount(s), 0);
          const pct = required ? Math.round((filled / required) * 100) : 0;
          return (
            <Link key={ev.id} to={`/events/${ev.id}`}>
              <Card className="hover:shadow-md transition h-full" style={{ borderLeft: `4px solid ${ev.color}` }}>
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-semibold">{ev.name}</h3>
                    <Badge className={statusTone[ev.status]} variant="outline">{ev.status.replace('_', ' ')}</Badge>
                  </div>
                  <p className="text-sm text-gray-600 flex items-center gap-1">
                    <CalendarDays className="w-3.5 h-3.5" />
                    {format(parseISO(ev.starts_on), 'MMM d')} – {format(parseISO(ev.ends_on), 'MMM d, yyyy')} · {ev.event_type}
                  </p>
                  {ev.venue && (
                    <p className="text-sm text-gray-600 flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5" /> {ev.venue.name}
                    </p>
                  )}
                  <div className="flex items-center gap-2 text-sm">
                    <Users className="w-3.5 h-3.5 text-gray-500" />
                    <span>{filled}/{required} crew confirmed</span>
                    <div className="flex-1 h-1.5 bg-gray-200 rounded">
                      <div className={`h-1.5 rounded ${pct === 100 ? 'bg-green-500' : 'bg-blue-500'}`} style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-xs text-gray-500">{shifts.length} calls</span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
};

export default EventsPage;
