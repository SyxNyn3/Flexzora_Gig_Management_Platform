import React, { useState, useEffect } from 'react';
import { Calendar, momentLocalizer, View, Views } from 'react-big-calendar';
import moment from 'moment';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useAuth } from '@/contexts/AuthContext';
import { supabase, DatabaseService } from '@/lib/supabase';
import { Gig, GigApplication } from '@/lib/types';
import { useCalendarEvents } from '@/hooks/useSupabaseQuery';
import { 
  Calendar as CalendarIcon, 
  MapPin, 
  Clock, 
  Users,
  DollarSign,
  Building,
  Plus,
  Bell,
  FileText,
  Save,
  X,
  Edit,
  Trash2
} from 'lucide-react';
import { format } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import 'react-big-calendar/lib/css/react-big-calendar.css';

// Helper functions for date calculations
function startOfWeek(date: Date): Date {
  const result = new Date(date);
  const day = result.getDay();
  const diff = result.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday
  result.setDate(diff);
  result.setHours(0, 0, 0, 0);
  return result;
}

function endOfWeek(date: Date): Date {
  const result = startOfWeek(date);
  result.setDate(result.getDate() + 6);
  result.setHours(23, 59, 59, 999);
  return result;
}

const localizer = momentLocalizer(moment);

interface CalendarEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  resource: Gig | CalendarNote | CalendarReminder;
  status: string;
  type: 'gig' | 'note' | 'reminder';
}

interface CalendarNote {
  id: string;
  title: string;
  content: string;
  date: string;
  color: string;
  created_at: string;
}

interface CalendarReminder {
  id: string;
  title: string;
  description: string;
  date: string;
  time: string;
  priority: 'low' | 'medium' | 'high';
  completed: boolean;
  created_at: string;
}

