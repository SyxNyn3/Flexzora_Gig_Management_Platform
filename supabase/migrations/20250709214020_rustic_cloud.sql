/*
  # Create Calendar Events Function

  1. New Functions
    - `create_calendar_event_from_gig` - Creates a calendar event when a gig is created or updated
    - `update_calendar_event_from_gig` - Updates a calendar event when a gig is updated
    - `delete_calendar_event_from_gig` - Deletes a calendar event when a gig is deleted
  
  2. New Triggers
    - `after_gig_insert` - Trigger to create calendar events after gig insertion
    - `after_gig_update` - Trigger to update calendar events after gig update
    - `after_gig_delete` - Trigger to delete calendar events after gig deletion
    
  3. Purpose
    - Automatically sync gigs to calendar events for better integration
    - Ensure calendar events are kept in sync with gig changes
*/

-- Function to create a calendar event from a gig
CREATE OR REPLACE FUNCTION create_calendar_event_from_gig()
RETURNS TRIGGER AS $$
DECLARE
  worker_id uuid;
BEGIN
  -- Create calendar event for the gig creator
  INSERT INTO calendar_events (
    user_id,
    title,
    description,
    event_type,
    start_time,
    end_time,
    all_day,
    color,
    metadata
  ) VALUES (
    NEW.created_by,
    NEW.title,
    NEW.description,
    'gig',
    NEW.start_date,
    NEW.end_date,
    false,
    '#3B82F6',
    jsonb_build_object(
      'gig_id', NEW.id,
      'location', NEW.location,
      'company_id', NEW.company_id,
      'status', NEW.status
    )
  );
  
  -- For accepted applications, create calendar events for workers
  FOR worker_id IN 
    SELECT worker_id FROM gig_applications 
    WHERE gig_id = NEW.id AND status = 'accepted'
  LOOP
    INSERT INTO calendar_events (
      user_id,
      title,
      description,
      event_type,
      start_time,
      end_time,
      all_day,
      color,
      metadata
    ) VALUES (
      worker_id,
      NEW.title,
      NEW.description,
      'gig',
      NEW.start_date,
      NEW.end_date,
      false,
      '#10B981',
      jsonb_build_object(
        'gig_id', NEW.id,
        'location', NEW.location,
        'company_id', NEW.company_id,
        'status', NEW.status
      )
    );
  END LOOP;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to update calendar events when a gig is updated
CREATE OR REPLACE FUNCTION update_calendar_event_from_gig()
RETURNS TRIGGER AS $$
BEGIN
  -- Update calendar events for this gig
  UPDATE calendar_events
  SET 
    title = NEW.title,
    description = NEW.description,
    start_time = NEW.start_date,
    end_time = NEW.end_date,
    metadata = jsonb_build_object(
      'gig_id', NEW.id,
      'location', NEW.location,
      'company_id', NEW.company_id,
      'status', NEW.status
    )
  WHERE 
    metadata->>'gig_id' = NEW.id::text;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to delete calendar events when a gig is deleted
CREATE OR REPLACE FUNCTION delete_calendar_event_from_gig()
RETURNS TRIGGER AS $$
BEGIN
  -- Delete all calendar events for this gig
  DELETE FROM calendar_events
  WHERE metadata->>'gig_id' = OLD.id::text;
  
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- Trigger to create calendar events after gig insertion
CREATE TRIGGER after_gig_insert
AFTER INSERT ON gigs
FOR EACH ROW
EXECUTE FUNCTION create_calendar_event_from_gig();

-- Trigger to update calendar events after gig update
CREATE TRIGGER after_gig_update
AFTER UPDATE ON gigs
FOR EACH ROW
WHEN (
  OLD.title IS DISTINCT FROM NEW.title OR
  OLD.description IS DISTINCT FROM NEW.description OR
  OLD.start_date IS DISTINCT FROM NEW.start_date OR
  OLD.end_date IS DISTINCT FROM NEW.end_date OR
  OLD.location IS DISTINCT FROM NEW.location OR
  OLD.status IS DISTINCT FROM NEW.status
)
EXECUTE FUNCTION update_calendar_event_from_gig();

-- Trigger to delete calendar events after gig deletion
CREATE TRIGGER after_gig_delete
AFTER DELETE ON gigs
FOR EACH ROW
EXECUTE FUNCTION delete_calendar_event_from_gig();

-- Function to create calendar events when applications are accepted
CREATE OR REPLACE FUNCTION create_calendar_event_from_application()
RETURNS TRIGGER AS $$
DECLARE
  gig_record RECORD;
BEGIN
  -- Only create calendar events for accepted applications
  IF NEW.status = 'accepted' THEN
    -- Get the gig details
    SELECT * INTO gig_record FROM gigs WHERE id = NEW.gig_id;
    
    -- Create a calendar event for the worker
    INSERT INTO calendar_events (
      user_id,
      title,
      description,
      event_type,
      start_time,
      end_time,
      all_day,
      color,
      metadata
    ) VALUES (
      NEW.worker_id,
      gig_record.title,
      gig_record.description,
      'gig',
      gig_record.start_date,
      gig_record.end_date,
      false,
      '#10B981',
      jsonb_build_object(
        'gig_id', gig_record.id,
        'location', gig_record.location,
        'company_id', gig_record.company_id,
        'status', gig_record.status,
        'application_id', NEW.id
      )
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to create calendar events when applications are accepted
CREATE TRIGGER after_application_update
AFTER UPDATE ON gig_applications
FOR EACH ROW
WHEN (OLD.status IS DISTINCT FROM NEW.status)
EXECUTE FUNCTION create_calendar_event_from_application();