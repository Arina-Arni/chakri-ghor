-- Part 3: RLS on the new tables, append-only workflow events, and the pg_cron schedule helper.

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'ai_calls','ai_cache','circuit_breakers','fault_injections','workflow_runs','workflow_steps',
    'workflow_events','email_outbox','plans','payments','usage_counters','feature_flags'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
  END LOOP;
END $$;
--> statement-breakpoint
CREATE TRIGGER workflow_events_append_only
  BEFORE UPDATE OR DELETE ON "workflow_events"
  FOR EACH ROW EXECUTE FUNCTION public.forbid_change();
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "organizations_name_bn_trgm" ON "organizations" USING gin ("name_bn" gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "organizations_name_en_trgm" ON "organizations" USING gin ("name_en" gin_trgm_ops);
--> statement-breakpoint

-- Schedules the worker (every minute) and scheduler (every 15 minutes) with pg_cron + pg_net.
-- The deployed URL and CRON_SECRET are not known at migration time, so `npm run db:cron` calls
-- this function with them. It is a no-op where pg_cron/pg_net are not installed (local tests).
CREATE OR REPLACE FUNCTION public.schedule_chakri_cron(app_url text, cron_secret text)
RETURNS text
LANGUAGE plpgsql
AS $fn$
DECLARE
  has_cron boolean;
  has_net boolean;
BEGIN
  SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') INTO has_cron;
  SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') INTO has_net;
  IF NOT has_cron OR NOT has_net THEN
    RETURN 'pg_cron/pg_net not installed: enable them in Supabase (Database → Extensions) and run again';
  END IF;
  EXECUTE format(
    'SELECT cron.schedule(%L, %L, %L)',
    'chakri-worker', '* * * * *',
    format('select net.http_post(url := %L, headers := jsonb_build_object(''authorization'', %L), timeout_milliseconds := 55000)',
      rtrim(app_url, '/') || '/api/cron/worker', 'Bearer ' || cron_secret)
  );
  EXECUTE format(
    'SELECT cron.schedule(%L, %L, %L)',
    'chakri-scheduler', '*/15 * * * *',
    format('select net.http_post(url := %L, headers := jsonb_build_object(''authorization'', %L), timeout_milliseconds := 55000)',
      rtrim(app_url, '/') || '/api/cron/scheduler', 'Bearer ' || cron_secret)
  );
  RETURN 'scheduled chakri-worker and chakri-scheduler';
END;
$fn$;
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION public.schedule_chakri_cron(text, text) FROM PUBLIC;
