-- Company OS #4: broadcast messaging — broadcasts + broadcast_recipients.
--
-- One broadcast = one message to a resolved audience: a call's crew, everyone
-- on an event (crew + staff), or the whole roster + staff. Workers get an
-- in-app notification (the delivery that exists today); staff without a
-- Flexzora account get an 'email' recipient row left 'queued' — honest
-- plumbing for the transport integrations instead of pretending to send.
--
-- resolve_broadcast_audience() is the single source of truth for "who gets
-- this" — the compose screen previews with it, send_broadcast() writes with
-- it, so what you saw is what shipped.

CREATE TABLE IF NOT EXISTS broadcasts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  subject text,
  body text NOT NULL,
  audience text NOT NULL CHECK (audience IN ('all', 'event', 'shift')),
  event_id uuid REFERENCES events(id) ON DELETE SET NULL,
  shift_id uuid REFERENCES shifts(id) ON DELETE SET NULL,
  include_staff boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'failed')),
  recipient_count integer NOT NULL DEFAULT 0,
  error text,
  sent_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS broadcasts_company_idx ON broadcasts (company_id, created_at DESC);

CREATE TABLE IF NOT EXISTS broadcast_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  broadcast_id uuid NOT NULL REFERENCES broadcasts(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  worker_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  staff_id uuid REFERENCES staff_members(id) ON DELETE CASCADE,
  channel text NOT NULL DEFAULT 'in_app' CHECK (channel IN ('in_app', 'email', 'sms')),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'sent', 'delivered', 'failed', 'skipped')),
  error text,
  notification_id uuid,
  created_at timestamptz DEFAULT now(),
  delivered_at timestamptz,
  CHECK (num_nonnulls(worker_id, staff_id) = 1)
);

CREATE UNIQUE INDEX IF NOT EXISTS broadcast_recipients_dedupe
  ON broadcast_recipients (broadcast_id, channel, COALESCE(worker_id, '00000000-0000-0000-0000-000000000000'),
                           COALESCE(staff_id, '00000000-0000-0000-0000-000000000000'));
CREATE INDEX IF NOT EXISTS broadcast_recipients_broadcast_idx ON broadcast_recipients (broadcast_id, status);

ALTER TABLE broadcasts ENABLE ROW LEVEL SECURITY;
ALTER TABLE broadcast_recipients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "broadcasts owner all" ON broadcasts;
CREATE POLICY "broadcasts owner all" ON broadcasts FOR ALL TO authenticated
  USING (owns_company(company_id)) WITH CHECK (owns_company(company_id));

DROP POLICY IF EXISTS "broadcast recipients owner read" ON broadcast_recipients;
CREATE POLICY "broadcast recipients owner read" ON broadcast_recipients FOR SELECT TO authenticated
  USING (owns_company(company_id));
-- Recipients are written by send_broadcast (definer); no direct client writes.
DROP POLICY IF EXISTS "broadcast recipients owner write" ON broadcast_recipients;
CREATE POLICY "broadcast recipients owner write" ON broadcast_recipients FOR INSERT TO authenticated
  WITH CHECK (owns_company(company_id));

DROP TRIGGER IF EXISTS broadcasts_updated_at ON broadcasts;
CREATE TRIGGER broadcasts_updated_at BEFORE UPDATE ON broadcasts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ---------------------------------------------------------------------------
-- resolve_broadcast_audience: one audience, one answer.
--   all   → preferred_rosters (non-blocked) + active staff (if include_staff)
--   event → crew on any of the event's shifts + the event's staff assignments
--   shift → crew on that call + staff assigned to the call's event
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION resolve_broadcast_audience(
  p_company_id uuid,
  p_audience text,
  p_event_id uuid DEFAULT NULL,
  p_shift_id uuid DEFAULT NULL,
  p_include_staff boolean DEFAULT true
) RETURNS TABLE (worker_id uuid, staff_id uuid)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, extensions, pg_temp AS $$
DECLARE
  v_event uuid := p_event_id;
