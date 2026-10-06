/*
  # Fix Notification Triggers

  1. Changes
    - Add conditional checks before creating triggers and functions
    - Ensures triggers are only created if they don't already exist
    - Prevents "trigger already exists" errors

  2. Functions
    - create_notification - Helper function to create notifications
    - notify_on_application_status_change - Creates notifications when application status changes
    - notify_on_payment_status_change - Creates notifications when payment status changes
    - notify_on_gig_creation - Creates notifications when new gigs are created

  3. Triggers
    - after_application_status_change - Trigger for application status changes
    - after_payment_status_change - Trigger for payment status changes
    - after_gig_insert - Trigger for new gig creation
*/

-- Check if create_notification function exists before creating it
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc 
    WHERE proname = 'create_notification'
    AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
  ) THEN
    CREATE OR REPLACE FUNCTION create_notification(
      user_id UUID,
      title TEXT,
      message TEXT,
      type TEXT DEFAULT 'info',
      action_url TEXT DEFAULT NULL,
      metadata JSONB DEFAULT NULL
    ) RETURNS UUID AS $$
    DECLARE
      notification_id UUID;
    BEGIN
      INSERT INTO notifications (
        user_id, title, message, type, action_url, metadata
      ) VALUES (
        user_id, title, message, type, action_url, metadata
      ) RETURNING id INTO notification_id;
      
      RETURN notification_id;
    END;
    $$ LANGUAGE plpgsql SECURITY DEFINER;
  END IF;
END
$$;

-- Check if notify_on_application_status_change function exists before creating it
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc 
    WHERE proname = 'notify_on_application_status_change'
    AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
  ) THEN
    CREATE OR REPLACE FUNCTION notify_on_application_status_change()
    RETURNS TRIGGER AS $$
    DECLARE
      worker_user_id UUID;
      company_user_id UUID;
      gig_title TEXT;
      notification_title TEXT;
      notification_message TEXT;
      notification_type TEXT;
    BEGIN
      -- Get the worker's user_id
      SELECT user_id INTO worker_user_id
      FROM profiles
      WHERE id = NEW.worker_id;
      
      -- Get the company's user_id and gig title
      SELECT p.user_id, g.title INTO company_user_id, gig_title
      FROM gigs g
      JOIN profiles p ON p.id = g.created_by
      WHERE g.id = NEW.gig_id;
      
      -- Set notification details based on status
      IF NEW.status = 'accepted' THEN
        notification_title := 'Application Accepted';
        notification_message := 'Your application for "' || gig_title || '" has been accepted!';
        notification_type := 'success';
      ELSIF NEW.status = 'rejected' THEN
        notification_title := 'Application Rejected';
        notification_message := 'Your application for "' || gig_title || '" was not accepted.';
        notification_type := 'info';
      ELSIF NEW.status = 'pending' AND TG_OP = 'INSERT' THEN
        notification_title := 'New Application Received';
        notification_message := 'You have received a new application for "' || gig_title || '".';
        notification_type := 'info';
        
        -- Create notification for company
        PERFORM create_notification(
          company_user_id,
          notification_title,
          notification_message,
          notification_type,
          '/applications',
          jsonb_build_object('gig_id', NEW.gig_id, 'application_id', NEW.id)
        );
        
        -- Don't create worker notification for new applications
        RETURN NEW;
      END IF;
      
      -- Create notification for worker
      IF worker_user_id IS NOT NULL THEN
        PERFORM create_notification(
          worker_user_id,
          notification_title,
          notification_message,
          notification_type,
          '/applications',
          jsonb_build_object('gig_id', NEW.gig_id, 'application_id', NEW.id)
        );
      END IF;
      
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql SECURITY DEFINER;
  END IF;
END
$$;

