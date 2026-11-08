import { supabase } from '@/lib/supabase';

// ---------------------------------------------------------------------------
// Worker ledger — worker-owned, employer-agnostic records of everything owed
// to or spent by the worker across ALL productions (platform + off-platform).
// Backed by public.worker_ledger_entries + the ledger_* / onboarding_* RPCs
// (migration 20261213000000_worker_ledger_startpack.sql).
//
// Why this exists: docs/research/crew-worker-tools-landscape.md — chasing
// pay across employers is the top crew complaint, and payroll incumbents
// can't host a cross-employer worker ledger without hosting competitors'
// workers. docs/research/1099-crew-compliance.md — 1099 crew have no
// wage-hour protections, so records and contract evidence are the leverage.
// Rules honored here: no money custody, no SSN/bank collection, money in
// integer cents, worker-reported claims labeled as such.
// ---------------------------------------------------------------------------

// The six entry kinds. Income-side kinds (everything except expense_extra
// and adjustment) must be positive — corrections go through 'adjustment'
// so the audit trail keeps both the original entry and its fix.
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
  /** Null for off-platform work with no Flexzora company relationship. */
  company_id: string | null;
  assignment_id: string | null;
  /** Kind-specific payload — see each kind's form in LedgerPage for the keys. */
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

// Year totals from ledger_summary. All *_cents fields are integer cents;
// divide by 100 for display. earned = platform approved timesheets +
// manual_income entries; billed = invoices issued; received = paid invoices
// + payment_received entries; outstanding = billed open + manual income not
// yet matched by a payment_received entry (floored at 0).
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

// Display labels mirror the DB CHECK constraint on worker_ledger_entries.kind
// — adding a kind means a migration first, then a label here.
export const LEDGER_KIND_LABELS: Record<LedgerKind, string> = {
  mileage: 'Mileage',
  per_diem: 'Per diem',
  manual_income: 'Off-platform income',
  payment_received: 'Payment received',
  expense_extra: 'Expense',
  adjustment: 'Adjustment',
};

// ledger_summary(p_year) — SECURITY DEFINER, scoped to auth.uid()'s profile.
// Returns one jsonb blob; cast through LedgerSummary rather than trusting
// the shape silently.
export async function fetchLedgerSummary(year: number) {
  const { data, error } = await supabase.rpc('ledger_summary', { p_year: year });
  return { data: (data ?? null) as LedgerSummary | null, error: error?.message ?? null };
}

// ledger_entries — newest-first manual entries for the current worker only.
// p_limit is clamped server-side to [1, 500]; default page size here is 200.
export async function fetchLedgerEntries(opts: { from?: string; to?: string; companyId?: string; limit?: number } = {}) {
  const { data, error } = await supabase.rpc('ledger_entries', {
    p_from: opts.from ?? null,
    p_to: opts.to ?? null,
    p_company_id: opts.companyId ?? null,
    p_limit: opts.limit ?? 200,
  });
  return { data: (data ?? []) as LedgerEntry[], error: error?.message ?? null };
}

// Payload for ledger_add_entry. amount_cents must be nonzero; income-side
// kinds reject negatives server-side. entry_date cannot be in the future
// (server allows today+1 for timezone slack). company_id must reference a
// real companies row but does NOT require a work relationship — off-platform
// claims against a company you know are allowed.
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
//
// The worker can only ever set 'missing' or 'submitted'; the company side
// owns 'confirmed'/'waived'. The guard_onboarding_items trigger enforces
// this even on direct table writes, and silently reverts disallowed states
// rather than erroring — so a confused client can't corrupt the checklist.
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

// The ten standard start-pack documents every production asks for. Keys
// must match onboarding_item_keys() in the migration — the trigger rejects
// unknown keys. Order here is display order on the checklist.
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

// onboarding_companies() — every company the worker has a real relationship
// with (shared shift, invoice, or expense), whether or not a checklist row
// exists yet. checklist_status is null until onboarding_get lazily creates
// the row — it does NOT appear in this list's filter, so companies never
// vanish after setup (fixed in migration 20261214000000).
export interface OnboardingCompany {
  company_id: string;
  company_name: string;
  first_seen: string;
  checklist_status: 'not_started' | 'in_progress' | 'complete' | null;
  checklist_done: number;
  checklist_total: number;
}

export async function fetchOnboardingCompanies() {
  const { data, error } = await supabase.rpc('onboarding_companies');
  return { data: (data ?? []) as OnboardingCompany[], error: error?.message ?? null };
}

// onboarding_get — returns the checklist row, lazily creating it on first
// call. Creation is gated on a real work relationship (shift/invoice/
// expense with that company) so workers can't spam checklists at arbitrary
// companies. Errors surface as error.message ('No work relationship...').
export async function fetchOnboarding(companyId: string) {
  const { data, error } = await supabase.rpc('onboarding_get', { p_company_id: companyId });
  return { data: (data ?? null) as GigOnboarding | null, error: error?.message ?? null };
}

// onboarding_update_item — single-item state transition. From the worker
// side only 'missing' and 'submitted' are accepted; asking for 'confirmed'
// is silently reverted by the trigger (see pgTAP test 102). Returns only an
// error string — the caller refetches the row for fresh state.
export async function updateOnboardingItem(companyId: string, item: string, state: OnboardingItemState) {
  const { error } = await supabase.rpc('onboarding_update_item', {
    p_company_id: companyId,
    p_item: item,
    p_state: state,
  });
  return { error: error?.message ?? null };
}
