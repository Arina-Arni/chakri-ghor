-- Account deletion fix. application_events.actor_id → profiles is ON DELETE SET NULL, and Postgres
-- carries that out as an UPDATE, which the append-only trigger refused. So any user who had ever
-- moved a tracker card could not delete their account ("Database error deleting user").
-- Allow exactly that erasure (actor_id set to NULL, every other column unchanged); every other
-- UPDATE is still refused.
CREATE OR REPLACE FUNCTION public.forbid_change_except_actor_erasure()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.actor_id IS NOT NULL
     AND NEW.actor_id IS NULL
     AND (to_jsonb(NEW) - 'actor_id') = (to_jsonb(OLD) - 'actor_id') THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME USING ERRCODE = 'insufficient_privilege';
END;
$$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS application_events_append_only ON "application_events";
--> statement-breakpoint
CREATE TRIGGER application_events_append_only
  BEFORE UPDATE ON "application_events"
  FOR EACH ROW EXECUTE FUNCTION public.forbid_change_except_actor_erasure();