-- Check if notify_on_payment_status_change function exists before creating it
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc 
    WHERE proname = 'notify_on_payment_status_change'
    AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
  ) THEN
    CREATE OR REPLACE FUNCTION notify_on_payment_status_change()
    RETURNS TRIGGER AS $$
    DECLARE
      worker_user_id UUID;
      company_user_id UUID;
      gig_title TEXT;
      notification_title TEXT;
      notification_message TEXT;
      notification_type TEXT;
    BEGIN
      -- Get the worker's user_id
      SELECT user_id INTO worker_user_id
      FROM profiles
      WHERE id = NEW.worker_id;
      
      -- Get the company's user_id
      SELECT user_id INTO company_user_id
      FROM profiles
      WHERE id = NEW.company_id;
      
      -- Get gig title if available
      SELECT title INTO gig_title
      FROM gigs
      WHERE id = NEW.gig_id;
      
      IF gig_title IS NULL THEN
        gig_title := 'your gig';
      END IF;
      
      -- Set notification details based on status
      IF NEW.status = 'paid' THEN
        notification_title := 'Payment Received';
        notification_message := 'Your payment of $' || NEW.amount || ' for "' || gig_title || '" has been processed.';
        notification_type := 'success';
      ELSIF NEW.status = 'pending' THEN
        notification_title := 'Payment Pending';
        notification_message := 'A payment of $' || NEW.amount || ' for "' || gig_title || '" is pending.';
        notification_type := 'info';
      ELSIF NEW.status = 'overdue' THEN
        notification_title := 'Payment Overdue';
        notification_message := 'Your payment of $' || NEW.amount || ' for "' || gig_title || '" is overdue.';
        notification_type := 'warning';
      END IF;
      
      -- Create notification for worker
      IF worker_user_id IS NOT NULL THEN
        PERFORM create_notification(
          worker_user_id,
          notification_title,
          notification_message,
          notification_type,
          '/finances',
          jsonb_build_object('payment_id', NEW.id, 'gig_id', NEW.gig_id)
        );
      END IF;
      
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql SECURITY DEFINER;
  END IF;
END
$$;

-- Check if notify_on_gig_creation function exists before creating it
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc 
    WHERE proname = 'notify_on_gig_creation'
    AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
  ) THEN
    CREATE OR REPLACE FUNCTION notify_on_gig_creation()
    RETURNS TRIGGER AS $$
    DECLARE
      company_name TEXT;
      worker_record RECORD;
      worker_user_id UUID;
    BEGIN
      -- Get company name
      SELECT p.full_name INTO company_name
      FROM profiles p
      WHERE p.id = NEW.created_by;
      
      -- Notify workers with matching skills
      FOR worker_record IN (
        SELECT DISTINCT p.id, p.user_id
        FROM profiles p
        JOIN worker_skills ws ON ws.worker_id = p.id
        JOIN skills s ON s.id = ws.skill_id
        WHERE 
          p.role = 'worker' AND 
          p.is_available = true AND
          (NEW.skills_required IS NULL OR s.name = ANY(NEW.skills_required))
      ) LOOP
        worker_user_id := worker_record.user_id;
        
        -- Create notification for worker
        PERFORM create_notification(
          worker_user_id,
          'New Gig Opportunity',
          company_name || ' posted a new gig: "' || NEW.title || '" that matches your skills.',
          'info',
          '/gigs/' || NEW.id,
          jsonb_build_object('gig_id', NEW.id)
        );
      END LOOP;
      
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql SECURITY DEFINER;
  END IF;
END
$$;

-- Check if after_application_status_change trigger exists before creating it
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger 
    WHERE tgname = 'after_application_status_change'
    AND tgrelid = 'gig_applications'::regclass
  ) THEN
    CREATE OR REPLACE TRIGGER after_application_status_change
    AFTER UPDATE OF status ON gig_applications
    FOR EACH ROW
    WHEN (OLD.status IS DISTINCT FROM NEW.status)
    EXECUTE FUNCTION notify_on_application_status_change();
  END IF;
END
$$;

-- Check if after_payment_status_change trigger exists before creating it
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger 
    WHERE tgname = 'after_payment_status_change'
    AND tgrelid = 'payments'::regclass
  ) THEN
    CREATE OR REPLACE TRIGGER after_payment_status_change
    AFTER UPDATE OF status ON payments
    FOR EACH ROW
    WHEN (OLD.status IS DISTINCT FROM NEW.status)
    EXECUTE FUNCTION notify_on_payment_status_change();
  END IF;
END
$$;

-- Check if after_gig_insert trigger exists before creating it
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger 
    WHERE tgname = 'after_gig_publish'
    AND tgrelid = 'gigs'::regclass
  ) THEN
    CREATE OR REPLACE TRIGGER after_gig_publish
    AFTER UPDATE OF status ON gigs
    FOR EACH ROW
    WHEN (OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'published')
    EXECUTE FUNCTION notify_on_gig_creation();
  END IF;
END
$$;