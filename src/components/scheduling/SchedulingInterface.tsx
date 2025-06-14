import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useAuth } from '@/contexts/AuthContext';
import { 
  Calendar,
  Clock,
  Users,
  Plus,
  Settings,
  Filter,
  Search,
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
  AlertTriangle,
  CheckCircle,
  X,
  Edit,
  Trash2,
  Copy,
  ExternalLink,
  Zap,
  Globe,
  Smartphone
} from 'lucide-react';
import { format, addDays, startOfWeek, endOfWeek, startOfMonth, endOfMonth, isSameDay, isSameMonth, addWeeks, subWeeks, addMonths, subMonths, parseISO, isWithinInterval } from 'date-fns';
import { toast } from 'sonner';

interface TeamMember {
  id: string;
  name: string;
  email: string;
  avatar_url?: string;
  role: string;
  color: string;
  isAvailable: boolean;
  workingHours: {
    start: string;
    end: string;
    days: number[];
  };
}

interface ScheduleEvent {
  id: string;
  title: string;
  description?: string;
  start: Date;
  end: Date;
  type: 'appointment' | 'meeting' | 'break' | 'blocked';
  status: 'confirmed' | 'pending' | 'cancelled';
  assignedTo: string[];
  client?: {
    name: string;
    email: string;
    phone?: string;
  };
  location?: string;
  isRecurring: boolean;
  color: string;
  priority: 'low' | 'medium' | 'high';
  metadata?: any;
}

interface ConflictDetection {
  id: string;
  type: 'overlap' | 'travel_time' | 'capacity';
  severity: 'warning' | 'error';
  message: string;
  affectedEvents: string[];
  suggestedResolution?: string;
}

