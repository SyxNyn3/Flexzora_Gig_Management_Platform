import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { StickyScrollSection } from './StickyScrollSection';
import { Badge } from '@/components/ui/badge';
import {
  Calendar,
  DollarSign,
  Building2,
  Users,
  TrendingUp,
  CheckCircle,
  ArrowRight,
  Star,
  Zap,
  Shield,
  Clock,
  HardHat,
  Radio,
  Lightbulb,
  AudioLines,
  MonitorPlay,
  Award,
} from 'lucide-react';
import { useWaitlistStats } from '@/hooks/useWaitlistStats';

const roles = [
  { icon: AudioLines, title: 'A1 Audio Engineer', desc: 'FOH & system ops' },
  { icon: Lightbulb, title: 'L2 Lighting Tech', desc: 'Consoles & LED rigs' },
  { icon: MonitorPlay, title: 'Video Wall Lead', desc: 'Playback & processing' },
  { icon: HardHat, title: 'Stagehand', desc: 'Load-in, deck, strike' },
  { icon: Radio, title: 'RF / Comms Tech', desc: 'Coordination & wireless' },
  { icon: Award, title: 'ETCP Arena Rigger', desc: 'Certified rigging calls' },
];

const callTypes = [
  'Load-In & Rigging Call',
  'Show Call / System Ops',
  'Strike & Load-Out',
];

const certifications = ['ETCP Arena Rigger', 'OSHA-30', 'Boom Lift Operator'];

const features = [
  {
    icon: Calendar,
    title: 'Unified Call Sheet',
    description:
      'Every shift across every production company in one calendar — conflict detection flags a Show Call before it collides with a load-in.',
  },
  {
    icon: DollarSign,
    title: 'Escrow-Backed Pay',
    description:
      'Companies fund escrow when they book. Approved timesheets release payouts automatically — no more chasing invoices after strike.',
  },
  {
    icon: Building2,
    title: 'Direct Production Network',
    description:
      'Connect with the staging companies already calling you. Roster broadcasts, crew offers, and gig comms in one place.',
  },
  {
    icon: Shield,
    title: 'Credential Gatekeeping',
    description:
      'ETCP, OSHA-30, and lift certifications are verified on your profile — companies see them before the offer goes out.',
  },
  {
    icon: Clock,
    title: 'Geofenced Timesheets',
    description:
      'Clock in from the dock. GPS-verified timesheets mean hours are approved faster and disputes disappear.',
  },
  {
    icon: TrendingUp,
    title: 'Match Scoring',
    description:
      'Open calls rank by fit — your rate, certs, distance to the venue, and past ratings decide who surfaces first.',
  },
];

const companies = [
  'Rhino Staging',
  'Giglife',
  'PCE',
  'Stagehands Inc.',
  'G2 Production',
  'Onstage Systems',
];

const steps = [
  {
    number: '01',
    title: 'Build your crew card',
    description: 'Rate, certifications, and availability — your profile is the credential companies check first.',
  },
  {
    number: '02',
    title: 'Link your companies',
    description: 'Connect the production accounts you already work with so calls land in one feed.',
  },
  {
    number: '03',
    title: 'Take the call',
    description: 'Accept gigs, see the venue, call time, and escrow status before you pack the truck.',
  },
  {
    number: '04',
    title: 'Clock out, get paid',
    description: 'Approved timesheets release escrowed pay automatically. Track every dollar to tax season.',
  },
];

