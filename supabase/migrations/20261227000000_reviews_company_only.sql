-- Reviews are company-facing signal: hiring decisions and admin/AI
-- matching. The reviewee must never read reviews about themselves, so the
-- old "any authenticated user can view all reviews" policy is replaced.
-- SELECT is now limited to:
--   1. the review's author (reviewer_id = caller's profile), and
--   2. members of any company — except reviews about their own profile
--      (a dual-role user who is also a company member still can't read
--      reviews about themselves).
-- Workers with no company membership can no longer read the reviews table
-- at all; PublicProfilePage reviews render empty for them, which matches
-- the product intent.

DROP POLICY IF EXISTS "Anyone can view reviews" ON public.reviews;

CREATE POLICY "Reviews visible to author and companies"
  ON public.reviews
  FOR SELECT
  TO authenticated
  USING (
    reviewer_id = public.current_profile_id()
    OR (
      reviewee_id IS DISTINCT FROM public.current_profile_id()
      AND EXISTS (
        SELECT 1
        FROM public.company_members cm
        WHERE cm.profile_id = public.current_profile_id()
      )
    )
  );
