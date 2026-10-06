import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  ArrowRight,
  Radio,
  Users,
  ClipboardList,
  MapPin,
  BadgeDollarSign,
  LayoutDashboard,
  Percent,
  ShieldCheck,
  FileSpreadsheet,
  Award,
  Zap,
  ChevronRight,
} from 'lucide-react';
import { useWaitlistStats } from '@/hooks/useWaitlistStats';

const howItWorks = [
  {
    number: '01',
    title: 'Post the call',
    description: 'Build events with modular shifts — headcount, role, rate, and required certifications per call.',
    icon: ClipboardList,
  },
  {
    number: '02',
    title: 'Match & book',
    description: 'Your trusted roster hears it first. Match % ranks the local crew before the call goes public.',
    icon: Percent,
  },
  {
    number: '03',
    title: 'Clock in on site',
    description: 'Geofenced check-in at the venue. No more texting "are you here yet?" at call time.',
    icon: MapPin,
  },
  {
    number: '04',
    title: 'Approve & pay',
    description: 'Approve the timesheet, escrow releases, invoice auto-generates. Payouts tracked end to end.',
    icon: BadgeDollarSign,
  },
];

const companyFeatures = [
  'Multi-lane schedule & roster builder — replaces the Excel sheet',
  'Headcount enforcement on every shift, no overbooking',
  'Real-time budget tracking with escrow funding',
  'Regional OT rules applied automatically at approval',
];

const workerFeatures = [
  'Verified credential portfolio — ETCP, OSHA, lifts & certs',
  'Ranked calls with explainable Match % per shift',
  'One-tap geofenced clock-in, auto-generated timesheets',
  'Transparent payouts plus tax-year earnings exports',
];

const certifications = [
  'ETCP Arena Rigger',
  'OSHA-30',
  'OSHA-10',
  'Boom Lift Operator',
  'Forklift (ANSI B56.1)',
  'Fall Protection',
  'CPR / First Aid',
];

const shiftTypes = ['Load-In & Rigging Call', 'Show Call / System Ops', 'Strike & Load-Out'];

const Logo: React.FC<{ className?: string }> = ({ className = 'w-8 h-8' }) => (
  <div className={`${className} rounded-lg bg-primary flex items-center justify-center shrink-0`}>
    <Zap className="w-1/2 h-1/2 text-primary-foreground" strokeWidth={2.5} />
  </div>
);