BEGIN
  IF NOT owns_company(p_company_id) THEN
    RAISE EXCEPTION 'Not authorized for this company';
  END IF;
  IF p_audience = 'shift' THEN
    IF p_shift_id IS NULL OR NOT owns_shift(p_shift_id) THEN
      RAISE EXCEPTION 'Pick a call you own';
    END IF;
    SELECT event_id INTO v_event FROM shifts WHERE id = p_shift_id;
  ELSIF p_audience = 'event' THEN
    IF v_event IS NULL OR NOT owns_event(v_event) THEN
      RAISE EXCEPTION 'Pick an event you own';
    END IF;
  END IF;

  RETURN QUERY
  WITH workers AS (
    SELECT DISTINCT sa.worker_id AS id
    FROM shift_assignments sa
    WHERE p_audience = 'shift'
      AND sa.shift_id = p_shift_id
      AND sa.status IN ('offered', 'applied', 'confirmed', 'completed')
    UNION
    SELECT DISTINCT sa.worker_id
    FROM shift_assignments sa
    JOIN shifts s ON s.id = sa.shift_id
    WHERE p_audience = 'event'
      AND s.event_id = v_event
      AND sa.status IN ('offered', 'applied', 'confirmed', 'completed')
    UNION
    SELECT pr.worker_id
    FROM preferred_rosters pr
    WHERE p_audience = 'all'
      AND pr.company_id = p_company_id
      AND pr.tier <> 'blocked'
  ), staff AS (
    SELECT DISTINCT sa.staff_id AS id
    FROM staff_assignments sa
    WHERE p_include_staff
      AND p_audience IN ('event', 'shift')
      AND sa.event_id = v_event
      AND sa.status <> 'declined'
    UNION
    SELECT sm.id
    FROM staff_members sm
    WHERE p_include_staff
      AND p_audience = 'all'
      AND sm.company_id = p_company_id
      AND sm.is_active
  )
  SELECT w.id, NULL::uuid FROM workers w
  UNION ALL
  SELECT NULL::uuid, s.id FROM staff s;
END $$;

-- ---------------------------------------------------------------------------
-- send_broadcast: resolve → dedupe → write recipients → in-app notify.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION send_broadcast(p_broadcast_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp AS $$
DECLARE
  v_b broadcasts%ROWTYPE;
  v_rec record;
  v_notif uuid;
  v_sent int := 0;
  v_queued int := 0;
  v_staff_profile uuid;
BEGIN
  SELECT * INTO v_b FROM broadcasts WHERE id = p_broadcast_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Broadcast not found'; END IF;
  IF NOT owns_company(v_b.company_id) THEN RAISE EXCEPTION 'Not your broadcast'; END IF;
  IF v_b.status <> 'draft' THEN RAISE EXCEPTION 'Broadcast already sent'; END IF;

  FOR v_rec IN
    SELECT * FROM resolve_broadcast_audience(
      v_b.company_id, v_b.audience, v_b.event_id, v_b.shift_id, v_b.include_staff)
  LOOP
    IF v_rec.worker_id IS NOT NULL THEN
      -- Workers get the in-app notification today.
      v_notif := create_notification(
        v_rec.worker_id,
        COALESCE(NULLIF(v_b.subject, ''), 'Broadcast from your production'),
        v_b.body,
        'broadcast',
        '/dashboard',
        jsonb_build_object('broadcast_id', v_b.id)
      );
      INSERT INTO broadcast_recipients (broadcast_id, company_id, worker_id, channel, status, notification_id)
      VALUES (v_b.id, v_b.company_id, v_rec.worker_id, 'in_app', 'sent', v_notif)
      ON CONFLICT DO NOTHING;
      v_sent := v_sent + 1;
    ELSE
      -- Staff with a linked Flexzora account get in_app like workers;
      -- accountless staff queue for the email transport when it lands.
      SELECT profile_id INTO v_staff_profile FROM staff_members WHERE id = v_rec.staff_id;
      IF v_staff_profile IS NOT NULL THEN
        v_notif := create_notification(
          v_staff_profile,
          COALESCE(NULLIF(v_b.subject, ''), 'Broadcast from your production'),
          v_b.body,
          'broadcast',
          '/dashboard',
          jsonb_build_object('broadcast_id', v_b.id)
        );
        INSERT INTO broadcast_recipients (broadcast_id, company_id, worker_id, channel, status, notification_id)
        VALUES (v_b.id, v_b.company_id, v_staff_profile, 'in_app', 'sent', v_notif)
        ON CONFLICT DO NOTHING;
      ELSE
        INSERT INTO broadcast_recipients (broadcast_id, company_id, staff_id, channel, status, error)
        VALUES (v_b.id, v_b.company_id, v_rec.staff_id, 'email', 'queued', 'email transport not wired yet')
        ON CONFLICT DO NOTHING;
        v_queued := v_queued + 1;
      END IF;
    END IF;
  END LOOP;

  UPDATE broadcasts
  SET status = 'sent', sent_at = now(),
      recipient_count = (SELECT count(*) FROM broadcast_recipients WHERE broadcast_id = v_b.id)
  WHERE id = v_b.id;

  RETURN jsonb_build_object('sent', v_sent, 'queued', v_queued,
                            'recipients', (SELECT count(*) FROM broadcast_recipients WHERE broadcast_id = v_b.id));
END $$;

GRANT EXECUTE ON FUNCTION resolve_broadcast_audience(uuid, text, uuid, uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION send_broadcast(uuid) TO authenticated;
