import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

const PRIVACY = [
  {
    h: 'What we collect',
    body: `Account details (name, email, phone, role), profile and certification information you provide, work history on the platform (shifts, timesheets, applications), approximate or precise location only when you clock in or out, payment and payout details processed by our payment partners, and waitlist/demo-request information.`,
  },
  {
    h: 'How we use it',
    body: `To operate the marketplace: matching crew to shifts, verifying clock-ins at job sites, processing escrowed payments and invoices, sending notifications about assignments and schedule changes, and improving the product during beta. We do not sell your personal information.`,
  },
  {
    h: 'Location data',
    body: `Location is collected at clock-in and clock-out events to verify attendance at a venue. We do not continuously track your device.`,
  },
  {
    h: 'Third parties',
    body: `We use Supabase (database, auth, file storage), Stripe (payments and payouts, when enabled), and transactional email providers. Each processes data only as needed to provide their service to us.`,
  },
  {
    h: 'Your choices',
    body: `You may update your profile, delete your account, or request a copy of your data by contacting us. During the beta, some records (timesheets, invoices) are retained to preserve the integrity of completed work and payments.`,
  },
  {
    h: 'Beta notice',
    body: `Flexzora is in private beta. Features, data practices, and this policy may change; material changes will be announced in-app or by email.`,
  },
];

const TERMS = [
  {
    h: 'The service',
    body: `Flexzora connects production companies with freelance event crew and provides scheduling, timekeeping, payments, and coordination tools. Flexzora is a marketplace platform, not an employer, staffing agency, or party to the working relationship between companies and crew.`,
  },
  {
    h: 'Worker terms',
    body: `You are an independent contractor. Rates shown on a shift are what you will be paid for completed, approved work. You are responsible for your certifications, taxes, and conduct on site. Cancelled or no-show commitments may affect your standing on the platform.`,
  },
  {
    h: 'Company terms',
    body: `You are responsible for accurate shift details, lawful engagement of workers, and funding escrow for confirmed work. Approving a timesheet authorizes release of the associated funds to the worker.`,
  },
  {
    h: 'Payments and escrow',
    body: `Confirmed bookings may require the company to pre-fund an escrow. Approved timesheets release labor amounts to the worker; platform fees are itemized on invoices. Disputes are handled per the dispute section below.`,
  },
  {
    h: 'Disputes',
    body: `Report payment or work disputes within 7 days of the event. Flexzora may review platform records (clock events, messages, timesheets) to mediate. Platform decisions on beta-phase disputes are made in good faith and are final for amounts held in platform escrow.`,
  },
  {
    h: 'Beta disclaimer',
    body: `The platform is provided "as is" during private beta. Features may change or break. We are not liable for lost bookings, indirect damages, or third-party venue actions. Founding Crew members may receive preferential pricing terms when paid plans launch.`,
  },
];

const LegalPage: React.FC<{ doc: 'privacy' | 'terms' }> = ({ doc }) => {
  const sections = doc === 'privacy' ? PRIVACY : TERMS;
  const title = doc === 'privacy' ? 'Privacy Policy' : 'Terms of Service';
  return (
    <div className="min-h-screen bg-[#0A0A0B] text-zinc-100">
      <div className="max-w-3xl mx-auto px-6 py-16">
        <Link to="/" className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-amber-400 mb-10">
          <ArrowLeft className="h-4 w-4" /> Back to Flexzora
        </Link>
        <h1 className="text-3xl font-black tracking-tight mb-2">{title}</h1>
        <p className="text-sm text-zinc-500 mb-10">Last updated: October 2026 · Private beta</p>
        <div className="space-y-8">
          {sections.map((s) => (
            <section key={s.h}>
              <h2 className="text-lg font-semibold text-amber-400 mb-2">{s.h}</h2>
              <p className="text-zinc-300 leading-relaxed text-[15px]">{s.body}</p>
            </section>
          ))}
        </div>
        <p className="mt-12 text-sm text-zinc-500">
          Questions? Use the demo request form or contact us through the platform.
        </p>
      </div>
    </div>
  );
};

export default LegalPage;
