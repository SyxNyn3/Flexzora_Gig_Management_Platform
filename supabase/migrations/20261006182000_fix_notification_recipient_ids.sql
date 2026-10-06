-- Fix notification recipient ids: notifications.user_id REFERENCES profiles(id),
-- but the notification helpers and triggers were passing auth.users.id. Every
-- notification insert therefore violated the FK and rolled back the triggering
-- write (accepted applications, payments, gig creation).

-- create_notification now accepts either a profiles.id or an auth.users id and
-- resolves to the profile row before inserting.
DROP FUNCTION IF EXISTS create_notification(uuid, text, text, text, text, jsonb);
CREATE FUNCTION create_notification(
  p_user_id UUID,
  p_title TEXT,
  p_message TEXT,
  p_type TEXT DEFAULT 'info',
  p_action_url TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  notification_id UUID;
  profile_id UUID;
BEGIN
  SELECT p.id INTO profile_id
  FROM profiles p
  WHERE p.id = p_user_id OR p.user_id = p_user_id
  LIMIT 1;

  IF profile_id IS NULL THEN
    RETURN NULL;
  END IF;

  INSERT INTO notifications (
    user_id, title, message, type, action_url, metadata
  ) VALUES (
    profile_id, p_title, p_message, p_type, p_action_url, p_metadata
  ) RETURNING id INTO notification_id;

  RETURN notification_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- notify_on_application_status_change bypassed create_notification and did raw
-- INSERTs of p.user_id; store the profile id instead.
CREATE OR REPLACE FUNCTION notify_on_application_status_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO notifications (
      user_id,
      title,
      message,
      type,
      metadata
    )
    SELECT
      p.id,
      CASE
        WHEN NEW.status = 'accepted' THEN 'Application Accepted! 🎉'
        WHEN NEW.status = 'rejected' THEN 'Application Update'
        ELSE 'Application Status Changed'
      END,
      CASE
        WHEN NEW.status = 'accepted' THEN 'Congratulations! Your application for "' || g.title || '" has been accepted.'
        WHEN NEW.status = 'rejected' THEN 'Your application for "' || g.title || '" was not selected this time.'
        ELSE 'Your application for "' || g.title || '" has been updated to ' || NEW.status || '.'
      END,
      CASE
        WHEN NEW.status = 'accepted' THEN 'success'
        WHEN NEW.status = 'rejected' THEN 'info'
        ELSE 'info'
      END,
      jsonb_build_object(
        'application_id', NEW.id,
        'gig_id', NEW.gig_id,
        'old_status', OLD.status,
        'new_status', NEW.status,
        'gig_title', g.title
      )
    FROM profiles p
    JOIN gigs g ON g.id = NEW.gig_id
    WHERE p.id = NEW.worker_id;

    INSERT INTO notifications (
      user_id,
      title,
      message,
      type,
      metadata
    )
    SELECT
      p.id,
      'Application Status Updated',
      'Application from ' || wp.full_name || ' for "' || g.title || '" is now ' || NEW.status || '.',
      'info',
      jsonb_build_object(
        'application_id', NEW.id,
        'gig_id', NEW.gig_id,
        'worker_id', NEW.worker_id,
        'old_status', OLD.status,
        'new_status', NEW.status,
        'worker_name', wp.full_name
      )
    FROM profiles p
    JOIN gigs g ON g.id = NEW.gig_id
    JOIN profiles wp ON wp.id = NEW.worker_id
    WHERE p.id = g.created_by;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
