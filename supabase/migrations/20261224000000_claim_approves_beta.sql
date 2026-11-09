-- Waitlist claim grants beta access: a verified waitlist row IS the invite.
-- Previously claim_waitlist_spot linked the row but left profiles.beta_approved
-- false, so every invited tester still hit the closed-beta gate until an
-- admin flipped the flag by hand. Now the claim itself approves the profile
-- (fresh claim and idempotent re-claim paths).

CREATE OR REPLACE FUNCTION public.claim_waitlist_spot()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_email text;
  v_confirmed timestamptz;
  v_profile_id uuid;
  v_row public.waiting_list%ROWTYPE;
BEGIN
  -- Anonymous callers get a generic negative — never a reason code that
  -- could be used to probe waitlist membership.
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('claimed', false);
  END IF;

  -- The auth account's own email is the only acceptable claim key, and
  -- only once the mailbox is confirmed. Without this, someone could sign
  -- up unconfirmed with a victim's waitlist email and steal the claim.
  SELECT u.email, u.email_confirmed_at
    INTO v_email, v_confirmed
    FROM auth.users u
   WHERE u.id = v_uid;

  IF v_email IS NULL OR v_confirmed IS NULL THEN
    RETURN jsonb_build_object('claimed', false);
  END IF;

  -- The signup trigger normally creates the profile already; create it
  -- defensively for accounts that predate the trigger or hit its
  -- exception path.
  SELECT p.id INTO v_profile_id FROM public.profiles p WHERE p.user_id = v_uid;
  IF v_profile_id IS NULL THEN
    PERFORM public.get_or_create_profile(v_uid);
    SELECT p.id INTO v_profile_id FROM public.profiles p WHERE p.user_id = v_uid;
    IF v_profile_id IS NULL THEN
      RETURN jsonb_build_object('claimed', false);
    END IF;
  END IF;

  -- Idempotent: this profile already holds a claim → success again.
  SELECT w.* INTO v_row
    FROM public.waiting_list w
   WHERE w.claimed_by_profile_id = v_profile_id
   ORDER BY w.claimed_at DESC NULLS LAST
   LIMIT 1;
  IF v_row.id IS NOT NULL THEN
    UPDATE public.profiles SET beta_approved = true WHERE id = v_profile_id;
    RETURN jsonb_build_object(
      'claimed', true,
      'already_claimed', true,
      'role_interest', v_row.role_interest::text
    );
  END IF;

  -- The claimable row: same email (case-insensitive), verified through
  -- the waitlist token flow, not yet claimed.
  SELECT w.* INTO v_row
    FROM public.waiting_list w
   WHERE lower(w.email) = lower(v_email)
     AND w.status = 'verified'::public.waitlist_status
     AND w.claimed_by_profile_id IS NULL
   ORDER BY w.created_at
   LIMIT 1;

  IF v_row.id IS NULL THEN
    RETURN jsonb_build_object('claimed', false);
  END IF;

  -- Atomic claim: if a concurrent call won the race, FOUND is false and
  -- we report no claim rather than double-linking.
  UPDATE public.waiting_list
     SET claimed_by_profile_id = v_profile_id,
         claimed_at = now()
   WHERE id = v_row.id
     AND claimed_by_profile_id IS NULL;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('claimed', false);
  END IF;

  -- Prefill only fields the user hasn't already filled in — the signup
  -- form's own answers always win over waitlist-card data.
  UPDATE public.profiles p
     SET phone       = COALESCE(p.phone, NULLIF(v_row.phone, '')),
         location    = COALESCE(p.location, NULLIF(v_row.market_city, '')),
         day_rate    = COALESCE(p.day_rate, v_row.day_rate_min::numeric),
         beta_approved = true,
         updated_at  = now()
   WHERE p.id = v_profile_id;

  RETURN jsonb_build_object(
    'claimed', true,
    'already_claimed', false,
    'role_interest', v_row.role_interest::text
  );
END;
$function$

