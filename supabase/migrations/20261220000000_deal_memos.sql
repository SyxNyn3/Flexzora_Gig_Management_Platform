-- ============================================================================
-- Digital deal memos with e-signature (Cast & Crew "Start+" parity)
-- ============================================================================
-- Research basis: docs/research/castandcrew-patriot-competitive.md — Start+ is
-- Cast & Crew's wedge: crew signs the offer digitally before walking on set.
-- Flexzora already freezes offer terms on shift_assignments (Lane A work);
-- what's missing is the *artifact* — a signed memo the worker keeps in their
-- vault and the company keeps on file.
--
-- Design rules (same as marketplace/ledger work):
--   * Terms are a frozen jsonb snapshot written once at send time — later
--     edits to the shift/event never rewrite what was signed.
--   * All writes go through guarded security-definer RPCs; the tables have
--     RLS read policies for the two parties and NO direct write grants.
--   * Signature = typed legal name + optional drawn signature (PNG data URL)
--     + timestamp. We deliberately do NOT collect IP/geolocation in v1 —
--     enough for an acknowledgment of terms between known platform parties,
--     not a courtroom-grade e-sign (documented honestly in the UI).
--   * Status machine: sent -> signed | void. Signed is terminal; void is
--     company-only and only from 'sent'.
-- ============================================================================

