import React, { useState, useEffect } from 'react';
import { Calendar, momentLocalizer, View, Views } from 'react-big-calendar';
import moment from 'moment';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { Gig, GigApplication } from '@/lib/types';
import { 
  Calendar as CalendarIcon, 
  MapPin, 
  Clock, 
  Users,
  DollarSign,
  Building
} from 'lucide-react';
import { format } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import 'react-big-calendar/lib/css/react-big-calendar.css';

const localizer = momentLocalizer(moment);

interface CalendarEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  resource: Gig;
  status: string;
}

const CalendarView: React.FC = () => {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [showEventDialog, setShowEventDialog] = useState(false);
  const [currentView, setCurrentView] = useState<View>(Views.MONTH);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (profile) {
      fetchCalendarData();
    }
  }, [profile]);

  const fetchCalendarData = async () => {
    if (!profile) return;

    try {
      setLoading(true);

      if (profile.role === 'worker') {
        // Fetch accepted gigs for workers
        const { data: applications } = await supabase
          .from('gig_applications')
          .select(`
            *,
            gig:gigs(
              *,
              company:companies(name, logo_url)
            )
          `)
          .eq('worker_id', profile.id)
          .eq('status', 'accepted');

        const workerEvents: CalendarEvent[] = (applications || [])
          .filter(app => app.gig)
          .map(app => ({
            id: app.gig!.id,
            title: app.gig!.title,
            start: new Date(app.gig!.start_date),
            end: new Date(app.gig!.end_date),
            resource: app.gig!,
            status: 'accepted',
          }));

        setEvents(workerEvents);
      } else if (profile.role === 'company') {
        // Fetch company's gigs
        const { data: gigs } = await supabase
          .from('gigs')
          .select(`
            *,
            company:companies(name, logo_url)
          `)
          .eq('created_by', profile.id)
          .in('status', ['published', 'in_progress', 'completed']);

        const companyEvents: CalendarEvent[] = (gigs || []).map(gig => ({
          id: gig.id,
          title: gig.title,
          start: new Date(gig.start_date),
          end: new Date(gig.end_date),
          resource: gig,
          status: gig.status,
        }));

        setEvents(companyEvents);
      }
    } catch (error) {
      console.error('Error fetching calendar data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectEvent = (event: CalendarEvent) => {
    setSelectedEvent(event);
    setShowEventDialog(true);
  };

  const handleNavigate = (date: Date) => {
    setCurrentDate(date);
  };

  const handleViewChange = (view: View) => {
    setCurrentView(view);
  };

  const eventStyleGetter = (event: CalendarEvent) => {
    let backgroundColor = '#3174ad';
    
    switch (event.status) {
      case 'published':
        backgroundColor = '#2563eb'; // Blue
        break;
      case 'in_progress':
        backgroundColor = '#16a34a'; // Green
        break;
      case 'completed':
        backgroundColor = '#6b7280'; // Gray
        break;
      case 'accepted':
        backgroundColor = '#059669'; // Emerald
        break;
      default:
        backgroundColor = '#3174ad';
    }

    return {
      style: {
        backgroundColor,
        borderRadius: '4px',
        opacity: 0.8,
        color: 'white',
        border: '0px',
        display: 'block',
      },
    };
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'published': return 'bg-blue-100 text-blue-800';
      case 'in_progress': return 'bg-green-100 text-green-800';
      case 'completed': return 'bg-gray-100 text-gray-800';
      case 'accepted': return 'bg-emerald-100 text-emerald-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Calendar</h1>
        <p className="text-gray-600 mt-2">
          {profile?.role === 'worker' 
            ? 'View your scheduled gigs and availability'
            : 'Manage your company\'s gig schedule'
          }
        </p>
      </div>

      {/* Calendar */}
      <Card>
        <CardContent className="p-6">
          <div style={{ height: '600px' }}>
            <Calendar
              localizer={localizer}
              events={events}
              startAccessor="start"
              endAccessor="end"
              onSelectEvent={handleSelectEvent}
              onNavigate={handleNavigate}
              onView={handleViewChange}
              view={currentView}
              date={currentDate}
              eventPropGetter={eventStyleGetter}
              popup
              views={[Views.MONTH, Views.WEEK, Views.DAY, Views.AGENDA]}
              step={60}
              showMultiDayTimes
              components={{
                toolbar: (props) => (
                  <div className="flex justify-between items-center mb-4 p-4 bg-gray-50 rounded-lg">
                    <div className="flex items-center space-x-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => props.onNavigate('PREV')}
                      >
                        ←
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => props.onNavigate('TODAY')}
                      >
                        Today
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => props.onNavigate('NEXT')}
                      >
                        →
                      </Button>
                    </div>
                    
                    <h2 className="text-xl font-semibold">
                      {props.label}
                    </h2>
                    
                    <div className="flex space-x-1">
                      {[
                        { view: Views.MONTH, label: 'Month' },
                        { view: Views.WEEK, label: 'Week' },
                        { view: Views.DAY, label: 'Day' },
                        { view: Views.AGENDA, label: 'Agenda' },
                      ].map(({ view, label }) => (
                        <Button
                          key={view}
                          variant={currentView === view ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => props.onView(view)}
                        >
                          {label}
                        </Button>
                      ))}
                    </div>
                  </div>
                ),
              }}
            />
          </div>
        </CardContent>
      </Card>

      {/* Event Details Dialog */}
      <Dialog open={showEventDialog} onOpenChange={setShowEventDialog}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center space-x-2">
              <CalendarIcon className="h-5 w-5" />
              <span>{selectedEvent?.title}</span>
            </DialogTitle>
            <DialogDescription>
              Gig details and information
            </DialogDescription>
          </DialogHeader>
          
          {selectedEvent && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Badge className={getStatusColor(selectedEvent.status)}>
                  {selectedEvent.status.charAt(0).toUpperCase() + selectedEvent.status.slice(1)}
                </Badge>
                {selectedEvent.resource.company && (
                  <div className="flex items-center text-sm text-gray-600">
                    <Building className="h-4 w-4 mr-1" />
                    {selectedEvent.resource.company.name}
                  </div>
                )}
              </div>

              <div className="space-y-3">
                <div className="flex items-center text-sm">
                  <Clock className="h-4 w-4 mr-2 text-gray-400" />
                  <div>
                    <div>{format(selectedEvent.start, 'MMM d, yyyy h:mm a')}</div>
                    <div className="text-gray-500">to {format(selectedEvent.end, 'MMM d, yyyy h:mm a')}</div>
                  </div>
                </div>

                <div className="flex items-center text-sm">
                  <MapPin className="h-4 w-4 mr-2 text-gray-400" />
                  <span>{selectedEvent.resource.location}</span>
                </div>

                {selectedEvent.resource.hourly_rate && (
                  <div className="flex items-center text-sm">
                    <DollarSign className="h-4 w-4 mr-2 text-gray-400" />
                    <span>${selectedEvent.resource.hourly_rate}/hour</span>
                  </div>
                )}

                <div className="flex items-center text-sm">
                  <Users className="h-4 w-4 mr-2 text-gray-400" />
                  <span>{selectedEvent.resource.required_workers} worker{selectedEvent.resource.required_workers !== 1 ? 's' : ''} needed</span>
                </div>
              </div>

              {selectedEvent.resource.description && (
                <div>
                  <h4 className="font-medium mb-2">Description</h4>
                  <p className="text-sm text-gray-700 bg-gray-50 p-3 rounded-lg">
                    {selectedEvent.resource.description}
                  </p>
                </div>
              )}

              <div className="flex justify-end space-x-2">
                <Button
                  variant="outline"
                  onClick={() => setShowEventDialog(false)}
                >
                  Close
                </Button>
                <Button
                  onClick={() => {
                    navigate(`/gigs/${selectedEvent.id}`);
                    setShowEventDialog(false);
                  }}
                >
                  View Details
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CalendarView;