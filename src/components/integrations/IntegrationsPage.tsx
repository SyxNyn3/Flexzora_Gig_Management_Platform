import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Plug, Mail, CalendarDays, Building2 } from 'lucide-react';

/**
 * Honest placeholder for the old demo integrations surface. The previous
 * pages (company "connections", Gmail sync, unified schedule) were entirely
 * mock data — they showed fake connected companies and fake emails, which
 * violates the no-mock-data rule and confused real users.
 *
 * Real integrations are a roadmap item: Flexzora is intentionally the
 * system of record for schedules, hours, and payments, so external sync
 * (Google Calendar, Gmail, payroll exports) comes after the core loops
 * are proven with beta users.
 */
const IntegrationsPage: React.FC = () => {
  const upcoming = [
    {
      icon: CalendarDays,
      title: 'Calendar sync',
      description: 'Push shifts and bookings to Google/Apple Calendar via the existing .ics feed.',
    },
    {
      icon: Mail,
      title: 'Email notifications',
      description: 'Booking confirmations and reminders delivered to your inbox.',
    },
    {
      icon: Building2,
      title: 'Company connections',
      description: 'Companies you work with appear automatically when they book you — no manual linking.',
    },
  ];

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
          <Plug className="h-7 w-7" />
          Integrations
        </h1>
        <p className="text-muted-foreground mt-2">
          Flexzora is your system of record for schedules, hours, and payments —
          so most "integrations" other apps need, you already have here.
        </p>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>No connections yet</CardTitle>
          <CardDescription>
            There is nothing to connect right now. When companies book you,
            they show up under Connected Companies on your dashboard
            automatically.
          </CardDescription>
        </CardHeader>
      </Card>

      <h2 className="text-lg font-semibold mb-3">On the roadmap</h2>
      <div className="space-y-3">
        {upcoming.map(({ icon: Icon, title, description }) => (
          <Card key={title}>
            <CardContent className="pt-6 flex items-start gap-4">
              <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
                <Icon className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <p className="font-medium">{title}</p>
                <p className="text-sm text-muted-foreground mt-1">{description}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default IntegrationsPage;
