-- Admins need to see demo requests in the triage UI; table is otherwise
-- service-role only (public inserts go through the schedule-demo function).
DROP POLICY IF EXISTS "Admins can view all demo requests" ON demo_requests;
CREATE POLICY "Admins can view all demo requests" ON demo_requests
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.user_id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Admins can update demo requests" ON demo_requests;
CREATE POLICY "Admins can update demo requests" ON demo_requests
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.user_id = auth.uid()
      AND profiles.role = 'admin'
    )
  );