const LandingPage: React.FC = () => {
  const navigate = useNavigate();
  const { total: waitlistCount } = useWaitlistStats();

  return (
    <div className="min-h-screen bg-[#0A0A0B] text-zinc-100 antialiased">
      {/* Navigation */}
      <nav className="sticky top-0 z-50 border-b border-white/10 bg-[#0A0A0B]/80 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-amber-400 rounded-md flex items-center justify-center">
                <span className="text-zinc-950 font-black text-lg">F</span>
              </div>
              <span className="text-xl font-bold tracking-tight text-white">FlexZora</span>
              <span className="hidden sm:inline text-[11px] font-medium tracking-[0.2em] uppercase text-zinc-500 mt-1">
                Crew Marketplace
              </span>
            </div>
            <div className="flex items-center space-x-2 sm:space-x-4">
              <Button
                variant="ghost"
                onClick={() => navigate('/auth')}
                className="hidden sm:inline-flex text-zinc-300 hover:text-white hover:bg-white/5"
              >
                Sign In
              </Button>
              <Button
                onClick={() => navigate('/waitlist')}
                className="bg-amber-400 text-zinc-950 hover:bg-amber-300 font-semibold"
              >
                Join the Founding Crew
              </Button>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              'linear-gradient(rgba(255,255,255,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.6) 1px, transparent 1px)',
            backgroundSize: '56px 56px',
          }}
        />
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[900px] h-[500px] bg-amber-400/10 blur-[140px] rounded-full pointer-events-none" />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 pb-20 lg:pt-24 lg:pb-28">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            <div className="text-center lg:text-left">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-amber-400/30 bg-amber-400/10 text-amber-300 text-xs font-semibold tracking-wide uppercase mb-6">
                <Zap className="w-3.5 h-3.5" />
                Private beta — live events only
              </div>
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black text-white leading-[1.05] tracking-tight mb-6">
                From load-in to load-out,{' '}
                <span className="text-amber-400">crew calls run through FlexZora.</span>
              </h1>
              <p className="text-lg lg:text-xl text-zinc-400 mb-8 leading-relaxed max-w-xl mx-auto lg:mx-0">
                The marketplace for concert and corporate event production — staging companies post calls, verified
                crew book them, escrow pays out the moment timesheets approve.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center lg:justify-start">
                <Button
                  size="lg"
                  onClick={() => navigate('/waitlist')}
                  className="bg-amber-400 text-zinc-950 hover:bg-amber-300 font-semibold text-base px-8 h-12"
                >
                  Join the Founding Crew
                  <ArrowRight className="ml-2 w-5 h-5" />
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  onClick={() => navigate('/schedule-demo')}
                  className="border-zinc-700 text-zinc-200 hover:bg-white/5 hover:text-white text-base px-8 h-12"
                >
                  Schedule a Demo
                </Button>
              </div>
              <div className="mt-6">
                <Badge
                  variant="outline"
                  className="px-4 py-1.5 text-sm font-medium bg-white/5 border-white/15 text-zinc-300"
                >
                  <Users className="w-4 h-4 mr-2 text-amber-400" />
                  {waitlistCount.toLocaleString()} crew &amp; companies already lined up
                </Badge>
              </div>
              <div className="flex flex-wrap items-center justify-center lg:justify-start mt-8 gap-x-6 gap-y-2 text-sm text-zinc-500">
                <span className="flex items-center">
                  <CheckCircle className="w-4 h-4 text-amber-400 mr-2" />
                  Early access pricing
                </span>
                <span className="flex items-center">
                  <CheckCircle className="w-4 h-4 text-amber-400 mr-2" />
                  Founding member badge
                </span>
                <span className="flex items-center">
                  <CheckCircle className="w-4 h-4 text-amber-400 mr-2" />
                  Shape the product
                </span>
              </div>
            </div>

            {/* Hero image mosaic */}
            <div className="relative grid grid-cols-2 gap-4">
              <div className="col-span-2 relative group">
                <img
                  src="https://images.pexels.com/photos/1190297/pexels-photo-1190297.jpeg?auto=compress&cs=tinysrgb&w=800"
                  alt="Concert stage lighting rig"
                  className="w-full h-64 object-cover rounded-2xl ring-1 ring-white/10"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-zinc-950/80 via-zinc-950/20 to-transparent rounded-2xl" />
                <div className="absolute bottom-4 left-4">
                  <div className="text-xs font-semibold tracking-widest uppercase text-amber-300 mb-1">
                    Show Call / System Ops
                  </div>
                  <div className="font-semibold text-white text-lg">Stadium Main Stage</div>
                </div>
              </div>
              <div className="relative group">
                <img
                  src="https://images.pexels.com/photos/164938/pexels-photo-164938.jpeg?auto=compress&cs=tinysrgb&w=400"
                  alt="Audio mixing console"
                  className="w-full h-44 object-cover rounded-xl ring-1 ring-white/10"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-zinc-950/80 to-transparent rounded-xl" />
                <div className="absolute bottom-3 left-3">
                  <div className="text-xs font-semibold tracking-widest uppercase text-amber-300 mb-0.5">A1 Audio</div>
                  <div className="font-medium text-white text-sm">FOH Engineering</div>
                </div>
              </div>
              <div className="relative group">
                <img
                  src="https://images.pexels.com/photos/1105666/pexels-photo-1105666.jpeg?auto=compress&cs=tinysrgb&w=400"
                  alt="Stage truss and rigging"
                  className="w-full h-44 object-cover rounded-xl ring-1 ring-white/10"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-zinc-950/80 to-transparent rounded-xl" />
                <div className="absolute bottom-3 left-3">
                  <div className="text-xs font-semibold tracking-widest uppercase text-amber-300 mb-0.5">Rigging</div>
                  <div className="font-medium text-white text-sm">ETCP Certified</div>
                </div>
              </div>
              <div className="absolute -top-6 -right-6 w-56 h-56 bg-amber-400/15 rounded-full blur-3xl pointer-events-none" />
            </div>
          </div>

          {/* Call types strip */}
          <div className="mt-16 flex flex-wrap justify-center gap-3">
            {callTypes.map((call) => (
              <span
                key={call}
                className="px-4 py-2 rounded-full border border-white/10 bg-white/[0.03] text-sm text-zinc-300 font-medium"
              >
                {call}
              </span>
            ))}
            <span className="px-4 py-2 rounded-full border border-amber-400/40 bg-amber-400/10 text-sm text-amber-300 font-medium">
              Convention Center Ballroom C
            </span>
          </div>
        </div>
      </section>

      {/* Roles */}
      <section className="py-20 border-t border-white/5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <h2 className="text-3xl lg:text-4xl font-bold text-white mb-4">Built for the whole deck</h2>
            <p className="text-lg text-zinc-400 max-w-2xl mx-auto">
              Audio, lighting, video, rigging, stagehands — if you work the call, FlexZora works for you.
            </p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {roles.map((role) => (
              <div
                key={role.title}
                className="group text-center p-5 rounded-xl border border-white/5 bg-zinc-900/50 hover:border-amber-400/40 hover:bg-zinc-900 transition-colors"
              >
                <role.icon className="w-7 h-7 mx-auto mb-3 text-amber-400" />
                <h3 className="font-semibold text-white text-sm mb-1">{role.title}</h3>
                <p className="text-xs text-zinc-500">{role.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Feature showcase */}
      <StickyScrollSection />

      {/* Core features */}
      <section className="py-20 border-t border-white/5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <h2 className="text-3xl lg:text-4xl font-bold text-white mb-4">Everything between the call and the check</h2>
            <p className="text-lg text-zinc-400 max-w-2xl mx-auto">
              Scheduling, escrow, timesheets, and credentials — the boring parts of gig work, handled.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {features.map((feature) => (
              <div
                key={feature.title}
                className="group p-6 rounded-xl border border-white/5 bg-zinc-900/50 hover:border-amber-400/30 hover:bg-zinc-900 transition-colors"
              >
                <div className="inline-flex items-center justify-center w-11 h-11 rounded-lg bg-amber-400/10 text-amber-400 mb-5">
                  <feature.icon className="w-5 h-5" />
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">{feature.title}</h3>
                <p className="text-sm text-zinc-400 leading-relaxed">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Certifications */}
      <section className="py-20 border-t border-white/5 bg-zinc-900/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl lg:text-4xl font-bold text-white mb-4">Credentials that get you booked</h2>
          <p className="text-lg text-zinc-400 max-w-2xl mx-auto mb-10">
            Verified certifications sit on your crew card — companies filter calls by them, and rigs can't fly without
            them.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            {certifications.map((cert) => (
              <div
                key={cert}
                className="flex items-center gap-2 px-5 py-3 rounded-lg border border-amber-400/30 bg-amber-400/5"
              >
                <Shield className="w-4 h-4 text-amber-400" />
                <span className="font-semibold text-white text-sm">{cert}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Partner companies */}
      <section className="py-20 border-t border-white/5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl lg:text-4xl font-bold text-white mb-4">Connect with industry leaders</h2>
            <p className="text-lg text-zinc-400">
              Integrate with the production companies you already take calls from.
            </p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {companies.map((company) => (
              <div
                key={company}
                className="px-4 py-5 rounded-lg border border-white/5 bg-zinc-900/40 text-center text-sm font-medium text-zinc-400 hover:text-white hover:border-white/15 transition-colors"
              >
                {company}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-20 border-t border-white/5 bg-zinc-900/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <h2 className="text-3xl lg:text-4xl font-bold text-white mb-4">From first call to final payout</h2>
            <p className="text-lg text-zinc-400">Four steps between you and a paid gig.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {steps.map((step, index) => (
              <div key={step.number} className="relative">
                <div className="flex items-center mb-4">
                  <span className="text-4xl font-black text-amber-400/90">{step.number}</span>
                  {index < steps.length - 1 && (
                    <div className="hidden lg:block flex-1 ml-4 h-px bg-gradient-to-r from-amber-400/40 to-transparent" />
                  )}
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">{step.title}</h3>
                <p className="text-sm text-zinc-400 leading-relaxed">{step.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonial */}
      <section className="py-20 border-t border-white/5">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="flex justify-center mb-6">
            {[...Array(5)].map((_, i) => (
              <Star key={i} className="w-5 h-5 text-amber-400 fill-amber-400" />
            ))}
          </div>
          <blockquote className="text-xl lg:text-2xl font-medium text-white mb-8 leading-relaxed">
            "I take A1 calls from three staging companies. FlexZora catches the double-bookings my calendar never did,
            and the escrow means I'm not chasing checks after load-out."
          </blockquote>
          <div className="flex items-center justify-center space-x-4">
            <div className="w-12 h-12 rounded-full bg-zinc-800 border border-white/10 flex items-center justify-center">
              <span className="text-amber-400 font-bold">SC</span>
            </div>
            <div className="text-left">
              <div className="text-white font-semibold">Sarah Chen</div>
              <div className="text-zinc-500 text-sm">A1 Audio Engineer</div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 border-t border-white/5 bg-zinc-900/30">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl lg:text-4xl font-bold text-white mb-6">The next call should come through FlexZora</h2>
          <p className="text-lg text-zinc-400 mb-8">
            Founding crew members get early access pricing and a permanent badge on their profile.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button
              size="lg"
              onClick={() => navigate('/waitlist')}
              className="bg-amber-400 text-zinc-950 hover:bg-amber-300 font-semibold text-base px-8 h-12"
            >
              Join the Founding Crew
              <ArrowRight className="ml-2 w-5 h-5" />
            </Button>
            <Button
              size="lg"
              variant="outline"
              onClick={() => navigate('/schedule-demo')}
              className="border-zinc-700 text-zinc-200 hover:bg-white/5 hover:text-white text-base px-8 h-12"
            >
              Schedule a Demo
            </Button>
          </div>
          <div className="mt-8">
            <Badge
              variant="outline"
              className="px-4 py-1.5 text-sm font-medium bg-white/5 border-white/15 text-zinc-300"
            >
              <Users className="w-4 h-4 mr-2 text-amber-400" />
              {waitlistCount.toLocaleString()} crew &amp; companies already lined up
            </Badge>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/10 bg-zinc-950 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            <div className="col-span-1 md:col-span-2">
              <div className="flex items-center space-x-3 mb-4">
                <div className="w-8 h-8 bg-amber-400 rounded-md flex items-center justify-center">
                  <span className="text-zinc-950 font-black text-lg">F</span>
                </div>
                <span className="text-xl font-bold text-white">FlexZora</span>
              </div>
              <p className="text-zinc-500 mb-4 max-w-md text-sm">
                The gig marketplace for concert and corporate event production — crew, calls, and escrow-backed pay.
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-white mb-4 text-sm uppercase tracking-wider">Product</h3>
              <ul className="space-y-2 text-zinc-500 text-sm">
                <li>
                  <a href="#" className="hover:text-white transition-colors">
                    Features
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-white transition-colors">
                    Pricing
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-white transition-colors">
                    Integrations
                  </a>
                </li>
              </ul>
            </div>
            <div>
              <h3 className="font-semibold text-white mb-4 text-sm uppercase tracking-wider">Support</h3>
              <ul className="space-y-2 text-zinc-500 text-sm">
                <li>
                  <a href="#" className="hover:text-white transition-colors">
                    Help Center
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-white transition-colors">
                    Contact Us
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-white transition-colors">
                    Status
                  </a>
                </li>
              </ul>
            </div>
          </div>
          <div className="border-t border-white/10 mt-8 pt-8 text-center text-zinc-600 text-sm">
            <p>&copy; 2026 FlexZora. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
