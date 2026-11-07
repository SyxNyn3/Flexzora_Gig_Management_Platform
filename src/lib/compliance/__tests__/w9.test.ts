import { describe, expect, it } from 'vitest';
import {
  generateW9Pdf,
  maskTin,
  w9Schema,
  type W9FormData,
} from '@/lib/compliance/w9';

const base: W9FormData = {
  name: 'Jordan Rivera',
  businessName: '',
  classification: 'individual',
  llcType: undefined,
  llcMembers: undefined,
  llcOrganizedUS: undefined,
  exemptPayeeCode: '',
  exemptFatcaCode: '',
  address: '123 Main St',
  city: 'Austin',
  state: 'tx',
  zip: '78701',
  accountNumber: '',
  requesterName: '',
  requesterAddress: '',
  ssn: '123-45-6789',
  ein: '',
  certificationAck: true,
  signatureName: 'Jordan Rivera',
};

describe('w9Schema', () => {
  it('accepts a minimal individual W-9 with SSN only', () => {
    expect(w9Schema.safeParse(base).success).toBe(true);
  });

  it('accepts EIN-only and requires at least one TIN', () => {
    expect(w9Schema.safeParse({ ...base, ssn: '', ein: '12-3456789' }).success).toBe(true);
    const none = w9Schema.safeParse({ ...base, ssn: '', ein: '' });
    expect(none.success).toBe(false);
  });

  it('rejects malformed TINs', () => {
    expect(w9Schema.safeParse({ ...base, ssn: '123' }).success).toBe(false);
  });

  it('requires LLC tax treatment when classification is llc', () => {
    const llc = { ...base, classification: 'llc' as const, ein: '12-3456789', ssn: '' };
    expect(w9Schema.safeParse(llc).success).toBe(false);
    expect(w9Schema.safeParse({ ...llc, llcType: 'S' as const }).success).toBe(true);
  });

  it('requires the perjury certification and a typed signature', () => {
    expect(w9Schema.safeParse({ ...base, certificationAck: false }).success).toBe(false);
    expect(w9Schema.safeParse({ ...base, signatureName: '' }).success).toBe(false);
  });

  it('maskTin never exposes more than the last 4 digits', () => {
    expect(maskTin('123-45-6789')).toBe('***-**-6789');
    expect(maskTin('')).toBe('');
  });
});

describe('generateW9Pdf', () => {
  it('renders a non-trivial single-page PDF', () => {
    const pdf = generateW9Pdf({
      ...base,
      classification: 'llc',
      llcType: 'S',
      ssn: '',
      ein: '98-7654321',
    });
    expect(pdf.getNumberOfPages()).toBe(1);
    const bytes = pdf.output('arraybuffer');
    expect(bytes.byteLength).toBeGreaterThan(2000);
    // PDF magic header
    expect(new Uint8Array(bytes)[0]).toBe(0x25); // '%'
  });
});
