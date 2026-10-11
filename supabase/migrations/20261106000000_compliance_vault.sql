-- W-9/I-9 compliance vault.
--
-- Tax and eligibility docs live in a private `compliance-docs` bucket; workers
-- upload into their own folder and related companies review. The money-side
-- gate: claim_payout_for_release refuses to claim a payout for a worker with
-- no approved W-9 — the review gate Stripe (and the IRS) effectively demand
-- before the first dollar moves.

CREATE TABLE IF NOT EXISTS compliance_docs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  doc_type text NOT NULL CHECK (doc_type IN ('w9', 'i9', 'other')),
  document_path text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  review_note text,
  reviewed_by uuid REFERENCES profiles(id),
  reviewed_at timestamptz,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (worker_id, doc_type)
);

CREATE INDEX IF NOT EXISTS compliance_docs_worker_idx ON compliance_docs (worker_id, status);
CREATE INDEX IF NOT EXISTS compliance_docs_pending_idx ON compliance_docs (status) WHERE status = 'pending';

ALTER TABLE compliance_docs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "workers manage own compliance docs" ON compliance_docs;
CREATE POLICY "workers manage own compliance docs" ON compliance_docs FOR ALL TO authenticated
  USING (worker_id = current_profile_id())
  WITH CHECK (worker_id = current_profile_id());

DROP POLICY IF EXISTS "related companies read compliance docs" ON compliance_docs;
CREATE POLICY "related companies read compliance docs" ON compliance_docs FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM companies c
    WHERE owns_company(c.id)
      AND worker_related_to_company(worker_id, c.id)));

-- Workers may re-upload a doc (which resets it to pending) but can never move
-- the review fields — same posture as guard_certification_verification.
CREATE OR REPLACE FUNCTION guard_compliance_doc() RETURNS trigger AS $$
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN RETURN NEW; END IF;
  IF NEW.worker_id <> OLD.worker_id OR NEW.doc_type <> OLD.doc_type THEN
    RAISE EXCEPTION 'Document worker and type are immutable';
  END IF;
  IF NEW.status NOT IN ('pending') THEN
    RAISE EXCEPTION 'Review status only moves through the review function';
  END IF;
  IF NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by
     OR NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at
     OR (NEW.review_note IS DISTINCT FROM OLD.review_note AND OLD.status <> 'rejected') THEN
    RAISE EXCEPTION 'Review fields are read-only for workers';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS compliance_docs_guard ON compliance_docs;
CREATE TRIGGER compliance_docs_guard BEFORE UPDATE ON compliance_docs
  FOR EACH ROW EXECUTE FUNCTION guard_compliance_doc();

-- Private bucket, same folder posture as cert-docs.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('compliance-docs', 'compliance-docs', false, 10485760,
        '{image/jpeg,image/png,image/webp,application/pdf}')
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "compliance docs worker write" ON storage.objects;
CREATE POLICY "compliance docs worker write" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'compliance-docs'
              AND (storage.foldername(name))[1] = current_profile_id()::text);

DROP POLICY IF EXISTS "compliance docs owner delete" ON storage.objects;
CREATE POLICY "compliance docs owner delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'compliance-docs'
         AND (storage.foldername(name))[1] = current_profile_id()::text);

DROP POLICY IF EXISTS "compliance docs review read" ON storage.objects;
CREATE POLICY "compliance docs review read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'compliance-docs'
         AND (
           (storage.foldername(name))[1] = current_profile_id()::text
           OR EXISTS (
             SELECT 1 FROM companies co
             WHERE owns_company(co.id)
               AND worker_related_to_company((storage.foldername(name))[1]::uuid, co.id))));

CREATE OR REPLACE FUNCTION worker_has_approved_doc(p_worker_id uuid, p_doc_type text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM compliance_docs
    WHERE worker_id = p_worker_id AND doc_type = p_doc_type AND status = 'approved');
$$;

-- Review queue + decision RPCs — same relationship gate as cert review.
CREATE OR REPLACE FUNCTION pending_compliance_reviews(p_company_id uuid)
RETURNS SETOF compliance_docs
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT owns_company(p_company_id) THEN
    RAISE EXCEPTION 'Not authorized for this company';
  END IF;
  RETURN QUERY
    SELECT d.* FROM compliance_docs d
    WHERE d.status = 'pending'
      AND worker_related_to_company(d.worker_id, p_company_id)
    ORDER BY d.uploaded_at;
END $$;

CREATE OR REPLACE FUNCTION review_compliance_doc(
  p_doc_id uuid, p_company_id uuid, p_approve boolean, p_note text DEFAULT NULL
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_doc compliance_docs%ROWTYPE;
BEGIN
  IF NOT owns_company(p_company_id) THEN
    RAISE EXCEPTION 'Not authorized for this company';
  END IF;
  SELECT * INTO v_doc FROM compliance_docs WHERE id = p_doc_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'document not found';
  END IF;
  IF v_doc.status <> 'pending' THEN
    RAISE EXCEPTION 'document is not awaiting review (status: %)', v_doc.status;
  END IF;
  IF NOT worker_related_to_company(v_doc.worker_id, p_company_id) THEN
    RAISE EXCEPTION 'worker is not related to this company';
  END IF;
  IF NOT p_approve AND (p_note IS NULL OR btrim(p_note) = '') THEN
    RAISE EXCEPTION 'a note is required when rejecting';
  END IF;

  UPDATE compliance_docs SET
    status = CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END,
    review_note = p_note,
    reviewed_by = current_profile_id(),
    reviewed_at = now(),
    updated_at = now()
  WHERE id = p_doc_id;

  INSERT INTO notifications (user_id, title, message, type, metadata)
  VALUES (v_doc.worker_id,
          CASE WHEN p_approve THEN upper(v_doc.doc_type) || ' approved'
               ELSE upper(v_doc.doc_type) || ' needs attention' END,
          CASE WHEN p_approve
               THEN 'Your ' || upper(v_doc.doc_type) || ' was approved — payouts are cleared.'
               ELSE 'Your ' || upper(v_doc.doc_type) || ' was rejected: ' || COALESCE(p_note, 'see review note') END,
          CASE WHEN p_approve THEN 'success' ELSE 'warning' END,
          jsonb_build_object('doc_id', p_doc_id, 'doc_type', v_doc.doc_type, 'status',
            CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END));
  RETURN true;
END $$;

-- The payout gate: a queued payout can't be claimed while the worker lacks an
-- approved W-9. Same atomic-claim semantics as before, plus the hold.
CREATE OR REPLACE FUNCTION claim_payout_for_release(p_payout_id uuid)
RETURNS SETOF payouts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_catalog
AS $$
DECLARE
  v_worker uuid;
BEGIN
  SELECT worker_id INTO v_worker FROM payouts WHERE id = p_payout_id;
  IF v_worker IS NOT NULL AND NOT worker_has_approved_doc(v_worker, 'w9') THEN
    RAISE EXCEPTION 'Compliance hold: worker has no approved W-9 on file';
  END IF;

  RETURN QUERY
  UPDATE payouts
     SET status = 'processing', updated_at = now(), failure_reason = NULL
   WHERE id = p_payout_id
     AND (status IN ('queued', 'failed')
          OR (status = 'processing' AND updated_at < now() - interval '10 minutes'))
  RETURNING *;
END;
$$;
REVOKE ALL ON FUNCTION claim_payout_for_release(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION claim_payout_for_release(uuid) TO service_role;

GRANT EXECUTE ON FUNCTION worker_has_approved_doc(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION pending_compliance_reviews(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION review_compliance_doc(uuid, uuid, boolean, text) TO authenticated;
