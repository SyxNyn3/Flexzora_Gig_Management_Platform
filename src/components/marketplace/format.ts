import { format, isSameDay } from 'date-fns';
import { Shift } from '@/lib/types';

export const money = (n: number | null | undefined, currency = 'USD') =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 2 }).format(Number(n ?? 0));

export const shiftWindow = (startsAt: string, endsAt: string) => {
  const s = new Date(startsAt);
  const e = new Date(endsAt);
  return isSameDay(s, e)
    ? `${format(s, 'EEE MMM d')} · ${format(s, 'HH:mm')}–${format(e, 'HH:mm')}`
    : `${format(s, 'MMM d HH:mm')} → ${format(e, 'MMM d HH:mm')}`;
};

export const hoursBetween = (startsAt: string, endsAt: string) =>
  Math.round(((new Date(endsAt).getTime() - new Date(startsAt).getTime()) / 3_600_000) * 10) / 10;

export const toLocalInputValue = (iso: string) => format(new Date(iso), "yyyy-MM-dd'T'HH:mm");

export const confirmedCount = (shift: Shift) =>
  (shift.assignments ?? []).filter((a) => a.status === 'confirmed' || a.status === 'completed').length;
