-- Supabase-specific setup that Drizzle cannot express: extensions, the auth.users link,
-- trigram indexes, append-only triggers and Row Level Security.
-- Statements are separated by Drizzle's breakpoint marker.

CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS pgcrypto;
--> statement-breakpoint

-- ── profiles ↔ auth.users ──
ALTER TABLE "profiles"
  ADD CONSTRAINT "profiles_user_id_auth_users_fk"
  FOREIGN KEY ("user_id") REFERENCES auth.users ("id") ON DELETE CASCADE;
--> statement-breakpoint

-- Create the profile (and default settings) on first sign-up. Role is always the default
-- `seeker`; only an admin can change it later.
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.raw_user_meta_data ->> 'name', ''))
  ON CONFLICT (user_id) DO NOTHING;
  INSERT INTO public.notification_preferences (user_id) VALUES (NEW.id) ON CONFLICT DO NOTHING;
  INSERT INTO public.preferences (user_id) VALUES (NEW.id) ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
--> statement-breakpoint
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();
--> statement-breakpoint

-- ── search indexes ──
CREATE INDEX IF NOT EXISTS "circulars_search_text_trgm" ON "circulars" USING gin ("search_text" gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "circular_posts_title_bn_trgm" ON "circular_posts" USING gin ("title_bn" gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "circular_posts_title_en_trgm" ON "circular_posts" USING gin ("title_en" gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "circular_posts_districts_gin" ON "circular_posts" USING gin ("eligible_district_ids");
--> statement-breakpoint

-- ── append-only tables ──
CREATE OR REPLACE FUNCTION public.forbid_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME USING ERRCODE = 'insufficient_privilege';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER audit_logs_append_only
  BEFORE UPDATE OR DELETE ON "audit_logs"
  FOR EACH ROW EXECUTE FUNCTION public.forbid_change();
--> statement-breakpoint
CREATE TRIGGER application_events_append_only
  BEFORE UPDATE ON "application_events"
  FOR EACH ROW EXECUTE FUNCTION public.forbid_change();
--> statement-breakpoint

-- ── Row Level Security (defense in depth; the app uses the server connection) ──
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'divisions','districts','categories','tags','profiles','educations','experiences','user_skills',
    'preferences','notification_preferences','organizations','circulars','circular_posts','circular_tags',
    'circular_revisions','circular_reports','circular_counter_dedupe','bookmarks','saved_searches',
    'applications','application_events','resumes','resume_versions','cv_parse_jobs','notifications',
    'subscriptions','idempotency_keys','search_logs','audit_logs','rate_limits','app_settings'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
  END LOOP;
END $$;
--> statement-breakpoint

-- authenticated users may touch only their own rows in user-owned tables.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'educations','experiences','user_skills','preferences','notification_preferences','bookmarks',
    'saved_searches','applications','resumes','cv_parse_jobs','notifications','subscriptions'
  ] LOOP
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid())',
      t || '_own_rows', t
    );
  END LOOP;
END $$;
--> statement-breakpoint

-- A profile row can be read by its owner; it is never updated through the public API
-- (role/status must not be self-assigned), so there is no update policy.
CREATE POLICY "profiles_own_select" ON public.profiles
  FOR SELECT TO authenticated USING (user_id = auth.uid());
--> statement-breakpoint
CREATE POLICY "application_events_own_select" ON public.application_events
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.applications a WHERE a.id = application_id AND a.user_id = auth.uid()));
--> statement-breakpoint
CREATE POLICY "resume_versions_own_select" ON public.resume_versions
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.resumes r WHERE r.id = resume_id AND r.user_id = auth.uid()));