const LandingPage: React.FC = () => {
  const navigate = useNavigate();
  const stats = useWaitlistStats();

  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
      {/* Navigation */}
      <nav className="sticky top-0 z-50 border-b border-border/60 bg-background/80 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-3">
              <Logo />
              <span className="text-xl font-bold tracking-tight">
                Flex<span className="text-primary">zora</span>
              </span>
            </div>
            <div className="hidden md:flex items-center gap-8 text-sm text-muted-foreground">
              <a href="#how-it-works" className="hover:text-foreground transition-colors">How it works</a>
              <a href="#companies" className="hover:text-foreground transition-colors">For companies</a>
              <a href="#crew" className="hover:text-foreground transition-colors">For crew</a>
            </div>
            <div className="flex items-center gap-2 sm:gap-3">
              <Button variant="ghost" size="sm" onClick={() => navigate('/auth')} className="hidden sm:inline-flex">
                Sign in
              </Button>
              <Button size="sm" onClick={() => navigate('/waitlist')}>
                Join the Founding Crew
              </Button>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative">
        {/* Ambient glow + grid */}
        <div className="absolute inset-0 pointer-events-none" aria-hidden>
          <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[900px] h-[500px] bg-primary/[0.07] rounded-full blur-[120px]" />
          <div className="absolute top-40 -right-40 w-[500px] h-[500px] bg-secondary/[0.05] rounded-full blur-[120px]" />
          <div
            className="absolute inset-0 opacity-[0.04]"
            style={{
              backgroundImage:
                'linear-gradient(hsl(var(--foreground)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--foreground)) 1px, transparent 1px)',
              backgroundSize: '64px 64px',
            }}
          />
        </div>

        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-16 sm:pt-28 sm:pb-24 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-primary/30 bg-primary/10 text-primary text-xs sm:text-sm font-medium mb-8">
            <Radio className="w-3.5 h-3.5 animate-pulse" />
            The operating system for load-in, show call & load-out
          </div>

          <h1 className="text-4xl sm:text-6xl lg:text-7xl font-bold tracking-tight leading-[1.05] mb-6">
            Every call. Every crew.
            <br />
            <span className="text-primary">One board.</span>
          </h1>

          <p className="text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto mb-10">
            Flexzora replaces the Excel sheets, group texts, and payroll chaos with a platform built for concert tours
            and corporate events — for the production companies running the room and the crews that make it happen.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4 mb-8">
            <Button size="lg" onClick={() => navigate('/waitlist')} className="w-full sm:w-auto text-base px-8 h-12">
              Join the Founding Crew
              <ArrowRight className="ml-2 w-5 h-5" />
            </Button>
            <Button
              size="lg"
              variant="outline"
              onClick={() => navigate('/auth')}
              className="w-full sm:w-auto text-base px-8 h-12"
            >
              Sign in
            </Button>
          </div>

          {stats.total > 0 && (
            <Badge variant="outline" className="px-4 py-2 text-sm border-border text-muted-foreground">
              <Users className="w-4 h-4 mr-2 text-primary" />
              {stats.total.toLocaleString()} founding members — {stats.companies} production companies,{' '}
              {stats.workers} crew
            </Badge>
          )}

          {/* Shift-type ticker */}
          <div className="mt-14 flex flex-wrap justify-center gap-2 sm:gap-3">
            {shiftTypes.map((s) => (
              <span
                key={s}
                className="px-4 py-2 rounded-full border border-border bg-card/60 text-xs sm:text-sm text-muted-foreground tracking-wide"
              >
                {s}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="border-t border-border/60">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-24">
          <div className="text-center mb-12 sm:mb-16">
            <p className="text-primary text-sm font-semibold tracking-widest uppercase mb-3">The run of show</p>
            <h2 className="text-3xl sm:text-4xl font-bold">From call sheet to payout in four moves</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
            {howItWorks.map((step) => (
              <div
                key={step.number}
                className="relative rounded-2xl border border-border bg-card p-6 hover:border-primary/40 transition-colors group"
              >
                <div className="flex items-center justify-between mb-5">
                  <step.icon className="w-6 h-6 text-primary" />
                  <span className="text-xs font-mono text-muted-foreground">{step.number}</span>
                </div>
                <h3 className="text-lg font-semibold mb-2">{step.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{step.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* For companies / For crew */}
      <section className="border-t border-border/60">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-24 grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-10">
          <div id="companies" className="rounded-2xl border border-border bg-card p-7 sm:p-9">
            <div className="flex items-center gap-3 mb-2">
              <LayoutDashboard className="w-5 h-5 text-primary" />
              <p className="text-primary text-sm font-semibold tracking-widest uppercase">For production companies</p>
            </div>
            <h3 className="text-2xl sm:text-3xl font-bold mb-6">Run the room, not the spreadsheet</h3>
            <ul className="space-y-4">
              {companyFeatures.map((f) => (
                <li key={f} className="flex items-start gap-3 text-sm sm:text-base text-muted-foreground">
                  <ChevronRight className="w-4 h-4 mt-1 text-primary shrink-0" />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
            <Button variant="outline" className="mt-8" onClick={() => navigate('/waitlist')}>
              Claim company early access
            </Button>
          </div>

          <div id="crew" className="rounded-2xl border border-border bg-card p-7 sm:p-9">
            <div className="flex items-center gap-3 mb-2">
              <Award className="w-5 h-5 text-secondary" />
              <p className="text-secondary text-sm font-semibold tracking-widest uppercase">For crew</p>
            </div>
            <h3 className="text-2xl sm:text-3xl font-bold mb-6">Your certs do the talking</h3>
            <ul className="space-y-4">
              {workerFeatures.map((f) => (
                <li key={f} className="flex items-start gap-3 text-sm sm:text-base text-muted-foreground">
                  <ChevronRight className="w-4 h-4 mt-1 text-secondary shrink-0" />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
            <Button variant="outline" className="mt-8" onClick={() => navigate('/waitlist')}>
              Claim crew early access
            </Button>
          </div>
        </div>
      </section>

      {/* Certifications strip */}
      <section className="border-t border-border/60">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16 text-center">
          <p className="text-muted-foreground text-sm mb-6 flex items-center justify-center gap-2">
            <ShieldCheck className="w-4 h-4 text-primary" />
            Certification-verified matching — rigger calls check ETCP before anything else
          </p>
          <div className="flex flex-wrap justify-center gap-2 sm:gap-3">
            {certifications.map((c) => (
              <span
                key={c}
                className="px-3 py-1.5 rounded-full border border-border bg-card text-xs sm:text-sm text-muted-foreground"
              >
                {c}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="border-t border-border/60 relative">
        <div className="absolute inset-0 pointer-events-none" aria-hidden>
          <div className="absolute -bottom-40 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-primary/[0.08] rounded-full blur-[120px]" />
        </div>
        <div className="relative max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-20 sm:py-28 text-center">
          <FileSpreadsheet className="w-8 h-8 text-primary mx-auto mb-6" />
          <h2 className="text-3xl sm:text-5xl font-bold tracking-tight mb-5">
            Retire the call-time group text
          </h2>
          <p className="text-lg text-muted-foreground mb-10 max-w-xl mx-auto">
            Join the founding crew shaping the platform — early access, founding pricing, and a direct line to what we
            build next.
          </p>
          <Button size="lg" onClick={() => navigate('/waitlist')} className="text-base px-10 h-12">
            Join the Founding Crew
            <ArrowRight className="ml-2 w-5 h-5" />
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/60">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Logo className="w-7 h-7" />
            <span className="font-semibold">Flexzora</span>
          </div>
          <p className="text-xs text-muted-foreground text-center">
            Built for the people who work the show. © {new Date().getFullYear()} Flexzora
          </p>
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <a href="#how-it-works" className="hover:text-foreground transition-colors">How it works</a>
            <a href="/waitlist" className="hover:text-foreground transition-colors">Waitlist</a>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
