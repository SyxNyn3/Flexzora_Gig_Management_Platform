# Supabase Trigger Conflict Resolution Guide

## Root Cause Analysis

The error `ERROR: 42710: trigger "after_application_status_change" for relation "gig_applications" already exists` occurs when:

1. **Duplicate Migration Runs**: Running the same migration multiple times
2. **Manual Trigger Creation**: Creating triggers manually before running migrations
3. **Database Restoration**: Restoring from backups that already contain the triggers
4. **Development Environment Issues**: Inconsistent state between local and remote databases
5. **Failed Migration Rollbacks**: Incomplete rollback leaving triggers in place

## Immediate Solution Commands

### Option 1: Safe Recreation (Recommended)
```sql
-- Check if trigger exists
SELECT trigger_name, event_object_table 
FROM information_schema.triggers 
WHERE trigger_name = 'after_application_status_change';

-- Drop and recreate
DROP TRIGGER IF EXISTS after_application_status_change ON gig_applications;
CREATE TRIGGER after_application_status_change
  AFTER UPDATE OF status ON gig_applications
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION notify_on_application_status_change();
```

### Option 2: Conditional Creation
```sql
-- Only create if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.triggers 
    WHERE trigger_name = 'after_application_status_change' 
    AND event_object_table = 'gig_applications'
  ) THEN
    CREATE TRIGGER after_application_status_change
      AFTER UPDATE OF status ON gig_applications
      FOR EACH ROW
      WHEN (OLD.status IS DISTINCT FROM NEW.status)
      EXECUTE FUNCTION notify_on_application_status_change();
  END IF;
END $$;
```

## Prevention Strategies

### 1. Use IF EXISTS/IF NOT EXISTS
Always use conditional statements in migrations:
```sql
DROP TRIGGER IF EXISTS trigger_name ON table_name;
CREATE OR REPLACE FUNCTION function_name() ...
```

### 2. Migration File Naming
Use descriptive, timestamped migration files:
```
20240115_fix_application_triggers.sql
20240115_recreate_notification_triggers.sql
```

### 3. Idempotent Migrations
Make migrations repeatable:
```sql
-- Check before creating
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.triggers WHERE ...) THEN
    -- Create trigger
  END IF;
END $$;
```

### 4. Environment Consistency
- Use version control for all database changes
- Test migrations in staging before production
- Document manual database changes

## Verification Steps

### 1. Check Trigger Existence
```sql
SELECT 
  trigger_name,
  event_object_table,
  action_timing,
  event_manipulation
FROM information_schema.triggers 
WHERE trigger_name = 'after_application_status_change';
```

### 2. Test Trigger Functionality
```sql
-- Create a test application status change
UPDATE gig_applications 
SET status = 'accepted' 
WHERE id = 'test-application-id' 
AND status = 'pending';

-- Check if notifications were created
SELECT * FROM notifications 
WHERE metadata->>'application_id' = 'test-application-id'
ORDER BY created_at DESC;
```

### 3. Verify Function Exists
```sql
SELECT 
  routine_name,
  routine_type,
  security_type
FROM information_schema.routines 
WHERE routine_name = 'notify_on_application_status_change';
```

## Alternative Approaches

### Approach 1: Rename Existing Trigger
If you need to preserve the old trigger temporarily:
```sql
-- Rename existing trigger
ALTER TRIGGER after_application_status_change ON gig_applications 
RENAME TO after_application_status_change_old;

-- Create new trigger
CREATE TRIGGER after_application_status_change ...

-- Drop old trigger when ready
DROP TRIGGER after_application_status_change_old ON gig_applications;
```

### Approach 2: Use Different Trigger Names
```sql
-- Use versioned trigger names
CREATE TRIGGER after_application_status_change_v2 ON gig_applications ...
```

### Approach 3: Disable/Enable Triggers
```sql
-- Temporarily disable triggers
ALTER TABLE gig_applications DISABLE TRIGGER after_application_status_change;

-- Re-enable after changes
ALTER TABLE gig_applications ENABLE TRIGGER after_application_status_change;
```

## Potential Risks and Considerations

### 1. Data Consistency
- **Risk**: Dropping triggers may cause missed notifications
- **Mitigation**: Perform during maintenance windows or low-traffic periods

### 2. Dependent Objects
- **Risk**: Other triggers or functions may depend on this trigger
- **Mitigation**: Check dependencies before dropping:
```sql
SELECT * FROM information_schema.triggered_update_columns 
WHERE trigger_name = 'after_application_status_change';
```

### 3. Permission Issues
- **Risk**: Recreated triggers may have different permissions
- **Mitigation**: Explicitly grant permissions after recreation:
```sql
GRANT EXECUTE ON FUNCTION notify_on_application_status_change() TO authenticated;
```

### 4. Timing Issues
- **Risk**: Trigger recreation during active transactions
- **Mitigation**: Use transactions and check for active connections:
```sql
BEGIN;
-- Perform trigger operations
COMMIT;
```

## Troubleshooting Common Issues

### Issue: Function Not Found
```sql
-- Check if function exists
SELECT routine_name FROM information_schema.routines 
WHERE routine_name = 'notify_on_application_status_change';

-- Recreate function if missing
CREATE OR REPLACE FUNCTION notify_on_application_status_change() ...
```

### Issue: Permission Denied
```sql
-- Grant necessary permissions
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT EXECUTE ON FUNCTION notify_on_application_status_change() TO authenticated;
```

### Issue: Trigger Not Firing
```sql
-- Check trigger definition
SELECT trigger_name, action_condition, action_statement 
FROM information_schema.triggers 
WHERE trigger_name = 'after_application_status_change';

-- Test with a simple update
UPDATE gig_applications SET status = status WHERE id = 'test-id';
```

## Best Practices Summary

1. **Always use conditional statements** (`IF EXISTS`, `IF NOT EXISTS`)
2. **Make migrations idempotent** (can be run multiple times safely)
3. **Test in staging environments** before production deployment
4. **Document all manual database changes**
5. **Use version control** for all database schema changes
6. **Monitor trigger performance** and optimize if needed
7. **Implement proper error handling** in trigger functions
8. **Regular database maintenance** to prevent conflicts