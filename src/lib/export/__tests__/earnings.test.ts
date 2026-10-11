import { describe, expect, it } from 'vitest';
import { payerSummaryRows, payerTotals, statementRows, statementTotals } from '@/lib/export/earnings';
import type { Invoice } from '@/lib/types';

let seq = 0;
const inv = (over: Partial<Invoice>): Invoice => ({
  id: `inv-${++seq}`,
  invoice_number: 'INV-1',
  worker_id: 'w1',
  company_id: 'c1',
  line_items: [],
  subtotal: 0,
  platform_fee: 0,
  total: 0,
  currency: 'USD',
  status: 'paid',
  tax_year: 2026,
  issued_at: '2026-03-10T00:00:00Z',
  created_at: '2026-03-10T00:00:00Z',
  ...over,
});

const invoices: Invoice[] = [
  inv({ invoice_number: 'INV-A', subtotal: 1000, platform_fee: 50, total: 950, issued_at: '2026-01-15T00:00:00Z',
        paid_at: '2026-01-18T00:00:00Z', company: { name: 'ArenaCo' } as Invoice['company'], event: { name: 'Gala' } as Invoice['event'] }),
  inv({ invoice_number: 'INV-B', subtotal: 500, platform_fee: 25, total: 475, issued_at: '2026-02-01T00:00:00Z',
        company: { name: 'ArenaCo' } as Invoice['company'] }),
  inv({ invoice_number: 'INV-C', subtotal: 800, platform_fee: 40, total: 760, issued_at: '2026-03-01T00:00:00Z',
        status: 'issued', company: { name: 'ClubVenue' } as Invoice['company'] }),
];

describe('payerTotals', () => {
  it('rolls invoices up per company, sorted by gross', () => {
    const rows = payerTotals(invoices);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ company: 'ArenaCo', invoices: 2, gross: 1500, fees: 75, net: 1425 });
    expect(rows[1]).toMatchObject({ company: 'ClubVenue', invoices: 1, gross: 800 });
  });

  it('groups missing company names under a fallback', () => {
    const rows = payerTotals([inv({ subtotal: 10 })]);
    expect(rows[0].company).toBe('Unknown company');
  });
});

describe('statementTotals', () => {
  it('sums gross, fees and net across the year', () => {
    expect(statementTotals(invoices)).toEqual({ invoices: 3, gross: 2300, fees: 115, net: 2185 });
  });
});

describe('statementRows', () => {
  it('emits newest-first detail rows with formatted money', () => {
    const rows = statementRows(invoices);
    expect(rows[0][0]).toBe('INV-C');
    expect(rows[0][5]).toBe('$800.00');
    expect(rows[1][2]).toBe('—'); // unpaid shows an em dash
    expect(rows[2][0]).toBe('INV-A');
    expect(rows[2][2]).toBe('2026-01-18');
  });
});

describe('payerSummaryRows', () => {
  it('foot row totals the body', () => {
    const { body, foot } = payerSummaryRows(invoices);
    expect(body).toHaveLength(2);
    expect(foot[0]).toEqual(['Total', '3', '$2300.00', '$115.00', '$2185.00']);
  });
});
