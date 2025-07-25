/*
  # Fix Trigger Conflict Error

  This migration resolves the error:
  ERROR: 42710: trigger "after_application_status_change" for relation "gig_applications" already exists

  ## Root Cause Analysis
  The error occurs when attempting to create a trigger that already exists in the database.
  This typically happens during:
  - Repeated migration runs
  - Manual trigger creation followed by migration
  - Database restoration with existing triggers
  - Development environment inconsistencies

  ## Solution Steps
  1. Check if trigger exists
  2. Drop existing trigger if present
  3. Recreate trigger with proper logic
  4. Verify trigger creation

  ## Safety Considerations
  - Uses IF EXISTS to prevent errors if trigger doesn't exist
  - Recreates trigger to ensure it has the latest logic
  - Maintains data integrity during the process
*/

-- Step 1: Check current trigger status (for logging/debugging)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 
    FROM information_schema.triggers 
    WHERE trigger_name = 'after_application_status_change' 
    AND event_object_table = 'gig_applications'
  ) THEN
    RAISE NOTICE 'Trigger "after_application_status_change" exists and will be recreated';
  ELSE
    RAISE NOTICE 'Trigger "after_application_status_change" does not exist and will be created';
  END IF;
END $$;

-- Step 2: Drop the existing trigger if it exists
DROP TRIGGER IF EXISTS after_application_status_change ON gig_applications;

-- Step 3: Ensure the trigger function exists (create if missing)
CREATE OR REPLACE FUNCTION notify_on_application_status_change()
RETURNS TRIGGER AS $$
BEGIN
  -- Only proceed if status actually changed
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    -- Insert notification for the worker
    INSERT INTO notifications (
      user_id,
      title,
      message,
      type,
      metadata
    )
    SELECT 
      p.user_id,
      CASE 
        WHEN NEW.status = 'accepted' THEN 'Application Accepted! 🎉'
        WHEN NEW.status = 'rejected' THEN 'Application Update'
        ELSE 'Application Status Changed'
      END,
      CASE 
        WHEN NEW.status = 'accepted' THEN 'Congratulations! Your application for "' || g.title || '" has been accepted.'
        WHEN NEW.status = 'rejected' THEN 'Your application for "' || g.title || '" was not selected this time.'
        ELSE 'Your application status for "' || g.title || '" has been updated to ' || NEW.status || '.'
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

    -- Insert notification for the company (gig creator)
    INSERT INTO notifications (
      user_id,
      title,
      message,
      type,
      metadata
    )
    SELECT 
      p.user_id,
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

-- Step 4: Create the trigger
CREATE TRIGGER after_application_status_change
  AFTER UPDATE OF status ON gig_applications
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION notify_on_application_status_change();

-- Step 5: Verify trigger creation
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 
    FROM information_schema.triggers 
    WHERE trigger_name = 'after_application_status_change' 
    AND event_object_table = 'gig_applications'
  ) THEN
    RAISE NOTICE 'SUCCESS: Trigger "after_application_status_change" has been created successfully';
  ELSE
    RAISE NOTICE 'ERROR: Failed to create trigger "after_application_status_change"';
  END IF;
END $$;

-- Step 6: Grant necessary permissions
GRANT EXECUTE ON FUNCTION notify_on_application_status_change() TO authenticated;
GRANT EXECUTE ON FUNCTION notify_on_application_status_change() TO service_role;