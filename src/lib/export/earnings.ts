import type { Invoice } from '@/lib/types';

// Row builders for the worker's annual earnings statement — pure so the
// numbers are testable; PayoutsPage renders them into the PDF/CSV exports.

export interface PayerTotal {
  company: string;
  invoices: number;
  gross: number;
  fees: number;
  net: number;
}

export interface StatementTotals {
  invoices: number;
  gross: number;
  fees: number;
  net: number;
}

const money = (n: number) => `$${n.toFixed(2)}`;

/** Per-payer rollup — the 1099 view: each company the worker cleared for. */
export function payerTotals(invoices: Invoice[]): PayerTotal[] {
  const by = new Map<string, PayerTotal>();
  for (const i of invoices) {
    const key = i.company?.name ?? 'Unknown company';
    const row = by.get(key) ?? { company: key, invoices: 0, gross: 0, fees: 0, net: 0 };
    row.invoices += 1;
    row.gross += Number(i.subtotal);
    row.fees += Number(i.platform_fee);
    row.net += Number(i.total);
    by.set(key, row);
  }
  return [...by.values()].sort((a, b) => b.gross - a.gross);
}

export function statementTotals(invoices: Invoice[]): StatementTotals {
  return {
    invoices: invoices.length,
    gross: invoices.reduce((n, i) => n + Number(i.subtotal), 0),
    fees: invoices.reduce((n, i) => n + Number(i.platform_fee), 0),
    net: invoices.reduce((n, i) => n + Number(i.total), 0),
  };
}

/** Invoice detail rows for the statement table (newest first). */
export function statementRows(invoices: Invoice[]): string[][] {
  return [...invoices]
    .sort((a, b) => new Date(b.issued_at).getTime() - new Date(a.issued_at).getTime())
    .map((i) => [
      i.invoice_number,
      i.issued_at.slice(0, 10),   // stored UTC business date — don't
      // render through local TZ or the statement lies a day back
      i.paid_at ? i.paid_at.slice(0, 10) : '—',
      i.company?.name ?? '',
      i.event?.name ?? '',
      money(Number(i.subtotal)),
      money(Number(i.platform_fee)),
      money(Number(i.total)),
      i.status,
    ]);
}

/** Payer summary rows + a TOTAL footer row for the statement. */
export function payerSummaryRows(invoices: Invoice[]): { body: string[][]; foot: string[][] } {
  const t = statementTotals(invoices);
  return {
    body: payerTotals(invoices).map((p) => [
      p.company,
      String(p.invoices),
      money(p.gross),
      money(p.fees),
      money(p.net),
    ]),
    foot: [['Total', String(t.invoices), money(t.gross), money(t.fees), money(t.net)]],
  };
}
