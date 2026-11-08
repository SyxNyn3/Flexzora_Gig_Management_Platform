import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Home, Smartphone, HeartPulse, PiggyBank, Users, Percent, ShieldCheck,
  CreditCard, MonitorSmartphone, UtensilsCrossed, Camera, Car, Building2,
  AlertTriangle, ExternalLink, Landmark,
} from 'lucide-react';
import { Link } from 'react-router-dom';

// Crew tax playbook — the deductions 1099 workers routinely miss, plus an
// honest explainer on forming an LLC. Every section is educational, cites the
// general IRS rule, and tells the worker to verify current figures with a
// CPA/EA before relying on them. Flexzora does not give tax advice and does
// not compute deductions — the ledger/expenses tools just keep the records.

interface Deduction {
  icon: React.ReactNode;
  title: string;
  body: string;
  note?: string;
}

const MISSED_DEDUCTIONS: Deduction[] = [
  {
    icon: <Home className="w-5 h-5" />,
    title: 'Home office',
    body: 'A dedicated space used regularly and exclusively for admin work — invoicing, emails, scheduling — qualifies. The simplified method is $5 per sq ft up to 300 sq ft; the regular method takes actual costs (rent share, utilities, internet) by business-use percentage.',
    note: 'The space must be regular AND exclusive — a kitchen table doesn\'t count, a spare-room desk does.',
  },
  {
    icon: <Smartphone className="w-5 h-5" />,
    title: 'Phone & internet (business %)',
    body: 'You can deduct the business-use percentage of your phone and internet bills. The catch: you need a way to justify the percentage — call logs, data usage, or a reasonable estimate documented in your records.',
  },
  {
    icon: <HeartPulse className="w-5 h-5" />,
    title: 'Self-employed health insurance',
    body: 'Health, dental, and vision premiums for yourself, your spouse, and dependents are deductible above-the-line if you\'re not eligible for a spouse\'s employer plan. This one is missed constantly because it doesn\'t show up on Schedule C — it goes on Schedule 1.',
  },
  {
    icon: <PiggyBank className="w-5 h-5" />,
    title: 'Retirement: SEP-IRA or Solo 401(k)',
    body: '1099 income lets you contribute to retirement accounts employees can\'t touch. A SEP-IRA allows roughly 20% of net self-employment earnings; a Solo 401(k) allows employee + employer contributions and usually lets you save more. Deadlines and limits change yearly — check the current IRS figures.',
  },
  {
    icon: <Users className="w-5 h-5" />,
    title: 'Union & guild dues',
    body: 'Dues to unions, guilds, and professional associations directly related to your work are deductible — initiation fees, monthly dues, member assessments. Keep the receipts; this is exactly what the new Dues category in expenses is for.',
  },
  {
    icon: <Percent className="w-5 h-5" />,
    title: 'Agent & commission fees',
    body: 'If an agent or booking platform takes 10–20% of your fee, that commission is a deductible business expense. Record the gross fee and the commission separately — netting it silently loses the deduction trail.',
  },
  {
    icon: <ShieldCheck className="w-5 h-5" />,
    title: 'Insurance premiums',
    body: 'Liability insurance, inland-marine/gear coverage, and commercial auto on a work vehicle are deductible. Health insurance is the exception above — it goes on Schedule 1, not Schedule C.',
  },
  {
    icon: <CreditCard className="w-5 h-5" />,
    title: 'Payment processing fees',
    body: 'Stripe, PayPal, and invoicing-platform fees on client payments are deductible. If you invoice $10k and the processor takes $300, deduct the $300 — not the $10k.',
  },
  {
    icon: <MonitorSmartphone className="w-5 h-5" />,
    title: 'Software & subscriptions',
    body: 'Scheduling apps, call-sheet tools, accounting software, cloud storage, portfolio sites — the monthly stack that runs your business is deductible. Keep it business-only: your Netflix doesn\'t count.',
  },
  {
    icon: <UtensilsCrossed className="w-5 h-5" />,
    title: 'Meals while traveling (50%)',
    body: 'Meals are deductible at 50% when you\'re away from your tax home overnight for work. Per diem rates (GSA) are an alternative — pick one method and be consistent. Receipts matter over $75.',
  },
  {
    icon: <Camera className="w-5 h-5" />,
    title: 'Tools, gear & Section 179',
    body: 'Small supplies (cables, gaff tape, gloves) are routine expenses. Bigger items — cameras, consoles, cases, a work vehicle — are capital property: depreciate them over years OR elect Section 179 to expense up to the annual limit in year one, plus bonus depreciation on the remainder. Limits change yearly; a $2,500 item is usually the "is this a supply or an asset" line. Mark big purchases with the Section 179 flag in expenses and keep the receipt.',
    note: 'Bonus depreciation is phasing down (60% → 40% → 20% → 0% through 2026 under current law) — verify the current percentage before counting on it.',
  },
  {
    icon: <Car className="w-5 h-5" />,
    title: 'Vehicle: mileage OR actual expenses',
    body: 'Two methods, never both for the same miles: the IRS standard mileage rate (check the current cents-per-mile — it changes every January) needs a mileage log; actual expenses (fuel, parking, insurance, repairs, loan interest) need receipts — which you can now upload right here in expenses. A dedicated work vehicle makes actual expenses cleaner; a personal vehicle usually favors mileage.',
  },
];

