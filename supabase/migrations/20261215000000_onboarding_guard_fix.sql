-- Fix: guard_onboarding_items never actually ran.
--
-- The original first line was:
--   IF current_user NOT IN ('authenticated', 'anon') THEN RETURN NEW; END IF;
--
-- But the function is SECURITY DEFINER, and inside a security-definer
-- function current_user is the FUNCTION OWNER (postgres), never the API
-- role. So the guard returned NEW unconditionally — every direct table
-- write skipped role-gating entirely. pgTAP 102 caught it: a worker could
-- self-confirm an item via a plain UPDATE (test 13, have 'confirmed').
--
-- The correct "is this an API call" test is current_profile_id() IS NULL:
-- PostgREST requests carry request.jwt.claims -> sub -> profile; service
-- role, migrations, and psql sessions have no sub, so the guard steps
-- aside for them (they bypass RLS anyway and are trusted).
--
-- Everything else in the function is unchanged: worker side may only write
-- missing/submitted, company owner/admin only confirmed/waived, unknown
-- keys and invalid states raise, disallowed states revert to OLD so both
-- sides' edits coexist.

CREATE OR REPLACE FUNCTION guard_onboarding_items() RETURNS trigger AS $$
DECLARE
  k text;
  v jsonb;
  item_state text;
  is_worker boolean;
  is_company_admin boolean;
  allowed_worker text[] := ARRAY['missing', 'submitted'];
  allowed_company text[] := ARRAY['confirmed', 'waived'];
BEGIN
  -- Non-API contexts (service role, migrations, psql) have no JWT subject.
  -- current_profile_id() reads request.jwt.claims, so NULL means "not a
  -- worker/company API call" — let it through. Do NOT use current_user:
  -- SECURITY DEFINER makes it the function owner, always.
  IF current_profile_id() IS NULL THEN RETURN NEW; END IF;

  -- Whole-row inserts may only carry an empty or all-'missing' checklist;
  -- richer states must come through onboarding_update_item.
  IF TG_OP = 'INSERT' THEN
    FOR k, v IN SELECT key, value FROM jsonb_each(NEW.items) LOOP
      item_state := v #>> '{}';
      IF item_state <> 'missing' THEN
        RAISE EXCEPTION 'Onboarding items start as missing — use onboarding_update_item';
      END IF;
    END LOOP;
    RETURN NEW;
  END IF;

  -- On UPDATE: worker side may only set worker-allowed states, company
  -- owner/admin may only set company-allowed states. Anything else is a
  -- no-op rejection (silently keeping OLD) so both sides' edits coexist.
  is_worker := (NEW.worker_id = current_profile_id());
  SELECT EXISTS (
    SELECT 1 FROM company_members cm
    WHERE cm.company_id = NEW.company_id
      AND cm.profile_id = current_profile_id()
      AND cm.member_role IN ('owner', 'admin')
  ) INTO is_company_admin;

  FOR k, v IN SELECT key, value FROM jsonb_each(NEW.items) LOOP
    item_state := v #>> '{}';
    -- Keys must come from the standard checklist — direct table writes
    -- can't invent items (RPCs are the intended path anyway).
    IF NOT (k = ANY(onboarding_item_keys())) THEN
      RAISE EXCEPTION 'Unknown onboarding item: %', k;
    END IF;
    IF item_state IS NULL OR item_state NOT IN ('missing','submitted','confirmed','waived') THEN
      RAISE EXCEPTION 'Invalid onboarding item state: %', item_state;
    END IF;
    IF is_worker AND NOT (item_state = ANY(allowed_worker)) THEN
      NEW.items := jsonb_set(NEW.items, ARRAY[k], to_jsonb(OLD.items ->> k));
    ELSIF is_company_admin AND NOT (item_state = ANY(allowed_company)) THEN
      NEW.items := jsonb_set(NEW.items, ARRAY[k], to_jsonb(OLD.items ->> k));
    ELSIF NOT is_worker AND NOT is_company_admin THEN
      RAISE EXCEPTION 'Not a party to this onboarding';
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;
