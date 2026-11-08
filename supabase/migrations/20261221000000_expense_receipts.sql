-- ============================================================================
-- Expense receipts: fuel + parking categories and a private receipt bucket
-- ============================================================================
-- 1099 crew deduct vehicle costs two ways (IRS Pub 463): the standard mileage
-- rate OR actual expenses — gas, parking, tolls, insurance — but never both
-- for the same miles. Flexzora already logs mileage in the worker ledger;
-- this adds the actual-expense side: categorized fuel/parking receipts a
-- worker uploads and keeps for tax time.
--
--   * expense_category gains 'fuel' and 'parking' (additive enum values).
--   * New PRIVATE bucket `expense-receipts`: workers write/read/delete only
--     inside their own profile-id folder — same posture as compliance-docs,
--     minus the company read (companies never need a worker's gas receipts).
--   * expenses.receipt_url already exists and is unused; it now stores the
--     storage path. Viewing goes through short-lived signed URLs.
-- ============================================================================

ALTER TYPE expense_category ADD VALUE IF NOT EXISTS 'fuel';
ALTER TYPE expense_category ADD VALUE IF NOT EXISTS 'parking';

-- Private bucket: receipts can carry card-last-4, station locations, and
-- home-area addresses — not public, not company-visible.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'expense-receipts',
  'expense-receipts',
  false,
  10485760,  -- 10MB — phone photos of receipts fit comfortably
  ARRAY['image/jpeg','image/png','image/webp','image/heic','application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- Worker writes only into {their_profile_id}/...
DROP POLICY IF EXISTS "expense receipts worker write" ON storage.objects;
CREATE POLICY "expense receipts worker write" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'expense-receipts'
              AND (storage.foldername(name))[1] = current_profile_id()::text);

DROP POLICY IF EXISTS "expense receipts worker read" ON storage.objects;
CREATE POLICY "expense receipts worker read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'expense-receipts'
         AND (storage.foldername(name))[1] = current_profile_id()::text);

DROP POLICY IF EXISTS "expense receipts worker delete" ON storage.objects;
CREATE POLICY "expense receipts worker delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'expense-receipts'
         AND (storage.foldername(name))[1] = current_profile_id()::text);

-- Workers may also replace a receipt (delete + re-upload is the flow; UPDATE
-- on storage.objects is not granted — keeps the audit trail append-only).
