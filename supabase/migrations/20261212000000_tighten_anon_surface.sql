-- Security Advisor cleanup: remove two overly-permissive policies.
--
-- 1) waiting_list "Anyone can add themselves to the waiting list"
--    (INSERT ... WITH CHECK true for public). Direct PostgREST inserts
--    bypass the submit-waitlist edge function entirely — no honeypot,
--    no rate limit, no dedupe window. All real writes already go
--    through submit-waitlist (service role, bypasses RLS) or
--    waitlist_fill_crew_card (definer), so this policy is dead weight
--    and a spam vector. AGENTS.md already mandates the edge-function
--    path; this makes the database agree.
DROP POLICY IF EXISTS "Anyone can add themselves to the waiting list"
  ON public.waiting_list;
--
-- 2) avatars "avatar objects readable" (SELECT on storage.objects for
--    anon+authenticated). Public-bucket object GETs are served by the
--    CDN without checking storage.objects, so avatars keep rendering;
--    the policy only enabled bucket listing, which exposed every
--    object's path. Nothing in the app calls list()/download() —
--    avatar.ts uses upload() + getPublicUrl() only.
DROP POLICY IF EXISTS "avatar objects readable" ON storage.objects;
