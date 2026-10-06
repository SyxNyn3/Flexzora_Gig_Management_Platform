export const IS_PAYMENTS_SANDBOX = !import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;

export const SANDBOX_PAYOUT_LABEL = 'Queued via Flexzora Escrow (Sandbox)';
export const SANDBOX_TRANSFER_LABEL = 'Simulated transfer';
export const SANDBOX_ESCROW_LABEL = 'Simulated deposit (Sandbox)';
export const SANDBOX_BANNER =
  'Payments sandbox — Stripe keys are not configured. Escrow deposits and payouts are simulated; nothing is charged.';