const SchedulingInterface: React.FC = () => {
  const { profile } = useAuth();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<'day' | 'week' | 'month'>('week');
  const [timeIncrement, setTimeIncrement] = useState<15 | 30 | 60>(30);
  const [selectedEvent, setSelectedEvent] = useState<ScheduleEvent | null>(null);
  const [showEventDialog, setShowEventDialog] = useState(false);
  const [showSettingsDialog, setShowSettingsDialog] = useState(false);
  const [draggedEvent, setDraggedEvent] = useState<ScheduleEvent | null>(null);
  const [selectedTeamMembers, setSelectedTeamMembers] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [conflicts, setConflicts] = useState<ConflictDetection[]>([]);
  const [loading, setLoading] = useState(false);

  // Mock data
  const [teamMembers] = useState<TeamMember[]>([
    {
      id: '1',
      name: 'Sarah Johnson',
      email: 'sarah@company.com',
      avatar_url: '',
      role: 'Project Manager',
      color: '#3B82F6',
      isAvailable: true,
      workingHours: { start: '09:00', end: '17:00', days: [1, 2, 3, 4, 5] }
    },
    {
      id: '2',
      name: 'Mike Chen',
      email: 'mike@company.com',
      avatar_url: '',
      role: 'Developer',
      color: '#10B981',
      isAvailable: true,
      workingHours: { start: '10:00', end: '18:00', days: [1, 2, 3, 4, 5] }
    },
    {
      id: '3',
      name: 'Emily Davis',
      email: 'emily@company.com',
      avatar_url: '',
      role: 'Designer',
      color: '#8B5CF6',
      isAvailable: false,
      workingHours: { start: '09:00', end: '17:00', days: [1, 2, 3, 4, 5] }
    },
    {
      id: '4',
      name: 'Alex Rodriguez',
      email: 'alex@company.com',
      avatar_url: '',
      role: 'Consultant',
      color: '#F59E0B',
      isAvailable: true,
      workingHours: { start: '08:00', end: '16:00', days: [1, 2, 3, 4, 5] }
    }
  ]);

  const [events, setEvents] = useState<ScheduleEvent[]>([
    {
      id: '1',
      title: 'Client Meeting - Project Kickoff',
      description: 'Initial project discussion and requirements gathering',
      start: new Date(2024, 0, 15, 10, 0),
      end: new Date(2024, 0, 15, 11, 30),
      type: 'meeting',
      status: 'confirmed',
      assignedTo: ['1', '2'],
      client: { name: 'John Smith', email: 'john@client.com', phone: '+1 555-0123' },
      location: 'Conference Room A',
      isRecurring: false,
      color: '#3B82F6',
      priority: 'high'
    },
    {
      id: '2',
      title: 'Design Review',
      description: 'Review wireframes and mockups',
      start: new Date(2024, 0, 15, 14, 0),
      end: new Date(2024, 0, 15, 15, 0),
      type: 'meeting',
      status: 'pending',
      assignedTo: ['3'],
      location: 'Design Studio',
      isRecurring: false,
      color: '#8B5CF6',
      priority: 'medium'
    },
    {
      id: '3',
      title: 'Development Sprint Planning',
      description: 'Plan next sprint tasks and timeline',
      start: new Date(2024, 0, 16, 9, 0),
      end: new Date(2024, 0, 16, 10, 30),
      type: 'meeting',
      status: 'confirmed',
      assignedTo: ['2', '4'],
      location: 'Virtual - Zoom',
      isRecurring: true,
      color: '#10B981',
      priority: 'high'
    }
  ]);

  // Navigation functions
  const navigateDate = (direction: 'prev' | 'next') => {
    if (viewMode === 'day') {
      setCurrentDate(prev => direction === 'next' ? addDays(prev, 1) : addDays(prev, -1));
    } else if (viewMode === 'week') {
      setCurrentDate(prev => direction === 'next' ? addWeeks(prev, 1) : subWeeks(prev, 1));
    } else {
      setCurrentDate(prev => direction === 'next' ? addMonths(prev, 1) : subMonths(prev, 1));
    }
  };

  const goToToday = () => {
    setCurrentDate(new Date());
  };

  // Event management
  const createEvent = (startTime: Date, endTime: Date, assignedTo: string[] = []) => {
    const newEvent: ScheduleEvent = {
      id: Date.now().toString(),
      title: 'New Appointment',
      start: startTime,
      end: endTime,
      type: 'appointment',
      status: 'pending',
      assignedTo,
      isRecurring: false,
      color: '#3B82F6',
      priority: 'medium'
    };
    
    setEvents(prev => [...prev, newEvent]);
    setSelectedEvent(newEvent);
    setShowEventDialog(true);
  };

  const updateEvent = (eventId: string, updates: Partial<ScheduleEvent>) => {
    setEvents(prev => prev.map(event => 
      event.id === eventId ? { ...event, ...updates } : event
    ));
  };

  const deleteEvent = (eventId: string) => {
    setEvents(prev => prev.filter(event => event.id !== eventId));
    setShowEventDialog(false);
    toast.success('Event deleted successfully');
  };

  // Drag and drop functionality
  const handleDragStart = (event: ScheduleEvent) => {
    setDraggedEvent(event);
  };

  const handleDragEnd = () => {
    setDraggedEvent(null);
  };

  const handleDrop = (newStart: Date, newEnd: Date) => {
    if (draggedEvent) {
      updateEvent(draggedEvent.id, { start: newStart, end: newEnd });
      setDraggedEvent(null);
      toast.success('Event moved successfully');
    }
  };

  // Conflict detection
  const detectConflicts = useCallback(() => {
    const newConflicts: ConflictDetection[] = [];
    
    events.forEach((event, index) => {
      events.slice(index + 1).forEach(otherEvent => {
        // Check for overlapping events with same team members
        const hasCommonMembers = event.assignedTo.some(id => otherEvent.assignedTo.includes(id));
        // Improved conflict detection algorithm
        const isOverlapping = (
          // Event starts during other event
          (event.start >= otherEvent.start && event.start < otherEvent.end) ||
          // Event ends during other event
          (event.end > otherEvent.start && event.end <= otherEvent.end) ||
          // Event completely contains other event
          (event.start <= otherEvent.start && event.end >= otherEvent.end) ||
          // Event is completely contained by other event
          (event.start >= otherEvent.start && event.end <= otherEvent.end)
        );
        
        if (hasCommonMembers && isOverlapping) {
          newConflicts.push({
            id: `conflict-${event.id}-${otherEvent.id}`,
            type: 'overlap',
            severity: 'error',
            message: `Schedule conflict between "${event.title}" and "${otherEvent.title}"`,
            affectedEvents: [event.id, otherEvent.id],
            suggestedResolution: 'Reschedule one of the conflicting events'
          });
        }
      });
    });
    
    setConflicts(newConflicts);
  }, [events]);

  useEffect(() => {
    detectConflicts();
  }, [detectConflicts]);

  // Time slot generation
  const generateTimeSlots = () => {
    const slots = [];
    const startHour = 8;
    const endHour = 18;
    
    for (let hour = startHour; hour < endHour; hour++) {
      for (let minute = 0; minute < 60; minute += timeIncrement) {
        slots.push({
          time: `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`,
          hour,
          minute
        });
      }
    }
    
    return slots;
  };

  // Get events for current view
  const getEventsForView = () => {
    let startDate: Date;
    let endDate: Date;
    
    if (viewMode === 'day') {
      startDate = new Date(currentDate);
      endDate = new Date(currentDate);
    } else if (viewMode === 'week') {
      startDate = startOfWeek(currentDate, { weekStartsOn: 1 });
      endDate = endOfWeek(currentDate, { weekStartsOn: 1 });
    } else {
      startDate = startOfMonth(currentDate);
      endDate = endOfMonth(currentDate);
    }
    
    return events.filter(event => 
      isWithinInterval(event.start, { start: startDate, end: endDate }) ||
      isWithinInterval(event.end, { start: startDate, end: endDate })
    );
  };

  // Filter team members
  const filteredTeamMembers = teamMembers.filter(member => 
    selectedTeamMembers.length === 0 || selectedTeamMembers.includes(member.id)
  );

  const getDateRange = () => {
    if (viewMode === 'day') {
      return format(currentDate, 'EEEE, MMMM d, yyyy');
    } else if (viewMode === 'week') {
      const start = startOfWeek(currentDate, { weekStartsOn: 1 });
      const end = endOfWeek(currentDate, { weekStartsOn: 1 });
      return `${format(start, 'MMM d')} - ${format(end, 'MMM d, yyyy')}`;
    } else {
      return format(currentDate, 'MMMM yyyy');
    }
  };

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <h1 className="text-2xl font-bold text-gray-900">Schedule</h1>
            <div className="flex items-center space-x-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigateDate('prev')}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={goToToday}
              >
                Today
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigateDate('next')}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            <div className="text-lg font-medium text-gray-700">
              {getDateRange()}
            </div>
          </div>

          <div className="flex items-center space-x-3">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search events..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 w-64"
              />
            </div>

            {/* View Mode Tabs */}
            <Tabs value={viewMode} onValueChange={(value) => setViewMode(value as any)}>
              <TabsList>
                <TabsTrigger value="day">Day</TabsTrigger>
                <TabsTrigger value="week">Week</TabsTrigger>
                <TabsTrigger value="month">Month</TabsTrigger>
              </TabsList>
            </Tabs>

            {/* Actions */}
            <Button onClick={() => createEvent(new Date(), addDays(new Date(), 0))}>
              <Plus className="h-4 w-4 mr-2" />
              New Event
            </Button>
            <Button variant="outline" onClick={() => setShowSettingsDialog(true)}>
              <Settings className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Conflicts Alert */}
        {conflicts.length > 0 && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
            <div className="flex items-center">
              <AlertTriangle className="h-5 w-5 text-red-600 mr-2" />
              <span className="text-red-800 font-medium">
                {conflicts.length} scheduling conflict{conflicts.length !== 1 ? 's' : ''} detected
              </span>
              <Button variant="link" className="ml-auto text-red-600">
                Review Conflicts
              </Button>
            </div>
          </div>
        )}
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <div className="w-80 bg-white border-r border-gray-200 flex flex-col">
          {/* Team Members */}
          <div className="p-4 border-b border-gray-200">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-medium text-gray-900">Team Members</h3>
              <Button variant="ghost" size="sm">
                <Filter className="h-4 w-4" />
              </Button>
            </div>
            <ScrollArea className="h-64">
              <div className="space-y-2">
                {teamMembers.map((member) => (
                  <div
                    key={member.id}
                    className={`flex items-center space-x-3 p-2 rounded-lg cursor-pointer transition-colors ${
                      selectedTeamMembers.includes(member.id)
                        ? 'bg-blue-50 border border-blue-200'
                        : 'hover:bg-gray-50'
                    }`}
                    onClick={() => {
                      setSelectedTeamMembers(prev =>
                        prev.includes(member.id)
                          ? prev.filter(id => id !== member.id)
                          : [...prev, member.id]
                      );
                    }}
                  >
                    <div className="relative">
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={member.avatar_url} />
                        <AvatarFallback style={{ backgroundColor: member.color + '20', color: member.color }}>
                          {member.name.split(' ').map(n => n[0]).join('')}
                        </AvatarFallback>
                      </Avatar>
                      <div
                        className={`absolute -bottom-1 -right-1 w-3 h-3 rounded-full border-2 border-white ${
                          member.isAvailable ? 'bg-green-500' : 'bg-gray-400'
                        }`}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {member.name}
                      </p>
                      <p className="text-xs text-gray-500 truncate">
                        {member.role}
                      </p>
                    </div>
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: member.color }}
                    />
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>

          {/* Quick Stats */}
          <div className="p-4 border-b border-gray-200">
            <h3 className="font-medium text-gray-900 mb-3">Today's Overview</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Total Events</span>
                <span className="font-medium">{getEventsForView().length}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Confirmed</span>
                <span className="font-medium text-green-600">
                  {getEventsForView().filter(e => e.status === 'confirmed').length}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Pending</span>
                <span className="font-medium text-yellow-600">
                  {getEventsForView().filter(e => e.status === 'pending').length}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Conflicts</span>
                <span className="font-medium text-red-600">{conflicts.length}</span>
              </div>
            </div>
          </div>

          {/* Calendar Integration */}
          <div className="p-4">
            <h3 className="font-medium text-gray-900 mb-3">Calendar Integration</h3>
            <div className="space-y-2">
              <Button variant="outline" className="w-full justify-start">
                <Globe className="h-4 w-4 mr-2" />
                Google Calendar
                <CheckCircle className="h-4 w-4 ml-auto text-green-500" />
              </Button>
              <Button variant="outline" className="w-full justify-start">
                <ExternalLink className="h-4 w-4 mr-2" />
                Outlook
                <X className="h-4 w-4 ml-auto text-gray-400" />
              </Button>
              <Button variant="outline" className="w-full justify-start">
                <Smartphone className="h-4 w-4 mr-2" />
                Apple Calendar
                <X className="h-4 w-4 ml-auto text-gray-400" />
              </Button>
            </div>
          </div>
        </div>

        {/* Main Calendar Area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {viewMode === 'week' && <WeekView />}
          {viewMode === 'day' && <DayView />}
          {viewMode === 'month' && <MonthView />}
        </div>
      </div>

      {/* Event Dialog */}
      <EventDialog />

      {/* Settings Dialog */}
      <SettingsDialog />
    </div>
  );

  // Week View Component
  function WeekView() {
    const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
    const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
    const timeSlots = generateTimeSlots();

    return (
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Week Header */}
        <div className="bg-white border-b border-gray-200">
          <div className="grid grid-cols-8 gap-0">
            <div className="p-4 border-r border-gray-200">
              <div className="text-xs text-gray-500 uppercase tracking-wide">Time</div>
            </div>
            {weekDays.map((day) => (
              <div key={day.toISOString()} className="p-4 text-center border-r border-gray-200 last:border-r-0">
                <div className="text-xs text-gray-500 uppercase tracking-wide">
                  {format(day, 'EEE')}
                </div>
                <div className={`text-lg font-medium mt-1 ${
                  isSameDay(day, new Date()) ? 'text-blue-600' : 'text-gray-900'
                }`}>
                  {format(day, 'd')}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Week Grid */}
        <ScrollArea className="flex-1">
          <div className="relative">
            {timeSlots.map((slot) => (
              <div key={slot.time} className="grid grid-cols-8 border-b border-gray-100">
                <div className="p-2 text-xs text-gray-500 border-r border-gray-200 text-right pr-4">
                  {slot.minute === 0 ? slot.time : ''}
                </div>
                {weekDays.map((day) => (
                  <div
                    key={`${day.toISOString()}-${slot.time}`}
                    className="relative border-r border-gray-100 last:border-r-0 min-h-[40px] hover:bg-gray-50 cursor-pointer"
                    onClick={() => {
                      const startTime = new Date(day);
                      startTime.setHours(slot.hour, slot.minute, 0, 0);
                      const endTime = new Date(startTime);
                      endTime.setMinutes(endTime.getMinutes() + timeIncrement);
                      createEvent(startTime, endTime);
                    }}
                  >
                    {/* Render events for this time slot */}
                    {getEventsForView()
                      .filter(event => {
                        const eventStart = new Date(event.start);
                        return isSameDay(eventStart, day) && 
                               eventStart.getHours() === slot.hour && 
                               eventStart.getMinutes() === slot.minute;
                      })
                      .map(event => (
                        <EventCard
                          key={event.id}
                          event={event}
                          onClick={() => {
                            setSelectedEvent(event);
                            setShowEventDialog(true);
                          }}
                          onDragStart={() => handleDragStart(event)}
                          onDragEnd={handleDragEnd}
                        />
                      ))}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </ScrollArea>
      </div>
    );
  }

  // Day View Component
  function DayView() {
    const timeSlots = generateTimeSlots();

    return (
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Day Header */}
        <div className="bg-white border-b border-gray-200 p-4">
          <div className="text-center">
            <div className="text-sm text-gray-500 uppercase tracking-wide">
              {format(currentDate, 'EEEE')}
            </div>
            <div className="text-2xl font-bold text-gray-900 mt-1">
              {format(currentDate, 'MMMM d, yyyy')}
            </div>
          </div>
        </div>

        {/* Day Grid */}
        <ScrollArea className="flex-1">
          <div className="relative">
            {timeSlots.map((slot) => (
              <div key={slot.time} className="flex border-b border-gray-100">
                <div className="w-20 p-2 text-xs text-gray-500 border-r border-gray-200 text-right pr-4">
                  {slot.minute === 0 ? slot.time : ''}
                </div>
                <div
                  className="flex-1 relative min-h-[60px] hover:bg-gray-50 cursor-pointer"
                  onClick={() => {
                    const startTime = new Date(currentDate);
                    startTime.setHours(slot.hour, slot.minute, 0, 0);
                    const endTime = new Date(startTime);
                    endTime.setMinutes(endTime.getMinutes() + timeIncrement);
                    createEvent(startTime, endTime);
                  }}
                >
                  {/* Render events for this time slot */}
                  {getEventsForView()
                    .filter(event => {
                      const eventStart = new Date(event.start);
                      return isSameDay(eventStart, currentDate) && 
                             eventStart.getHours() === slot.hour && 
                             eventStart.getMinutes() === slot.minute;
                    })
                    .map(event => (
                      <EventCard
                        key={event.id}
                        event={event}
                        onClick={() => {
                          setSelectedEvent(event);
                          setShowEventDialog(true);
                        }}
                        onDragStart={() => handleDragStart(event)}
                        onDragEnd={handleDragEnd}
                        className="w-full"
                      />
                    ))}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </div>
    );
  }

  // Month View Component
  function MonthView() {
    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(currentDate);
    const calendarStart = startOfWeek(monthStart, { weekStartsOn: 1 });
    const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
    
    const days = [];
    let day = calendarStart;
    
    while (day <= calendarEnd) {
      days.push(day);
      day = addDays(day, 1);
    }

    return (
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Month Header */}
        <div className="bg-white border-b border-gray-200">
          <div className="grid grid-cols-7 gap-0">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((dayName) => (
              <div key={dayName} className="p-4 text-center border-r border-gray-200 last:border-r-0">
                <div className="text-xs text-gray-500 uppercase tracking-wide font-medium">
                  {dayName}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Month Grid */}
        <div className="flex-1 grid grid-cols-7 gap-0">
          {days.map((day) => (
            <div
              key={day.toISOString()}
              className={`border-r border-b border-gray-200 last:border-r-0 p-2 min-h-[120px] cursor-pointer hover:bg-gray-50 ${
                !isSameMonth(day, currentDate) ? 'bg-gray-50 text-gray-400' : 'bg-white'
              }`}
              onClick={() => {
                const startTime = new Date(day);
                startTime.setHours(9, 0, 0, 0);
                const endTime = new Date(startTime);
                endTime.setHours(10, 0, 0, 0);
                createEvent(startTime, endTime);
              }}
            >
              <div className={`text-sm font-medium mb-1 ${
                isSameDay(day, new Date()) ? 'text-blue-600' : ''
              }`}>
                {format(day, 'd')}
              </div>
              <div className="space-y-1">
                {getEventsForView()
                  .filter(event => isSameDay(new Date(event.start), day))
                  .slice(0, 3)
                  .map(event => (
                    <div
                      key={event.id}
                      className="text-xs p-1 rounded truncate cursor-pointer"
                      style={{ backgroundColor: event.color + '20', color: event.color }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedEvent(event);
                        setShowEventDialog(true);
                      }}
                    >
                      {event.title}
                    </div>
                  ))}
                {getEventsForView().filter(event => isSameDay(new Date(event.start), day)).length > 3 && (
                  <div className="text-xs text-gray-500">
                    +{getEventsForView().filter(event => isSameDay(new Date(event.start), day)).length - 3} more
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Event Card Component
  function EventCard({ 
    event, 
    onClick, 
    onDragStart, 
    onDragEnd, 
    className = '' 
  }: { 
    event: ScheduleEvent;
    onClick: () => void;
    onDragStart: () => void;
    onDragEnd: () => void;
    className?: string;
  }) {
    const duration = (event.end.getTime() - event.start.getTime()) / (1000 * 60);
    const height = Math.max((duration / timeIncrement) * 40, 40);

    return (
      <div
        className={`absolute left-1 right-1 rounded-md p-2 cursor-pointer shadow-sm border-l-4 ${className}`}
        style={{
          backgroundColor: event.color + '15',
          borderLeftColor: event.color,
          height: `${height}px`,
          zIndex: 10
        }}
        onClick={onClick}
        draggable
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
      >
        <div className="text-xs font-medium text-gray-900 truncate">
          {event.title}
        </div>
        <div className="text-xs text-gray-600 truncate">
          {format(event.start, 'HH:mm')} - {format(event.end, 'HH:mm')}
        </div>
        {event.client && (
          <div className="text-xs text-gray-500 truncate">
            {event.client.name}
          </div>
        )}
        <div className="flex items-center mt-1 space-x-1">
          <Badge
            variant={event.status === 'confirmed' ? 'default' : 'secondary'}
            className="text-xs"
          >
            {event.status}
          </Badge>
          {event.priority === 'high' && (
            <AlertTriangle className="h-3 w-3 text-red-500" />
          )}
          {event.isRecurring && (
            <div className="w-2 h-2 rounded-full bg-blue-500" />
          )}
        </div>
      </div>
    );
  }

  // Event Dialog Component
  function EventDialog() {
    if (!selectedEvent) return null;

    // Create a local copy of the event for editing
    const [localEvent, setLocalEvent] = useState<ScheduleEvent>({...selectedEvent});
    
    // Update local event when selected event changes
    useEffect(() => {
      setLocalEvent({...selectedEvent});
    }, [selectedEvent]);

    // Handle input changes
    const handleInputChange = (field: string, value: any) => {
      setLocalEvent(prev => ({
        ...prev,
        [field]: value
      }));
    };

    // Save changes
    const saveChanges = () => {
      updateEvent(selectedEvent.id, localEvent);
      setShowEventDialog(false);
      toast.success('Event updated successfully');
    };
    return (
      <Dialog open={showEventDialog} onOpenChange={setShowEventDialog}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Event Details</DialogTitle>
            <DialogDescription>
              View and edit event information
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                value={localEvent.title}
                onChange={(e) => handleInputChange('title', e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="start">Start Time</Label>
                <Input
                  id="start"
                  type="datetime-local"
                  value={format(localEvent.start, "yyyy-MM-dd'T'HH:mm")}
                  onChange={(e) => handleInputChange('start', new Date(e.target.value))}
                />
              </div>
              <div>
                <Label htmlFor="end">End Time</Label>
                <Input
                  id="end"
                  type="datetime-local"
                  value={format(localEvent.end, "yyyy-MM-dd'T'HH:mm")}
                  onChange={(e) => handleInputChange('end', new Date(e.target.value))}
                />
              </div>
            </div>

            <div>
              <Label htmlFor="description">Description</Label>
              <Input
                id="description"
                value={localEvent.description || ''}
                onChange={(e) => handleInputChange('description', e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="type">Type</Label>
                <Select
                  value={localEvent.type}
                  onValueChange={(value) => handleInputChange('type', value)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="appointment">Appointment</SelectItem>
                    <SelectItem value="meeting">Meeting</SelectItem>
                    <SelectItem value="break">Break</SelectItem>
                    <SelectItem value="blocked">Blocked</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="status">Status</Label>
                <Select
                  value={localEvent.status}
                  onValueChange={(value) => handleInputChange('status', value)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="confirmed">Confirmed</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {selectedEvent.client && (
              <div className="p-4 bg-gray-50 rounded-lg">
                <h4 className="font-medium mb-2">Client Information</h4>
                <div className="space-y-2 text-sm">
                  <div>Name: {selectedEvent.client.name}</div>
                  <div>Email: {selectedEvent.client.email}</div>
                  {selectedEvent.client.phone && (
                    <div>Phone: {selectedEvent.client.phone}</div>
                  )}
                </div>
              </div>
            )}

            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <Switch
                  checked={localEvent.isRecurring}
                  onCheckedChange={(checked) => handleInputChange('isRecurring', checked)}
                />
                <Label>Recurring Event</Label>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="destructive"
              onClick={() => {
                deleteEvent(selectedEvent.id);
                setShowEventDialog(false);
              }}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete
            </Button>
            <Button variant="outline" onClick={() => setShowEventDialog(false)}>
              Cancel
            </Button>
            <Button onClick={() => {
              updateEvent(selectedEvent.id, selectedEvent);
              setShowEventDialog(false);
              toast.success('Event updated successfully');
            }}>
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  // Settings Dialog Component
  function SettingsDialog() {
    return (
      <Dialog open={showSettingsDialog} onOpenChange={setShowSettingsDialog}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Schedule Settings</DialogTitle>
            <DialogDescription>
              Configure your scheduling preferences
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-6">
            <div>
              <Label>Time Increment</Label>
              <Select
                value={timeIncrement.toString()}
                onValueChange={(value) => setTimeIncrement(parseInt(value) as any)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="15">15 minutes</SelectItem>
                  <SelectItem value="30">30 minutes</SelectItem>
                  <SelectItem value="60">60 minutes</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Working Hours</Label>
              <div className="grid grid-cols-2 gap-4 mt-2">
                <div>
                  <Label className="text-sm">Start</Label>
                  <Input type="time" defaultValue="09:00" />
                </div>
                <div>
                  <Label className="text-sm">End</Label>
                  <Input type="time" defaultValue="17:00" />
                </div>
              </div>
            </div>

            <div>
              <Label>Booking Rules</Label>
              <div className="space-y-3 mt-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm">Allow same-day booking</span>
                  <Switch defaultChecked />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">Require confirmation</span>
                  <Switch defaultChecked />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">Auto-detect conflicts</span>
                  <Switch defaultChecked />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">Send email notifications</span>
                  <Switch defaultChecked />
                </div>
              </div>
            </div>

            <div>
              <Label>Buffer Time</Label>
              <Select defaultValue="15">
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">No buffer</SelectItem>
                  <SelectItem value="15">15 minutes</SelectItem>
                  <SelectItem value="30">30 minutes</SelectItem>
                  <SelectItem value="60">60 minutes</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSettingsDialog(false)}>
              Cancel
            </Button>
            <Button onClick={() => {
              setShowSettingsDialog(false);
              toast.success('Settings saved successfully');
            }}>
              Save Settings
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }
};

export default SchedulingInterface;