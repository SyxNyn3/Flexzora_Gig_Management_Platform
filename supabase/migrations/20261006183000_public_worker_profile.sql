-- Public worker profile: shareable /u/<username> page backed by a curated
-- SECURITY DEFINER read. Deliberately exposes only marketplace-safe fields —
-- no email, phone, user_id, or availability internals.

CREATE OR REPLACE FUNCTION get_public_profile(p_username text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result json;
BEGIN
  SELECT json_build_object(
    'full_name', p.full_name,
    'username', p.username,
    'avatar_url', p.avatar_url,
    'location', p.location,
    'bio', p.bio,
    'hourly_rate', p.hourly_rate,
    'experience_years', p.experience_years,
    'average_rating', p.average_rating,
    'review_count', p.review_count,
    'portfolio_url', p.portfolio_url,
    'skills', (
      SELECT COALESCE(json_agg(json_build_object(
        'name', s.name,
        'proficiency_level', ws.proficiency_level,
        'years_experience', ws.years_experience
      )), '[]'::json)
      FROM worker_skills ws
      JOIN skills s ON s.id = ws.skill_id
      WHERE ws.worker_id = p.id
    ),
    'portfolio_items', (
      SELECT COALESCE(json_agg(json_build_object(
        'title', pi.title,
        'description', pi.description,
        'url', pi.url,
        'image_url', pi.image_url,
        'category', pi.category,
        'client', pi.client,
        'date_completed', pi.date_completed,
        'is_featured', pi.is_featured
      ) ORDER BY pi.is_featured DESC, pi.date_completed DESC NULLS LAST), '[]'::json)
      FROM portfolio_items pi
      WHERE pi.worker_id = p.id
    ),
    'reviews', (
      SELECT COALESCE(json_agg(json_build_object(
        'rating', r.rating,
        'comment', r.comment,
        'reviewer_name', rp.full_name,
        'created_at', r.created_at
      ) ORDER BY r.created_at DESC), '[]'::json)
      FROM (
        SELECT * FROM reviews
        WHERE reviewee_id = p.id
        ORDER BY created_at DESC
        LIMIT 5
      ) r
      LEFT JOIN profiles rp ON rp.id = r.reviewer_id
    )
  ) INTO result
  FROM profiles p
  WHERE lower(p.username) = lower(p_username)
    AND p.role = 'worker';

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION get_public_profile(text) TO anon;
GRANT EXECUTE ON FUNCTION get_public_profile(text) TO authenticated;
