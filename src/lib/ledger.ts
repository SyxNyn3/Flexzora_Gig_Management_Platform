import { supabase } from '@/lib/supabase';

// ---------------------------------------------------------------------------
// Worker ledger — worker-owned, employer-agnostic records of everything owed
// to or spent by the worker across ALL productions (platform + off-platform).
// Backed by public.worker_ledger_entries + the ledger_* / onboarding_* RPCs
// (migration 20261213000000_worker_ledger_startpack.sql).
// ---------------------------------------------------------------------------

export type LedgerKind =
  | 'mileage'
  | 'per_diem'
  | 'manual_income'
  | 'payment_received'
  | 'expense_extra'
  | 'adjustment';

export interface LedgerEntry {
  id: string;
  worker_id: string;
  kind: LedgerKind;
  /** Signed cents: income/payment positive; expense_extra/adjustment may be negative. */
  amount_cents: number;
  entry_date: string;
  company_id: string | null;
  assignment_id: string | null;
  details: {
    miles?: number;
    rate_cents?: number;
    odometer_start?: number;
    odometer_end?: number;
    nights?: number;
    gsa_rate_cents?: number;
    locality?: string;
    payer?: string;
    invoice_ref?: string;
    method?: string;
    reference?: string;
    [k: string]: unknown;
  };
  description: string | null;
  receipt_path: string | null;
  status: 'recorded' | 'billed' | 'paid' | 'void';
  created_at: string;
  updated_at: string;
}

export interface LedgerSummary {
  year: number;
  earned_cents: number;
  billed_cents: number;
  received_cents: number;
  outstanding_cents: number;
  platform_fees_cents: number;
  expenses_cents: number;
  mileage_cents: number;
  per_diem_cents: number;
  total_miles: number;
  by_company: { company_id: string; company_name: string | null; net_cents: number; mileage_cents: number; per_diem_cents: number }[];
}

export const LEDGER_KIND_LABELS: Record<LedgerKind, string> = {
  mileage: 'Mileage',
  per_diem: 'Per diem',
  manual_income: 'Off-platform income',
  payment_received: 'Payment received',
  expense_extra: 'Expense',
  adjustment: 'Adjustment',
};

export async function fetchLedgerSummary(year: number) {
  const { data, error } = await supabase.rpc('ledger_summary', { p_year: year });
  return { data: (data ?? null) as LedgerSummary | null, error: error?.message ?? null };
}

export async function fetchLedgerEntries(opts: { from?: string; to?: string; companyId?: string; limit?: number } = {}) {
  const { data, error } = await supabase.rpc('ledger_entries', {
    p_from: opts.from ?? null,
    p_to: opts.to ?? null,
    p_company_id: opts.companyId ?? null,
    p_limit: opts.limit ?? 200,
  });
  return { data: (data ?? []) as LedgerEntry[], error: error?.message ?? null };
}

export interface NewLedgerEntry {
  kind: LedgerKind;
  amount_cents: number;
  entry_date: string;
  company_id?: string | null;
  assignment_id?: string | null;
  details?: Record<string, unknown>;
  description?: string | null;
  receipt_path?: string | null;
}

export async function addLedgerEntry(e: NewLedgerEntry) {
  const { data, error } = await supabase.rpc('ledger_add_entry', {
    p_kind: e.kind,
    p_amount_cents: e.amount_cents,
    p_entry_date: e.entry_date,
    p_company_id: e.company_id ?? null,
    p_assignment_id: e.assignment_id ?? null,
    p_details: e.details ?? {},
    p_description: e.description ?? null,
    p_receipt_path: e.receipt_path ?? null,
  });
  return { data: (data ?? null) as string | null, error: error?.message ?? null };
}

// ---------------------------------------------------------------------------
// Start-pack onboarding checklist — per worker+company. Item states:
//   missing -> submitted (worker) -> confirmed / waived (company owner/admin)
// ---------------------------------------------------------------------------

export type OnboardingItemState = 'missing' | 'submitted' | 'confirmed' | 'waived';
export type OnboardingItems = Record<string, OnboardingItemState>;

export interface GigOnboarding {
  id: string;
  worker_id: string;
  company_id: string;
  items: OnboardingItems;
  status: 'not_started' | 'in_progress' | 'complete';
  created_at: string;
  updated_at: string;
}

export const ONBOARDING_ITEM_LABELS: Record<string, string> = {
  deal_memo: 'Deal memo / contract',
  w4: 'W-4 (federal withholding)',
  state_tax_form: 'State tax form(s)',
  i9: 'I-9 eligibility',
  direct_deposit: 'Direct deposit auth',
  union_card: 'Union card / clearance',
  coi: 'Certificate of insurance (loan-out)',
  emergency_contact: 'Emergency contact',
  nda: 'NDA / confidentiality',
  safety_cert: 'Safety certs / training',
};

export const ONBOARDING_ITEM_ORDER = [
  'deal_memo', 'w4', 'state_tax_form', 'i9', 'direct_deposit',
  'union_card', 'coi', 'emergency_contact', 'nda', 'safety_cert',
];

export interface OnboardingCompany {
  company_id: string;
  company_name: string;
  first_seen: string;
  /** null until the worker opens/creates the checklist via onboarding_get. */
  checklist_status: 'not_started' | 'in_progress' | 'complete' | null;
  checklist_done: number;
  checklist_total: number;
}

export async function fetchOnboardingCompanies() {
  const { data, error } = await supabase.rpc('onboarding_companies');
  return { data: (data ?? []) as OnboardingCompany[], error: error?.message ?? null };
}

export async function fetchOnboarding(companyId: string) {
  const { data, error } = await supabase.rpc('onboarding_get', { p_company_id: companyId });
  return { data: (data ?? null) as GigOnboarding | null, error: error?.message ?? null };
}

export async function updateOnboardingItem(companyId: string, item: string, state: OnboardingItemState) {
  const { error } = await supabase.rpc('onboarding_update_item', {
    p_company_id: companyId,
    p_item: item,
    p_state: state,
  });
  return { error: error?.message ?? null };
}