CREATE TABLE IF NOT EXISTS deal_memos (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id  uuid NOT NULL UNIQUE REFERENCES shift_assignments(id) ON DELETE CASCADE,
  shift_id       uuid NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
  event_id       uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  worker_id      uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  company_id     uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  status         text NOT NULL DEFAULT 'sent' CHECK (status IN ('sent','signed','void')),
  -- Frozen terms snapshot: names, role, rate, window, event dates. Written
  -- once by deal_memo_send; never updated afterwards (signed terms are law).
  terms          jsonb NOT NULL,
  notes          text,
  sent_by        uuid NOT NULL REFERENCES profiles(id),
  signed_name    text,
  signature_png  text,             -- data:image/png;base64,... (canvas capture)
  signed_at      timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS deal_memos_worker_idx ON deal_memos (worker_id, status);
CREATE INDEX IF NOT EXISTS deal_memos_company_idx ON deal_memos (company_id, status);

ALTER TABLE deal_memos ENABLE ROW LEVEL SECURITY;

-- The two parties read; nobody else does. Company side uses owns_company()
-- (membership-aware since 20261203000000) so staff/ops members see memos too.
DROP POLICY IF EXISTS "deal memos read parties" ON deal_memos;
CREATE POLICY "deal memos read parties" ON deal_memos
  FOR SELECT TO authenticated
  USING (worker_id = current_profile_id() OR owns_company(company_id));

REVOKE INSERT, UPDATE, DELETE ON deal_memos FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON deal_memos FROM anon;

-- Guard: status transitions only via RPCs anyway (no write grants), but the
-- trigger also freezes `terms`/`sent_by`/party columns against any future
-- definer-path mistake and bumps updated_at.
CREATE OR REPLACE FUNCTION guard_deal_memo() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.terms IS DISTINCT FROM OLD.terms
     OR NEW.assignment_id IS DISTINCT FROM OLD.assignment_id
     OR NEW.worker_id IS DISTINCT FROM OLD.worker_id
     OR NEW.company_id IS DISTINCT FROM OLD.company_id
     OR NEW.sent_by IS DISTINCT FROM OLD.sent_by THEN
    RAISE EXCEPTION 'Deal memo terms and parties are immutable';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS deal_memo_guard ON deal_memos;
CREATE TRIGGER deal_memo_guard
  BEFORE UPDATE ON deal_memos
  FOR EACH ROW EXECUTE FUNCTION guard_deal_memo();

-- ---------------------------------------------------------------------------
-- deal_memo_send — company sends the memo for a confirmed assignment.
-- Snapshots every term the signature will cover. One memo per assignment
-- (UNIQUE); re-sending after void is allowed by deleting... actually void is
-- terminal for v1 — a voided memo stays void and a new assignment would be
-- needed. Simpler and honest: companies void only unsent-equivalent states.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION deal_memo_send(
  p_assignment_id uuid,
  p_notes text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_sender uuid := current_profile_id();
  v_assignment shift_assignments%ROWTYPE;
  v_shift shifts%ROWTYPE;
  v_event events%ROWTYPE;
  v_company companies%ROWTYPE;
  v_worker profiles%ROWTYPE;
  v_memo_id uuid;
BEGIN
  IF v_sender IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  SELECT * INTO v_assignment FROM shift_assignments
    WHERE id = p_assignment_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'assignment not found';
  END IF;

  SELECT * INTO v_shift FROM shifts WHERE id = v_assignment.shift_id;
  SELECT * INTO v_event FROM events WHERE id = v_shift.event_id;
  SELECT * INTO v_company FROM companies WHERE id = v_event.company_id;

  -- Company-side gate: sender must be a member of the event's company.
  IF NOT owns_company(v_event.company_id) THEN
    RAISE EXCEPTION 'only the hiring company can send a deal memo';
  END IF;

  -- Memo covers confirmed work only — sending one for an open offer would
  -- fabricate an agreement the worker never accepted.
  IF v_assignment.status <> 'confirmed' THEN
    RAISE EXCEPTION 'assignment is % — deal memos require a confirmed booking',
      v_assignment.status;
  END IF;

  SELECT * INTO v_worker FROM profiles WHERE id = v_assignment.worker_id;

  INSERT INTO deal_memos
    (assignment_id, shift_id, event_id, worker_id, company_id,
     terms, notes, sent_by)
  VALUES (
    v_assignment.id, v_shift.id, v_event.id, v_assignment.worker_id,
    v_event.company_id,
    jsonb_build_object(
      'worker_name', v_worker.full_name,
      'worker_email', v_worker.email,
      'company_name', v_company.name,
      'event_name', v_event.name,
      'event_type', v_event.event_type,
      'event_start', v_event.starts_on,
      'event_end', v_event.ends_on,
      'shift_title', v_shift.title,
      'role_name', v_shift.role_name,
      'shift_start', v_shift.starts_at,
      'shift_end', v_shift.ends_at,
      'hourly_rate', COALESCE(v_assignment.offered_rate, v_shift.hourly_rate),
      'currency', 'USD'
    ),
    NULLIF(btrim(COALESCE(p_notes, '')), ''),
    v_sender
  )
  ON CONFLICT (assignment_id) DO NOTHING
  RETURNING id INTO v_memo_id;

  IF v_memo_id IS NULL THEN
    RAISE EXCEPTION 'a deal memo already exists for this assignment';
  END IF;

  -- Tell the worker there's something to sign. crew_alerts is worker-scoped;
  -- the company sees status on their own deal-memo list.
  INSERT INTO crew_alerts (worker_id, kind, title, body, shift_id, dedupe_key)
  VALUES (
    v_assignment.worker_id, 'custom',
    'Deal memo ready to sign',
    'Your ' || v_shift.role_name || ' memo for ' || v_event.name ||
      ' (' || to_char(v_shift.starts_at, 'Mon DD') || ') is waiting — review and sign it.',
    v_shift.id,
    'dealmemo:' || v_memo_id::text
  );

  RETURN v_memo_id;
END;
$$;

REVOKE ALL ON FUNCTION deal_memo_send(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION deal_memo_send(uuid, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- deal_memo_sign — the worker signs. Typed legal name required; drawn
-- signature optional but encouraged. One-shot: 'signed' is terminal.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION deal_memo_sign(
  p_memo_id uuid,
  p_signed_name text,
  p_signature_png text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_worker uuid := current_profile_id();
  v_memo deal_memos%ROWTYPE;
  v_name text := btrim(COALESCE(p_signed_name, ''));
BEGIN
  IF v_worker IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF char_length(v_name) < 2 OR char_length(v_name) > 120 THEN
    RAISE EXCEPTION 'typed full legal name is required';
  END IF;
  -- Signature PNG is a data URL from the canvas; cap at ~400KB encoded so a
  -- malicious caller can't stuff megabytes into the row.
  IF p_signature_png IS NOT NULL
     AND (char_length(p_signature_png) > 400000
          OR p_signature_png NOT LIKE 'data:image/png;base64,%') THEN
    RAISE EXCEPTION 'invalid signature image';
  END IF;

  SELECT * INTO v_memo FROM deal_memos WHERE id = p_memo_id FOR UPDATE;
  IF NOT FOUND OR v_memo.worker_id <> v_worker THEN
    RAISE EXCEPTION 'memo not found';
  END IF;
  IF v_memo.status <> 'sent' THEN
    RAISE EXCEPTION 'memo is % — only sent memos can be signed', v_memo.status;
  END IF;

  UPDATE deal_memos SET
    status = 'signed',
    signed_name = v_name,
    signature_png = p_signature_png,
    signed_at = now()
  WHERE id = p_memo_id;
END;
$$;

REVOKE ALL ON FUNCTION deal_memo_sign(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION deal_memo_sign(uuid, text, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- deal_memo_void — company withdraws an unsigned memo (sent -> void).
-- Signed memos can't be voided; the record stands.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION deal_memo_void(p_memo_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_memo deal_memos%ROWTYPE;
BEGIN
  IF current_profile_id() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  SELECT * INTO v_memo FROM deal_memos WHERE id = p_memo_id FOR UPDATE;
  IF NOT FOUND OR NOT owns_company(v_memo.company_id) THEN
    RAISE EXCEPTION 'memo not found';
  END IF;
  IF v_memo.status <> 'sent' THEN
    RAISE EXCEPTION 'memo is % — only unsent-signed memos can be voided', v_memo.status;
  END IF;
  UPDATE deal_memos SET status = 'void' WHERE id = p_memo_id;
END;
$$;

REVOKE ALL ON FUNCTION deal_memo_void(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION deal_memo_void(uuid) TO authenticated;
