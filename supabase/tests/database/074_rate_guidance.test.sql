-- Lane B #7: rate guidance. Percentiles over cleared rates, scoped by role
-- family and market radius; aggregate-only (no rows leave the function).
BEGIN;
SELECT plan(5);

INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, raw_user_meta_data, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-00000000b061', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'rg-owner@test.local', 'x', '{"full_name":"Owner","role":"company"}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-00000000b062', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'rg-worker@test.local', 'x', '{"full_name":"Worker","role":"worker"}'::jsonb, now(), now());

INSERT INTO companies (id, name, created_by)
SELECT '00000000-0000-0000-0000-00000000c0cc', 'RateCo', id FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000b061';

INSERT INTO venues (id, company_id, name, address, latitude, longitude) VALUES
  ('00000000-0000-0000-0000-00000000d011', '00000000-0000-0000-0000-00000000c0cc', 'LA Spot', '1 LA', 34.0430, -118.2673),
  ('00000000-0000-0000-0000-00000000d012', '00000000-0000-0000-0000-00000000c0cc', 'Vegas Spot', '1 LV', 36.1699, -115.1398);

INSERT INTO events (id, company_id, venue_id, created_by, name, starts_on, ends_on, status) VALUES
  ('00000000-0000-0000-0000-00000000e0c1', '00000000-0000-0000-0000-00000000c0cc', '00000000-0000-0000-0000-00000000d011',
   (SELECT id FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000b061'), 'LA One', current_date - 10, current_date - 9, 'completed'),
  ('00000000-0000-0000-0000-00000000e0c2', '00000000-0000-0000-0000-00000000c0cc', '00000000-0000-0000-0000-00000000d011',
   (SELECT id FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000b061'), 'LA Two', current_date - 8, current_date - 7, 'completed'),
  ('00000000-0000-0000-0000-00000000e0c3', '00000000-0000-0000-0000-00000000c0cc', '00000000-0000-0000-0000-00000000d011',
   (SELECT id FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000b061'), 'LA Three', current_date - 6, current_date - 5, 'completed'),
  ('00000000-0000-0000-0000-00000000e0c4', '00000000-0000-0000-0000-00000000c0cc', '00000000-0000-0000-0000-00000000d012',
   (SELECT id FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000b061'), 'Vegas One', current_date - 4, current_date - 3, 'completed');

-- cleared rates: three LA Ground Rigger calls at 40/50/60, one Vegas rigger at
-- 100, one LA stagehand at 30 — all confirmed
INSERT INTO shifts (id, event_id, title, role_name, headcount, starts_at, ends_at, hourly_rate, status) VALUES
  ('00000000-0000-0000-0000-00000000f401', '00000000-0000-0000-0000-00000000e0c1', 'Rig', 'Ground Rigger', 1, now() - interval '10 days', now() - interval '10 days' + interval '8 hours', 40.00, 'completed'),
  ('00000000-0000-0000-0000-00000000f402', '00000000-0000-0000-0000-00000000e0c2', 'Rig', 'Ground Rigger', 1, now() - interval '8 days',  now() - interval '8 days'  + interval '8 hours', 50.00, 'completed'),
  ('00000000-0000-0000-0000-00000000f403', '00000000-0000-0000-0000-00000000e0c3', 'Rig', 'Ground Rigger', 1, now() - interval '6 days',  now() - interval '6 days'  + interval '8 hours', 60.00, 'completed'),
  ('00000000-0000-0000-0000-00000000f404', '00000000-0000-0000-0000-00000000e0c4', 'Rig', 'Ground Rigger', 1, now() - interval '4 days',  now() - interval '4 days'  + interval '8 hours', 100.00, 'completed'),
  ('00000000-0000-0000-0000-00000000f405', '00000000-0000-0000-0000-00000000e0c1', 'Deck', 'Stagehand', 1, now() - interval '10 days', now() - interval '10 days' + interval '8 hours', 30.00, 'completed');

INSERT INTO shift_assignments (shift_id, worker_id, source, status, confirmed_at)
SELECT s.id, p.id, 'direct_book', 'confirmed', now()
  FROM shifts s, profiles p
  WHERE s.id IN ('00000000-0000-0000-0000-00000000f401','00000000-0000-0000-0000-00000000f402',
                 '00000000-0000-0000-0000-00000000f403','00000000-0000-0000-0000-00000000f404',
                 '00000000-0000-0000-0000-00000000f405')
    AND p.user_id = '00000000-0000-0000-0000-00000000b062';

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000b061","role":"authenticated"}', true);

SELECT is(
  (SELECT (rate_guidance('00000000-0000-0000-0000-00000000c0cc', 'Ground Rigger', NULL, 34.0430, -118.2673) ->> 'count')::int),
  3, 'scoped to the LA market, only the three local rigger calls count');

SELECT is(
  (SELECT (rate_guidance('00000000-0000-0000-0000-00000000c0cc', 'Ground Rigger', NULL, 34.0430, -118.2673) ->> 'p50')::numeric),
  50.00, 'median cleared rate for LA riggers is $50');

SELECT is(
  (SELECT (rate_guidance('00000000-0000-0000-0000-00000000c0cc', 'Ground Rigger', NULL, NULL, NULL) ->> 'count')::int),
  4, 'unscoped guidance includes the Vegas call');

SELECT is(
  (SELECT rate_guidance('00000000-0000-0000-0000-00000000c0cc', 'Stagehand', NULL, 34.0430, -118.2673) ->> 'p50'),
  NULL, 'single cleared rate is suppressed (k-anonymity floor) — it would leak the worker''s negotiated number');

SELECT is(
  (SELECT (rate_guidance('00000000-0000-0000-0000-00000000c0cc', 'Followspot', NULL, NULL, NULL) ->> 'count')::int),
  0, 'roles nobody has worked come back empty');

SELECT * FROM finish();
ROLLBACK;
