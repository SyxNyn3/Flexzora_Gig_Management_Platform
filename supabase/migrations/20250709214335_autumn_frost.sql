/*
  # Notification System Functions and Triggers

  1. New Functions
    - `create_notification` - Creates a notification for a user
    - `notify_on_application_status_change` - Notifies users about application status changes
    - `notify_on_payment_status_change` - Notifies users about payment status changes
    - `notify_on_gig_creation` - Notifies workers about new gig opportunities
  
  2. Triggers
    - Conditionally creates triggers for application status changes
    - Conditionally creates triggers for payment status changes
    - Conditionally creates triggers for gig creation and publishing
*/

-- Function to create a notification
CREATE OR REPLACE FUNCTION create_notification(
  p_user_id UUID,
  p_title TEXT,
  p_message TEXT,
  p_type TEXT DEFAULT 'info',
  p_action_url TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  notification_id UUID;
BEGIN
  INSERT INTO notifications (
    user_id,
    title,
    message,
    type,
    read,
    action_url,
    metadata
  ) VALUES (
    p_user_id,
    p_title,
    p_message,
    p_type,
    false,
    p_action_url,
    p_metadata
  )
  RETURNING id INTO notification_id;
  
  RETURN notification_id;
END;
$$ LANGUAGE plpgsql;

-- Function to notify on application status change
CREATE OR REPLACE FUNCTION notify_on_application_status_change()
RETURNS TRIGGER AS $$
DECLARE
  worker_profile RECORD;
  company_profile RECORD;
  gig_record RECORD;
  notification_title TEXT;
  notification_message TEXT;
  notification_type TEXT;
  action_url TEXT;
BEGIN
  -- Get related records
  SELECT * INTO worker_profile FROM profiles WHERE id = NEW.worker_id;
  SELECT * INTO gig_record FROM gigs WHERE id = NEW.gig_id;
  SELECT * INTO company_profile FROM profiles WHERE id = gig_record.created_by;
  
  -- Set action URL
  action_url := '/gigs/' || NEW.gig_id;
  
  -- Create notification based on status change
  IF NEW.status = 'accepted' AND OLD.status = 'pending' THEN
    -- Notify worker that their application was accepted
    notification_title := 'Application Accepted';
    notification_message := 'Your application for "' || gig_record.title || '" has been accepted!';
    notification_type := 'success';
    
    PERFORM create_notification(
      worker_profile.user_id,
      notification_title,
      notification_message,
      notification_type,
      action_url,
      jsonb_build_object(
        'gig_id', NEW.gig_id,
        'application_id', NEW.id,
        'status', NEW.status
      )
    );
    
  ELSIF NEW.status = 'rejected' AND OLD.status = 'pending' THEN
    -- Notify worker that their application was rejected
    notification_title := 'Application Not Selected';
    notification_message := 'Your application for "' || gig_record.title || '" was not selected.';
    notification_type := 'error';
    
    PERFORM create_notification(
      worker_profile.user_id,
      notification_title,
      notification_message,
      notification_type,
      action_url,
      jsonb_build_object(
        'gig_id', NEW.gig_id,
        'application_id', NEW.id,
        'status', NEW.status
      )
    );
    
  ELSIF NEW.status = 'pending' AND OLD.status IS NULL THEN
    -- Notify company that a new application was received
    notification_title := 'New Application Received';
    notification_message := worker_profile.full_name || ' applied for "' || gig_record.title || '".';
    notification_type := 'info';
    
    PERFORM create_notification(
      company_profile.user_id,
      notification_title,
      notification_message,
      notification_type,
      '/applications',
      jsonb_build_object(
        'gig_id', NEW.gig_id,
        'application_id', NEW.id,
        'worker_id', NEW.worker_id,
        'worker_name', worker_profile.full_name,
        'status', NEW.status
      )
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to notify on payment status change
CREATE OR REPLACE FUNCTION notify_on_payment_status_change()
RETURNS TRIGGER AS $$
DECLARE
  worker_profile RECORD;
  company_profile RECORD;
  gig_record RECORD;
  notification_title TEXT;
  notification_message TEXT;
  notification_type TEXT;
  action_url TEXT;
BEGIN
  -- Get related records
  SELECT * INTO worker_profile FROM profiles WHERE id = NEW.worker_id;
  
  IF NEW.company_id IS NOT NULL THEN
    SELECT * INTO company_profile FROM profiles WHERE id = NEW.company_id;
  END IF;
  
  IF NEW.gig_id IS NOT NULL THEN
    SELECT * INTO gig_record FROM gigs WHERE id = NEW.gig_id;
    action_url := '/gigs/' || NEW.gig_id;
  ELSE
    action_url := '/finances';
  END IF;
  
  -- Create notification based on status change
  IF NEW.status = 'paid' AND OLD.status = 'pending' THEN
    -- Notify worker that payment was made
    notification_title := 'Payment Received';
    notification_message := 'You received a payment of ' || NEW.currency || ' ' || NEW.amount::text;
    
    IF gig_record.title IS NOT NULL THEN
      notification_message := notification_message || ' for "' || gig_record.title || '".';
    ELSE
      notification_message := notification_message || '.';
    END IF;
    
    notification_type := 'success';
    
    PERFORM create_notification(
      worker_profile.user_id,
      notification_title,
      notification_message,
      notification_type,
      action_url,
      jsonb_build_object(
        'payment_id', NEW.id,
        'gig_id', NEW.gig_id,
        'amount', NEW.amount,
        'currency', NEW.currency,
        'status', NEW.status
      )
    );
    
  ELSIF NEW.status = 'overdue' AND OLD.status = 'pending' THEN
    -- Notify worker that payment is overdue
    notification_title := 'Payment Overdue';
    notification_message := 'A payment of ' || NEW.currency || ' ' || NEW.amount::text || ' is overdue';
    
    IF gig_record.title IS NOT NULL THEN
      notification_message := notification_message || ' for "' || gig_record.title || '".';
    ELSE
      notification_message := notification_message || '.';
    END IF;
    
    notification_type := 'warning';
    
    PERFORM create_notification(
      worker_profile.user_id,
      notification_title,
      notification_message,
      notification_type,
      action_url,
      jsonb_build_object(
        'payment_id', NEW.id,
        'gig_id', NEW.gig_id,
        'amount', NEW.amount,
        'currency', NEW.currency,
        'status', NEW.status
      )
    );
    
    -- Also notify company if it exists
    IF company_profile.user_id IS NOT NULL THEN
      PERFORM create_notification(
        company_profile.user_id,
        'Payment Due',
        'A payment of ' || NEW.currency || ' ' || NEW.amount::text || ' for "' || COALESCE(gig_record.title, 'a gig') || '" is overdue.',
        'warning',
        action_url,
        jsonb_build_object(
          'payment_id', NEW.id,
          'gig_id', NEW.gig_id,
          'worker_id', NEW.worker_id,
          'amount', NEW.amount,
          'currency', NEW.currency,
          'status', NEW.status
        )
      );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to notify on new gig creation
CREATE OR REPLACE FUNCTION notify_on_gig_creation()
RETURNS TRIGGER AS $$
DECLARE
  worker_profile RECORD;
  skill TEXT;
  matching_workers CURSOR FOR
    SELECT DISTINCT p.* 
    FROM profiles p
    JOIN worker_skills ws ON p.id = ws.worker_id
    JOIN skills s ON ws.skill_id = s.id
    WHERE 
      p.role = 'worker' AND
      p.is_available = true AND
      (
        NEW.skills_required IS NULL OR
        EXISTS (
          SELECT 1 
          FROM unnest(NEW.skills_required) AS req_skill
          WHERE s.name ILIKE req_skill
        )
      );
BEGIN
  -- Only notify for published gigs
  IF NEW.status = 'published' THEN
    -- Notify matching workers about the new gig
    FOR worker_profile IN matching_workers LOOP
      PERFORM create_notification(
        worker_profile.user_id,
        'New Gig Opportunity',
        'A new gig "' || NEW.title || '" matches your skills.',
        'info',
        '/gigs/' || NEW.id,
        jsonb_build_object(
          'gig_id', NEW.id,
          'title', NEW.title,
          'location', NEW.location,
          'start_date', NEW.start_date,
          'hourly_rate', NEW.hourly_rate
        )
      );
    END LOOP;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Conditionally create triggers to avoid errors if they already exist
DO $$
BEGIN
  -- Check if application status change trigger exists
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger 
    WHERE tgname = 'after_application_status_change'
  ) THEN
    CREATE OR REPLACE TRIGGER after_application_status_change
    AFTER UPDATE OF status ON gig_applications
    FOR EACH ROW
    WHEN (OLD.status IS DISTINCT FROM NEW.status)
    EXECUTE FUNCTION notify_on_application_status_change();
  END IF;

  -- Check if application insert trigger exists
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger 
    WHERE tgname = 'after_application_insert'
  ) THEN
    CREATE OR REPLACE TRIGGER after_application_insert
    AFTER INSERT ON gig_applications
    FOR EACH ROW
    EXECUTE FUNCTION notify_on_application_status_change();
  END IF;

  -- Check if payment status change trigger exists
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger 
    WHERE tgname = 'after_payment_status_change'
  ) THEN
    CREATE OR REPLACE TRIGGER after_payment_status_change
    AFTER UPDATE OF status ON payments
    FOR EACH ROW
    WHEN (OLD.status IS DISTINCT FROM NEW.status)
    EXECUTE FUNCTION notify_on_payment_status_change();
  END IF;

  -- Check if gig insert trigger exists
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger 
    WHERE tgname = 'after_gig_insert'
  ) THEN
    CREATE OR REPLACE TRIGGER after_gig_insert
    AFTER INSERT ON gigs
    FOR EACH ROW
    EXECUTE FUNCTION notify_on_gig_creation();
  END IF;

  -- Check if gig publish trigger exists
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger 
    WHERE tgname = 'after_gig_publish'
  ) THEN
    CREATE OR REPLACE TRIGGER after_gig_publish
    AFTER UPDATE OF status ON gigs
    FOR EACH ROW
    WHEN (OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'published')
    EXECUTE FUNCTION notify_on_gig_creation();
  END IF;
END
$$;