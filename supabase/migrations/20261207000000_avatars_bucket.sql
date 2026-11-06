-- Public avatars bucket for profile photos.
--
-- profiles.avatar_url existed and rendered across the app (dashboard,
-- candidates, applications, public profiles) but nothing could ever set it —
-- the profile page camera button literally toasted "coming soon". This
-- bucket plus folder-scoped storage policies makes upload real.
--
-- Layout: avatars/{profile_id}/{uuid}.webp — the first path segment is the
-- owner's profile id, which is what the storage.objects policies check.
-- Public bucket so <img> tags and public profile pages need no signing;
-- writes are restricted to the folder owner. 2 MB cap + image/* only —
-- the client also downscales to 512px webp before upload, so real files
-- land around 30-80 KB.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('avatars', 'avatars', true, 2097152,
        '{image/jpeg,image/png,image/webp,image/gif}')
ON CONFLICT (id) DO NOTHING;

-- Upload/update/delete only inside your own {profile_id}/ folder.
-- storage.foldername() splits the object path; segment 1 is the owner key.
DROP POLICY IF EXISTS "avatar upload own folder" ON storage.objects;
CREATE POLICY "avatar upload own folder" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = public.current_profile_id()::text
  );

DROP POLICY IF EXISTS "avatar update own folder" ON storage.objects;
CREATE POLICY "avatar update own folder" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = public.current_profile_id()::text
  )
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = public.current_profile_id()::text
  );

DROP POLICY IF EXISTS "avatar delete own folder" ON storage.objects;
CREATE POLICY "avatar delete own folder" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = public.current_profile_id()::text
  );

-- Public bucket objects are served by the CDN public URL without a signed
-- URL; this SELECT policy keeps list/get API calls working for anyone who
-- can see the app (profiles are already visible to authenticated users).
DROP POLICY IF EXISTS "avatar objects readable" ON storage.objects;
CREATE POLICY "avatar objects readable" ON storage.objects
  FOR SELECT TO authenticated, anon
  USING (bucket_id = 'avatars');
