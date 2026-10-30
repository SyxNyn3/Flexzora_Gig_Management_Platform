import { useState } from 'react';
import { Link } from 'react-router-dom';
import { PAY_RULES, FEDERAL_BASELINE } from '@/lib/payRules';

/**
 * Public pay-rules reference — payday, final pay, daily OT and break
 * rules by state. Pre-login on purpose: it is genuinely useful to crew
 * whether or not they join, which is exactly the kind of trust the
 * waitlist is built on. Informational only — not legal advice.
 */

export default function PayRulesPage() {
  const [code, setCode] = useState('CA');
  const rule = PAY_RULES.find((r) => r.code === code) ?? PAY_RULES[0];

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-200">
      <div className="max-w-3xl mx-auto px-4 py-12">
        <Link to="/" className="text-sm text-zinc-500 hover:text-white transition-colors">
          ← Flexzora
        </Link>
        <h1 className="mt-4 text-3xl font-bold text-white">
          Know your pay rules.
        </h1>
        <p className="mt-2 text-zinc-400">
          Payday law, final paycheck deadlines, daily overtime and break rules —
          by state. The short version of what your employer actually owes you,
          on the timeline the law sets — not the one they set.
        </p>

        {/* Federal baseline — applies everywhere */}
        <div className="mt-8 rounded-xl border border-white/10 bg-zinc-900/60 p-6">
          <h2 className="text-lg font-semibold text-white">{FEDERAL_BASELINE.title}</h2>
          <ul className="mt-3 space-y-2 text-sm text-zinc-300">
            <li>• {FEDERAL_BASELINE.overtime}</li>
            <li>• {FEDERAL_BASELINE.payday}</li>
            <li>• {FEDERAL_BASELINE.minimum}</li>
            <li>• {FEDERAL_BASELINE.record}</li>
          </ul>
        </div>

        {/* State picker */}
        <div className="mt-6 flex flex-wrap gap-2">
          {PAY_RULES.map((r) => (
            <button
              key={r.code}
              onClick={() => setCode(r.code)}
              className={`px-3 py-1.5 rounded-md text-sm border transition-colors ${
                code === r.code
                  ? 'border-emerald-400/60 bg-emerald-400/10 text-emerald-300'
                  : 'border-white/10 bg-zinc-900/60 text-zinc-400 hover:text-white'
              }`}
            >
              {r.code}
            </button>
          ))}
        </div>

        {/* Selected state card */}
        <div className="mt-4 rounded-xl border border-white/10 bg-zinc-900/60 p-6">
          <h2 className="text-lg font-semibold text-white">{rule.state}</h2>
          <dl className="mt-4 space-y-4 text-sm">
            <div>
              <dt className="font-medium text-zinc-400">Payday</dt>
              <dd className="text-zinc-200">{rule.payday}</dd>
            </div>
            <div>
              <dt className="font-medium text-zinc-400">Final paycheck</dt>
              <dd className="text-zinc-200">{rule.finalPay}</dd>
            </div>
            <div>
              <dt className="font-medium text-zinc-400">Daily overtime</dt>
              <dd className="text-zinc-200">{rule.dailyOT}</dd>
            </div>
            <div>
              <dt className="font-medium text-zinc-400">Breaks</dt>
              <dd className="text-zinc-200">{rule.breaks}</dd>
            </div>
          </dl>
        </div>

        <p className="mt-6 text-xs text-zinc-500">
          Informational summary, not legal advice. Rules change — your state
          labor department publishes the definitive version. If a company owes
          you money, the written rate on your call sheet plus your clock records
          are the paper trail a wage claim starts from.
        </p>
      </div>
    </div>
  );
}
