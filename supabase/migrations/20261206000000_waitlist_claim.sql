/*
  # Waitlist claim — verified waitlist signup → real account

  A person who joined the waitlist AND verified their email
  (waiting_list.status = 'verified') should be able to convert that spot
  into a real Flexzora account without re-entering their crew card.

  1. Schema
    - waiting_list.claimed_by_profile_id uuid → profiles(id)
    - waiting_list.claimed_at timestamptz
    - Unique partial index: one waitlist row per profile (and, because
      waiting_list.email is unique, effectively one claim per email).

  2. claim_waitlist_spot() — SECURITY DEFINER RPC, authenticated only
    Matches the CALLER's confirmed auth email (auth.users, not a client
    parameter — nobody can claim someone else's row by passing an email)
    to a verified, unclaimed waiting_list row, writes the link, and fills
    profile fields that are still empty (phone, location, day_rate).
    Never overwrites data the user already entered.

    Abuse guards:
    - Requires auth.uid() and a confirmed auth email
      (email_confirmed_at IS NOT NULL) — an unverified signup can't
      hijack a waitlist row belonging to the real mailbox owner.
    - The waitlist row itself must be status='verified' — the waitlist
      token flow already proved mailbox ownership.
    - Idempotent: repeat calls return already_claimed; a concurrent claim
      loses the UPDATE ... WHERE claimed_by_profile_id IS NULL race.
    - Returns only a minimal jsonb summary — no waitlist internals leak.

  3. RLS
    - waiting_list gains a SELECT policy so a claimant can read back
      THEIR OWN claimed crew card (needed for onboarding prefill).
      Writes still go through the definer function only.
*/

ALTER TABLE public.waiting_list
  ADD COLUMN IF NOT EXISTS claimed_by_profile_id uuid
    REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS claimed_at timestamptz;

-- One waitlist row can only ever be claimed by one profile.
CREATE UNIQUE INDEX IF NOT EXISTS waiting_list_claimed_by_profile_key
  ON public.waiting_list (claimed_by_profile_id)
  WHERE claimed_by_profile_id IS NOT NULL;

-- Email lookups compare case-insensitively; the plain unique index on
-- email is case-sensitive so add a functional index for the claim path.
CREATE INDEX IF NOT EXISTS idx_waiting_list_email_lower
  ON public.waiting_list (lower(email));

-- Claimants can read their own claimed row (crew card prefill). Everyone
-- else still sees nothing — the admin SELECT policy is unchanged.
DROP POLICY IF EXISTS "Claimants can view own claimed waitlist entry" ON public.waiting_list;
CREATE POLICY "Claimants can view own claimed waitlist entry" ON public.waiting_list
  FOR SELECT TO authenticated
  USING (claimed_by_profile_id = public.current_profile_id());

CREATE OR REPLACE FUNCTION public.claim_waitlist_spot()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
         updated_at  = now()
   WHERE p.id = v_profile_id;

  RETURN jsonb_build_object(
    'claimed', true,
    'already_claimed', false,
    'role_interest', v_row.role_interest::text
  );
END;
$$;

REVOKE ALL ON FUNCTION public.claim_waitlist_spot() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_waitlist_spot() FROM anon;
GRANT EXECUTE ON FUNCTION public.claim_waitlist_spot() TO authenticated;
