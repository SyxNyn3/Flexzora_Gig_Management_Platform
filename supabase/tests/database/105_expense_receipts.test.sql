-- Regression: expense receipts — fuel/parking categories + private bucket.
-- Covers: enum labels exist, bucket is private with a size cap, and the
-- folder-scoped storage policies are present (worker-only, no company read).
BEGIN;
SELECT plan(6);

SELECT is(
  (SELECT count(*)::int FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'expense_category' AND e.enumlabel IN ('fuel','parking')),
  2, 'expense_category has fuel and parking');

SELECT is(
  (SELECT public FROM storage.buckets WHERE id = 'expense-receipts'),
  false, 'expense-receipts bucket is private');

SELECT is(
  (SELECT file_size_limit FROM storage.buckets WHERE id = 'expense-receipts'),
  10485760::bigint, 'receipt uploads capped at 10MB');

SELECT is(
  (SELECT count(*)::int FROM pg_policies
    WHERE tablename = 'objects' AND policyname LIKE 'expense receipts%'),
  3, 'worker write/read/delete storage policies exist');

-- Policies must scope to the worker's own folder — a policy missing the
-- foldername check would expose every worker's receipts to everyone.
SELECT is(
  (SELECT count(*)::int FROM pg_policies
    WHERE tablename = 'objects' AND policyname LIKE 'expense receipts%'
      AND qual LIKE '%foldername%' OR policyname LIKE 'expense receipts%'
      AND with_check LIKE '%foldername%'),
  3, 'every receipt policy is folder-scoped to the worker');

-- anon must not be able to read receipts
SELECT is(
  (SELECT count(*)::int FROM pg_policies
    WHERE tablename = 'objects' AND policyname LIKE 'expense receipts%'
      AND roles::text LIKE '%anon%'),
  0, 'no anon access to receipt policies');

SELECT * FROM finish();
ROLLBACK;