const LLC_POINTS: { title: string; body: string; warn?: boolean }[] = [
  {
    title: 'An LLC is a liability shield, not a tax break by itself',
    body: 'Forming an LLC separates your personal assets from business debts and claims — someone injured by equipment you supplied, a contract dispute, a venue slip-and-fall claim naming you. It does NOT change your federal income tax: a single-member LLC is a "disregarded entity" and income still lands on Schedule C exactly like a sole prop. The tax magic only starts if you elect S-corp status.',
  },
  {
    title: 'What it actually costs',
    body: 'State filing fee ($50–$500 depending on state), articles of organization, an operating agreement (have a lawyer or a reputable template review it), a registered agent (~$100–$300/yr), an EIN (free from the IRS — never pay a site that charges for it), a separate business bank account, and annual reports or franchise taxes that vary WILDLY by state — California charges an $800/yr minimum franchise tax regardless of income; most states charge far less. File in your home state unless you have a specific reason not to — foreign-state registration adds fees everywhere.',
  },
  {
    title: 'When an LLC makes sense for crew',
    body: 'You carry real liability (vehicles, expensive gear, events with the public), you work with partners, clients require it for contracts or higher-tier gigs, or you want clean business banking that makes tax-time painless. If you\'re a solo stagehand doing W-2 calls with no gear liability, the annual cost may not earn its keep yet — that\'s an honest answer, not a sales pitch.',
  },
  {
    title: 'The S-corp election is where the money is — and the catch',
    body: 'Once net self-employment profit gets meaningfully large (many CPAs use ~$60–80k as the rough zone where it pencils out, but it depends on your state and salary level), electing S-corp status lets you pay yourself a "reasonable salary" (subject to payroll tax) and take remaining profit as distributions not hit by the 15.3% self-employment tax. The catch: real payroll, a separate tax return (1120-S), reasonable-salary rules the IRS enforces, and added admin cost. This is a CPA conversation, not a Google answer.',
    warn: true,
  },
  {
    title: 'LLC ≠ automatically better paid — but it can help',
    body: 'Companies don\'t raise your rate because you have an LLC. What changes: some production companies and venues prefer or require an entity + W-9 for 1099 work (cleaner for THEIR books and less misclassification risk), unions sometimes route payments through loan-out agreements tied to an entity, and business banking looks more professional on invoices. The leverage is optionality and cleanliness, not a rate bump.',
  },
  {
    title: 'Union & loan-out caveat',
    body: 'If you work under a union agreement, check whether your local requires a loan-out company or has its own entity rules — forming an LLC doesn\'t automatically satisfy a loan-out requirement, and some hiring halls have specific paperwork. Talk to your business agent before assuming the LLC covers it.',
  },
  {
    title: 'Basic setup order',
    body: '1) Pick your state (usually home state). 2) Name check + reserve if needed. 3) File articles of organization with the Secretary of State. 4) Get your EIN free at irs.gov. 5) Open a business bank account — NEVER commingle personal and business money, it can pierce the liability shield. 6) Operating agreement + any local business license. 7) Keep receipts like your deduction depends on it — because it does.',
  },
];

const TaxPlaybookPage: React.FC = () => {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Crew tax playbook</h1>
        <p className="text-muted-foreground">
          The deductions 1099 crew routinely miss, and an honest look at forming an LLC.
        </p>
        <div className="mt-4 flex items-start gap-2 bg-amber-500/10 border border-amber-500/30 rounded-md p-3 text-sm">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <p>
            This is education, not tax or legal advice. Tax rules change every year and vary by
            state — verify current figures with a CPA or enrolled agent before relying on them.
            IRS sources: Publication 463 (travel/vehicle), Publication 535 (business expenses),
            Schedule C instructions, and the Section 179/bonus-depreciation guidance on irs.gov.
          </p>
        </div>
      </div>

      <h2 className="text-xl font-semibold mb-4">Deductions crew miss most</h2>
      <div className="grid gap-4 sm:grid-cols-2 mb-10">
        {MISSED_DEDUCTIONS.map((d) => (
          <Card key={d.title}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <span className="text-primary">{d.icon}</span>{d.title}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">{d.body}</p>
              {d.note && <p className="text-xs text-amber-700 dark:text-amber-400 mt-2">{d.note}</p>}
            </CardContent>
          </Card>
        ))}
      </div>

      <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
        <Building2 className="w-5 h-5" /> Should you form an LLC?
      </h2>
      <div className="space-y-4 mb-10">
        {LLC_POINTS.map((p) => (
          <Card key={p.title} className={p.warn ? 'border-amber-500/40' : ''}>
            <CardContent className="py-4">
              <p className="font-medium mb-1 flex items-center gap-2">
                {p.title}
                {p.warn && <Badge variant="outline" className="text-amber-600 border-amber-500/40">CPA conversation</Badge>}
              </p>
              <p className="text-sm text-muted-foreground">{p.body}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
        <Landmark className="w-5 h-5" /> Put it into practice
      </h2>
      <Card>
        <CardContent className="py-4 space-y-2 text-sm">
          <p>
            <Link to="/ledger" className="text-primary hover:underline font-medium">Work ledger</Link>
            {' '}— log mileage and income so tax-time math starts from real numbers.
          </p>
          <p>
            <Link to="/finances" className="text-primary hover:underline font-medium">Expenses</Link>
            {' '}— record fuel, parking, dues, insurance, software, and big-ticket gear with
            receipt photos. Mark capital items with the Section 179 flag.
          </p>
          <p className="text-muted-foreground">
            Year-end packet export and quarterly estimated-tax reminders are on the roadmap —
            until then, a CPA or enrolled agent is worth the hour.
          </p>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground mt-6 flex items-center gap-1">
        <ExternalLink className="w-3 h-3" /> Primary sources: IRS Publications 463 &amp; 535,
        Schedule C / Schedule 1 instructions, irs.gov Section 179 &amp; bonus depreciation pages.
        Figures described as ranges or "check current" are intentionally not hardcoded — they change yearly.
      </p>
    </div>
  );
};

export default TaxPlaybookPage;