const CalendarView: React.FC = () => {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);
  const [notes, setNotes] = useState<CalendarNote[]>([]);
  const [reminders, setReminders] = useState<CalendarReminder[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [showEventDialog, setShowEventDialog] = useState(false);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [currentView, setCurrentView] = useState<View>(Views.MONTH);
  const [currentDate, setCurrentDate] = useState(new Date());

  // Fetch calendar events from Supabase
  const { data: dbEvents = [], loading: eventsLoading, refetch: refetchEvents } = useCalendarEvents(
    profile?.id || '',
    startOfWeek(currentDate).toISOString(),
    endOfWeek(currentDate).toISOString()
  );

  // Add item form state
  const [addType, setAddType] = useState<'note' | 'reminder'>('note');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [reminderTime, setReminderTime] = useState('09:00');
  const [reminderPriority, setReminderPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [noteColor, setNoteColor] = useState('#3B82F6');

  useEffect(() => {
    if (profile) {
      loadMockNotesAndReminders();
    }
  }, [profile]);

  // Convert database events to calendar events
  useEffect(() => {
    if (dbEvents.length > 0) {
      const formattedEvents: CalendarEvent[] = dbEvents.map(event => ({
        id: event.id,
        title: event.title,
        start: new Date(event.start_time),
        end: event.end_time ? new Date(event.end_time) : new Date(event.start_time),
        resource: event,
        status: event.event_type === 'gig' ? 'confirmed' : 'note',
        type: event.event_type as 'gig' | 'note' | 'reminder',
      }));
      
      setCalendarEvents(prev => {
        // Merge with notes and reminders
        const nonDbEvents = prev.filter(e => e.type === 'note' || e.type === 'reminder');
        return [...formattedEvents, ...nonDbEvents];
      });
    }
  }, [dbEvents]);

  const loadMockNotesAndReminders = () => {
    // Mock notes
    const mockNotes: CalendarNote[] = [
      {
        id: '1',
        title: 'Equipment Check',
        content: 'Remember to check all camera equipment before the corporate event',
        date: '2024-01-14',
        color: '#10B981',
        created_at: new Date().toISOString(),
      },
      {
        id: '2',
        title: 'Client Meeting',
        content: 'Discuss project requirements and timeline with TechCorp',
        date: '2024-01-16',
        color: '#8B5CF6',
        created_at: new Date().toISOString(),
      }
    ];

    // Mock reminders
    const mockReminders: CalendarReminder[] = [
      {
        id: '1',
        title: 'Submit Invoice',
        description: 'Submit invoice for last week\'s wedding photography gig',
        date: '2024-01-17',
        time: '10:00',
        priority: 'high',
        completed: false,
        created_at: new Date().toISOString(),
      },
      {
        id: '2',
        title: 'Equipment Maintenance',
        description: 'Schedule maintenance for lighting equipment',
        date: '2024-01-20',
        time: '14:00',
        priority: 'medium',
        completed: false,
        created_at: new Date().toISOString(),
      }
    ];

    setNotes(mockNotes);
    setReminders(mockReminders);

    // Add notes and reminders to events
    const noteEvents: CalendarEvent[] = mockNotes.map(note => ({
      id: `note-${note.id}`,
      title: `📝 ${note.title}`,
      start: new Date(`${note.date}T09:00:00`),
      end: new Date(`${note.date}T09:30:00`),
      resource: note,
      status: 'note',
      type: 'note' as const,
    }));

    const reminderEvents: CalendarEvent[] = mockReminders.map(reminder => ({
      id: `reminder-${reminder.id}`,
      title: `🔔 ${reminder.title}`,
      start: new Date(`${reminder.date}T${reminder.time}:00`),
      end: new Date(`${reminder.date}T${reminder.time}:00`),
      resource: reminder,
      status: reminder.completed ? 'completed' : reminder.priority,
      type: 'reminder' as const,
    }));

    setEvents(prev => [...prev, ...noteEvents, ...reminderEvents]);
  };

  const handleSelectEvent = (event: CalendarEvent) => {
    setSelectedEvent(event);
    setShowEventDialog(true);
  };

  const handleSelectSlot = ({ start }: { start: Date }) => {
    setSelectedDate(start);
    setShowAddDialog(true);
  };

  const handleNavigate = (date: Date) => {
    setCurrentDate(date);
  };

  const handleViewChange = (view: View) => {
    setCurrentView(view);
  };

  const addNote = async () => {
    if (!title.trim() || !selectedDate) {
      toast.error('Please fill in all required fields');
      return;
    }

    const newNote: CalendarNote = {
      id: Date.now().toString(),
      title,
      content,
      date: format(selectedDate, 'yyyy-MM-dd'),
      color: noteColor,
      created_at: new Date().toISOString(),
    };

    // Create a new calendar event
    const newCalendarEvent: CalendarEvent = {
      id: `note-${newNote.id}`,
      title: `📝 ${newNote.title}`,
      start: new Date(`${newNote.date}T09:00:00`),
      end: new Date(`${newNote.date}T09:30:00`),
      resource: newNote,
      status: 'note',
      type: 'note',
    };

    setNotes(prev => [...prev, newNote]);
    setCalendarEvents(prev => [...prev, newCalendarEvent]);
    resetForm();
    setShowAddDialog(false);
    toast.success('Note added successfully!');
  };

  const addReminder = async () => {
    if (!title.trim() || !selectedDate) {
      toast.error('Please fill in all required fields');
      return;
    }

    const newReminder: CalendarReminder = {
      id: Date.now().toString(),
      title,
      description: content,
      date: format(selectedDate, 'yyyy-MM-dd'),
      time: reminderTime,
      priority: reminderPriority,
      completed: false,
      created_at: new Date().toISOString(),
    };

    const newCalendarEvent: CalendarEvent = {
      id: `reminder-${newReminder.id}`,
      title: `🔔 ${newReminder.title}`,
      start: new Date(`${newReminder.date}T${newReminder.time}:00`),
      end: new Date(`${newReminder.date}T${newReminder.time}:00`),
      resource: newReminder,
      status: newReminder.priority,
      type: 'reminder',
    };

    setReminders(prev => [...prev, newReminder]);
    setCalendarEvents(prev => [...prev, newCalendarEvent]);
    resetForm();
    setShowAddDialog(false);
    toast.success('Reminder added successfully!');
  };

  const deleteItem = (event: CalendarEvent) => {
    if (event.type === 'note') {
      setNotes(prev => prev.filter(note => note.id !== event.resource.id));
    } else if (event.type === 'reminder') {
      setReminders(prev => prev.filter(reminder => reminder.id !== event.resource.id));
    }
    
    setCalendarEvents(prev => prev.filter(e => e.id !== event.id));
    setShowEventDialog(false);
    toast.success(`${event.type === 'note' ? 'Note' : 'Reminder'} deleted successfully!`);
  };

  const toggleReminderComplete = (reminderId: string) => {
    setReminders(prev => prev.map(reminder => 
      reminder.id === reminderId 
        ? { ...reminder, completed: !reminder.completed }
        : reminder
    ));

    setCalendarEvents(prev => prev.map(event => 
      event.id === `reminder-${reminderId}` 
        ? { ...event, status: event.status === 'completed' ? 'medium' : 'completed' }
        : event
    ));

    toast.success('Reminder updated!');
  };

  const resetForm = () => {
    setTitle('');
    setContent('');
    setReminderTime('09:00');
    setReminderPriority('medium');
    setNoteColor('#3B82F6');
  };

  const eventStyleGetter = (event: CalendarEvent) => {
    let backgroundColor = '#3174ad';
    
    if (event.type === 'note') {
      backgroundColor = (event.resource as CalendarNote).color;
    } else if (event.type === 'reminder') {
      const reminder = event.resource as CalendarReminder;
      if (reminder.completed) {
        backgroundColor = '#6B7280'; // Gray for completed
      } else {
        switch (reminder.priority) {
          case 'high': backgroundColor = '#EF4444'; break;
          case 'medium': backgroundColor = '#F59E0B'; break;
          case 'low': backgroundColor = '#10B981'; break;
        }
      }
    } else {
      // Gig events
      switch (event.status) {
        case 'published': backgroundColor = '#2563eb'; break;
        case 'in_progress': backgroundColor = '#16a34a'; break;
        case 'completed': backgroundColor = '#6b7280'; break;
        case 'accepted': backgroundColor = '#059669'; break;
      }
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
      case 'note': return 'bg-purple-100 text-purple-800';
      case 'high': return 'bg-red-100 text-red-800';
      case 'medium': return 'bg-yellow-100 text-yellow-800';
      case 'low': return 'bg-green-100 text-green-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  if (eventsLoading && !profile) {
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
            ? 'View your scheduled gigs, notes, and reminders'
            : 'Manage your company\'s gig schedule and planning'
          }
        </p>
      </div>

      {/* Calendar */}
      <Card>
        <CardContent className="p-6">
          <div style={{ height: '600px' }}>
            <Calendar
              localizer={localizer}
              events={calendarEvents}
              startAccessor="start"
              endAccessor="end"
              onSelectEvent={handleSelectEvent}
              onSelectSlot={handleSelectSlot}
              onNavigate={handleNavigate}
              onView={handleViewChange}
              view={currentView}
              date={currentDate}
              eventPropGetter={eventStyleGetter}
              selectable
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
          
          {/* Legend */}
          <div className="mt-4 p-4 bg-gray-50 rounded-lg">
            <h3 className="font-medium mb-2">Legend</h3>
            <div className="flex flex-wrap gap-4 text-sm">
              <div className="flex items-center">
                <div className="w-4 h-4 bg-blue-600 rounded mr-2"></div>
                <span>Gigs</span>
              </div>
              <div className="flex items-center">
                <div className="w-4 h-4 bg-green-600 rounded mr-2"></div>
                <span>In Progress</span>
              </div>
              <div className="flex items-center">
                <div className="w-4 h-4 bg-purple-600 rounded mr-2"></div>
                <span>Notes</span>
              </div>
              <div className="flex items-center">
                <div className="w-4 h-4 bg-yellow-500 rounded mr-2"></div>
                <span>Reminders</span>
              </div>
              <div className="flex items-center">
                <div className="w-4 h-4 bg-gray-400 rounded mr-2"></div>
                <span>Completed</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Event Details Dialog */}
      <Dialog open={showEventDialog} onOpenChange={setShowEventDialog}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center space-x-2">
              {selectedEvent?.type === 'gig' && <CalendarIcon className="h-5 w-5" />}
              {selectedEvent?.type === 'note' && <FileText className="h-5 w-5" />}
              {selectedEvent?.type === 'reminder' && <Bell className="h-5 w-5" />}
              <span>{selectedEvent?.title}</span>
            </DialogTitle>
            <DialogDescription>
              {selectedEvent?.type === 'gig' && 'Gig details and information'}
              {selectedEvent?.type === 'note' && 'Note details'}
              {selectedEvent?.type === 'reminder' && 'Reminder details'}
            </DialogDescription>
          </DialogHeader>
          
          {selectedEvent && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Badge className={getStatusColor(selectedEvent.status)}>
                  {selectedEvent.status.charAt(0).toUpperCase() + selectedEvent.status.slice(1)}
                </Badge>
                {selectedEvent.type !== 'gig' && (
                  <div className="flex space-x-2">
                    {selectedEvent.type === 'reminder' && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => toggleReminderComplete((selectedEvent.resource as CalendarReminder).id)}
                      >
                        {(selectedEvent.resource as CalendarReminder).completed ? 'Mark Incomplete' : 'Mark Complete'}
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => deleteItem(selectedEvent)}
                      className="text-red-600 hover:text-red-700"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>

              {selectedEvent.type === 'gig' && (
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
                    <span>{(selectedEvent.resource as Gig).location}</span>
                  </div>

                  {(selectedEvent.resource as Gig).hourly_rate && (
                    <div className="flex items-center text-sm">
                      <DollarSign className="h-4 w-4 mr-2 text-gray-400" />
                      <span>${(selectedEvent.resource as Gig).hourly_rate}/hour</span>
                    </div>
                  )}

                  <div className="flex items-center text-sm">
                    <Users className="h-4 w-4 mr-2 text-gray-400" />
                    <span>{(selectedEvent.resource as Gig).required_workers} worker{(selectedEvent.resource as Gig).required_workers !== 1 ? 's' : ''} needed</span>
                  </div>

                  {(selectedEvent.resource as Gig).description && (
                    <div>
                      <h4 className="font-medium mb-2">Description</h4>
                      <p className="text-sm text-gray-700 bg-gray-50 p-3 rounded-lg">
                        {(selectedEvent.resource as Gig).description}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {selectedEvent.type === 'note' && (
                <div className="space-y-3">
                  <div className="flex items-center text-sm">
                    <CalendarIcon className="h-4 w-4 mr-2 text-gray-400" />
                    <span>{format(new Date((selectedEvent.resource as CalendarNote).date), 'MMM d, yyyy')}</span>
                  </div>
                  
                  {(selectedEvent.resource as CalendarNote).content && (
                    <div>
                      <h4 className="font-medium mb-2">Content</h4>
                      <p className="text-sm text-gray-700 bg-gray-50 p-3 rounded-lg">
                        {(selectedEvent.resource as CalendarNote).content}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {selectedEvent.type === 'reminder' && (
                <div className="space-y-3">
                  <div className="flex items-center text-sm">
                    <Clock className="h-4 w-4 mr-2 text-gray-400" />
                    <span>{format(new Date(`${(selectedEvent.resource as CalendarReminder).date}T${(selectedEvent.resource as CalendarReminder).time}`), 'MMM d, yyyy h:mm a')}</span>
                  </div>
                  
                  <div className="flex items-center text-sm">
                    <Bell className="h-4 w-4 mr-2 text-gray-400" />
                    <span>Priority: {(selectedEvent.resource as CalendarReminder).priority}</span>
                  </div>
                  
                  {(selectedEvent.resource as CalendarReminder).description && (
                    <div>
                      <h4 className="font-medium mb-2">Description</h4>
                      <p className="text-sm text-gray-700 bg-gray-50 p-3 rounded-lg">
                        {(selectedEvent.resource as CalendarReminder).description}
                      </p>
                    </div>
                  )}
                </div>
              )}

              <div className="flex justify-end space-x-2">
                <Button
                  variant="outline"
                  onClick={() => setShowEventDialog(false)}
                >
                  Close
                </Button>
                {selectedEvent.type === 'gig' && (
                  <Button
                    onClick={() => {
                      navigate(`/gigs/${selectedEvent.id}`);
                      setShowEventDialog(false);
                    }}
                  >
                    View Details
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Add Note/Reminder Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center space-x-2">
              <Plus className="h-5 w-5" />
              <span>Add to Calendar</span>
            </DialogTitle>
            <DialogDescription>
              Add a note or reminder for {selectedDate && format(selectedDate, 'MMM d, yyyy')}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <Label>Type</Label>
              <Select value={addType} onValueChange={(value: 'note' | 'reminder') => setAddType(value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="note">📝 Note</SelectItem>
                  <SelectItem value="reminder">🔔 Reminder</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={addType === 'note' ? 'Note title...' : 'Reminder title...'}
              />
            </div>

            <div>
              <Label htmlFor="content">
                {addType === 'note' ? 'Content' : 'Description'}
              </Label>
              <Textarea
                id="content"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder={addType === 'note' ? 'Note content...' : 'Reminder description...'}
                rows={3}
              />
            </div>

            {addType === 'reminder' && (
              <>
                <div>
                  <Label htmlFor="time">Time</Label>
                  <Input
                    id="time"
                    type="time"
                    value={reminderTime}
                    onChange={(e) => setReminderTime(e.target.value)}
                  />
                </div>

                <div>
                  <Label>Priority</Label>
                  <Select value={reminderPriority} onValueChange={(value: 'low' | 'medium' | 'high') => setReminderPriority(value)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}

            {addType === 'note' && (
              <div>
                <Label>Color</Label>
                <div className="flex space-x-2 mt-2">
                  {['#3B82F6', '#10B981', '#8B5CF6', '#F59E0B', '#EF4444', '#6B7280'].map((color) => (
                    <button
                      key={color}
                      className={`w-8 h-8 rounded-full border-2 ${noteColor === color ? 'border-gray-800' : 'border-gray-300'}`}
                      style={{ backgroundColor: color }}
                      onClick={() => setNoteColor(color)}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>
              Cancel
            </Button>
            <Button onClick={addType === 'note' ? addNote : addReminder}>
              <Save className="h-4 w-4 mr-2" />
              Add {addType === 'note' ? 'Note' : 'Reminder'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CalendarView;