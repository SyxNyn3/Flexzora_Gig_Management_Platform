-- ============================================================================
-- Tax playbook support: capital-expense flag + more deduction categories
-- ============================================================================
-- Two additions for the 1099 crew tax story:
--
--   1) expenses.is_capital_expense — tools/equipment over the IRS "supplies"
--      threshold can't just be expensed; they get capitalized and depreciated
--      or Section 179'd. The flag lets the worker mark a purchase as a
--      capital item so tax-time exports can separate supplies from assets.
--      (We store the flag; the deduction math stays educational — see the
--      /tax-playbook page for the honest rules.)
--
--   2) More expense_category values for the deductions crew actually miss:
--      insurance (liability/gear), dues (union/guild/assoc), software
--      (apps, subscriptions). All additive enum values.
-- ============================================================================

ALTER TABLE expenses
  ADD COLUMN IF NOT EXISTS is_capital_expense boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN expenses.is_capital_expense IS
  'True when the purchase is a capital item (camera, console, vehicle) that may qualify for Section 179 expensing or depreciation rather than routine supplies. Flag only — Flexzora does not compute deductions.';

ALTER TYPE expense_category ADD VALUE IF NOT EXISTS 'insurance';
ALTER TYPE expense_category ADD VALUE IF NOT EXISTS 'dues';
ALTER TYPE expense_category ADD VALUE IF NOT EXISTS 'software';
