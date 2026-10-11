-- Regression: issue #21 — a negative break_minutes added paid time to the
-- timesheet's gross. The floor is a row CHECK, so it applies to every writer,
-- including the approve_timesheet override path.
BEGIN;
SELECT plan(3);

INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, raw_user_meta_data, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-00000000b281', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'owner21@test.local', 'x', '{"full_name":"Owner"}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-00000000b282', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'worker21@test.local', 'x', '{"full_name":"Worker"}'::jsonb, now(), now());

INSERT INTO companies (id, name, created_by)
SELECT '00000000-0000-0000-0000-00000000c280', 'Break Co', id FROM profiles WHERE user_id = '00000000-0000-0000-0000-00000000b281';
INSERT INTO events (id, company_id, name, starts_on, ends_on, status)
VALUES ('00000000-0000-0000-0000-00000000e280', '00000000-0000-0000-0000-00000000c280', 'Break show', '2027-03-01', '2027-03-02', 'published');
INSERT INTO shifts (id, event_id, title, role_name, headcount, starts_at, ends_at, hourly_rate, status, broadcast_stage)
VALUES ('00000000-0000-0000-0000-00000000d280', '00000000-0000-0000-0000-00000000e280',
        'Call', 'Stagehand', 2, '2027-03-01 08:00+00', '2027-03-01 16:00+00', 30.00, 'open', 'public');

INSERT INTO shift_assignments (id, shift_id, worker_id, status, source)
SELECT '28000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000d280', p.id,
       'confirmed'::assignment_status, 'public_marketplace'::assignment_source
FROM profiles p WHERE p.user_id = '00000000-0000-0000-0000-00000000b282';

INSERT INTO timesheets (id, assignment_id, shift_id, worker_id, break_minutes, status)
SELECT '28000000-0000-0000-0000-0000000000b1', '28000000-0000-0000-0000-0000000000a1',
       '00000000-0000-0000-0000-00000000d280', p.id, 0, 'open'::timesheet_status
FROM profiles p WHERE p.user_id = '00000000-0000-0000-0000-00000000b282';

-- a negative break can no longer be written, by anyone
SELECT throws_ok($$
  UPDATE timesheets SET break_minutes = -90 WHERE id = '28000000-0000-0000-0000-0000000000b1'
$$, '23514', NULL, 'negative break minutes are rejected');

-- a real break is still accepted
SELECT lives_ok($$
  UPDATE timesheets SET break_minutes = 30 WHERE id = '28000000-0000-0000-0000-0000000000b1'
$$, 'a 30-minute break is accepted');

SELECT is((SELECT break_minutes FROM timesheets WHERE id = '28000000-0000-0000-0000-0000000000b1'), 30,
          'the stored break is the one written');

SELECT * FROM finish();
ROLLBACK;
