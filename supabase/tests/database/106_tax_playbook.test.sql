-- Regression: tax playbook support — capital-expense flag + new categories.
-- Covers: is_capital_expense column exists with safe default, new
-- expense_category enum labels are present.
BEGIN;
SELECT plan(3);

SELECT is(
  (SELECT data_type FROM information_schema.columns
    WHERE table_name = 'expenses' AND column_name = 'is_capital_expense'),
  'boolean', 'expenses.is_capital_expense exists as boolean');

SELECT is(
  (SELECT column_default FROM information_schema.columns
    WHERE table_name = 'expenses' AND column_name = 'is_capital_expense'),
  'false', 'capital flag defaults to false (supplies, not assets)');

SELECT is(
  (SELECT count(*)::int FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'expense_category'
      AND e.enumlabel IN ('fuel','parking','insurance','dues','software')),
  5, 'all five deduction categories present in expense_category');

SELECT * FROM finish();
ROLLBACK;
