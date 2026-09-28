import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { MatchBreakdown } from '@/lib/types';
import { MATCH_WEIGHTS } from '@/lib/marketplace/matchScore';
import { ShieldAlert, ShieldCheck } from 'lucide-react';

interface Props {
  score: number;
  breakdown?: MatchBreakdown;
  reasons?: string[];
  size?: 'sm' | 'md';
}

const tone = (score: number, passed: boolean) => {
  if (!passed) return 'bg-red-100 text-red-700 border-red-200';
  if (score >= 80) return 'bg-green-100 text-green-800 border-green-200';
  if (score >= 60) return 'bg-amber-100 text-amber-800 border-amber-200';
  return 'bg-gray-100 text-gray-700 border-gray-200';
};

const Row: React.FC<{ label: string; value: number; weight: number }> = ({ label, value, weight }) => (
  <div className="flex items-center justify-between text-xs py-0.5">
    <span className="text-gray-600">
      {label} <span className="text-gray-400">({Math.round(weight * 100)}%)</span>
    </span>
    <div className="flex items-center gap-2">
      <div className="w-20 h-1.5 bg-gray-200 rounded">
        <div className="h-1.5 bg-blue-500 rounded" style={{ width: `${value}%` }} />
      </div>
      <span className="w-8 text-right font-medium">{Math.round(value)}</span>
    </div>
  </div>
);

const MatchScoreBadge: React.FC<Props> = ({ score, breakdown, reasons = [], size = 'md' }) => {
  const passed = breakdown?.gatekeeperPassed ?? true;
  const badge = (
    <Badge variant="outline" className={`${tone(score, passed)} cursor-help ${size === 'sm' ? 'text-[11px] px-2' : ''}`}>
      {passed ? <ShieldCheck className="w-3 h-3 mr-1" /> : <ShieldAlert className="w-3 h-3 mr-1" />}
      {passed ? `${Math.round(score)}% match` : 'Not eligible'}
    </Badge>
  );

  if (!breakdown) return badge;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className="inline-flex">{badge}</button>
      </PopoverTrigger>
      <PopoverContent className="w-72" align="start">
        <p className="text-sm font-semibold mb-2">Match breakdown</p>
        {!passed && (
          <ul className="mb-2 text-xs text-red-700 list-disc pl-4">
            {breakdown.gatekeeperReasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        )}
        <Row label="Proximity" value={breakdown.proximity} weight={MATCH_WEIGHTS.proximity} />
        <Row label="Availability" value={breakdown.availability} weight={MATCH_WEIGHTS.availability} />
        <Row label="Performance" value={breakdown.performance} weight={MATCH_WEIGHTS.performance} />
        <Row label="Trusted roster" value={breakdown.roster} weight={MATCH_WEIGHTS.roster} />
        {breakdown.distanceKm != null && <p className="text-xs text-gray-500 mt-2">{breakdown.distanceKm} km from venue</p>}
        {reasons.length > 0 && passed && (
          <ul className="mt-2 text-xs text-gray-600 list-disc pl-4">
            {reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
};

export default MatchScoreBadge;
