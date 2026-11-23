CREATE TYPE "public"."application_status" AS ENUM('saved', 'preparing', 'applied', 'admit_card', 'exam_scheduled', 'written_passed', 'viva', 'selected', 'rejected', 'withdrawn');--> statement-breakpoint
CREATE TYPE "public"."apply_platform" AS ENUM('teletalk', 'official_site', 'email', 'postal');--> statement-breakpoint
CREATE TYPE "public"."circular_source" AS ENUM('manual', 'pipeline', 'employer');--> statement-breakpoint
CREATE TYPE "public"."circular_status" AS ENUM('draft', 'pending_review', 'published', 'closed', 'rejected', 'cancelled', 'archived');--> statement-breakpoint
CREATE TYPE "public"."cv_job_status" AS ENUM('processing', 'succeeded', 'fallback', 'failed');--> statement-breakpoint
CREATE TYPE "public"."education_level" AS ENUM('class_8', 'ssc', 'hsc', 'diploma', 'bachelor', 'masters', 'phd');--> statement-breakpoint
CREATE TYPE "public"."gender" AS ENUM('male', 'female', 'third_gender');--> statement-breakpoint
CREATE TYPE "public"."gender_rule" AS ENUM('any', 'male', 'female');--> statement-breakpoint
CREATE TYPE "public"."idempotency_status" AS ENUM('in_progress', 'completed');--> statement-breakpoint
CREATE TYPE "public"."job_type" AS ENUM('full_time', 'part_time', 'contract', 'internship');--> statement-breakpoint
CREATE TYPE "public"."notification_type" AS ENUM('deadline', 'new_match', 'exam', 'application', 'system');--> statement-breakpoint
CREATE TYPE "public"."organization_type" AS ENUM('ministry', 'directorate', 'district_office', 'corporation', 'bank', 'autonomous', 'company', 'ngo');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('seeker', 'moderator', 'admin', 'employer');--> statement-breakpoint
CREATE TYPE "public"."search_mode" AS ENUM('normal', 'ai', 'ai_fallback');--> statement-breakpoint
CREATE TYPE "public"."sector" AS ENUM('government', 'semi_government', 'autonomous', 'private', 'ngo', 'international');--> statement-breakpoint
CREATE TYPE "public"."subscription_status" AS ENUM('none', 'trialing', 'active', 'grace', 'expired');--> statement-breakpoint
CREATE TYPE "public"."tag_source" AS ENUM('ai', 'manual', 'rule');--> statement-breakpoint
CREATE TYPE "public"."user_status" AS ENUM('active', 'suspended');--> statement-breakpoint
CREATE TYPE "public"."work_mode" AS ENUM('onsite', 'remote', 'hybrid');--> statement-breakpoint
CREATE TABLE "app_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "application_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"from_status" "application_status",
	"to_status" "application_status" NOT NULL,
	"actor_id" uuid,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"circular_post_id" uuid NOT NULL,
	"status" "application_status" DEFAULT 'saved' NOT NULL,
	"applicant_ref" text,
	"fee_paid" boolean DEFAULT false NOT NULL,
	"applied_at" timestamp with time zone,
	"exam_at" timestamp with time zone,
	"exam_venue" text,
	"notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "applications_user_post_unique" UNIQUE("user_id","circular_post_id")
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" uuid,
	"actor_role" text NOT NULL,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"ip_hash" text,
	"user_agent" text,
	"request_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bookmarks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"circular_post_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bookmarks_user_post_unique" UNIQUE("user_id","circular_post_id")
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name_bn" text NOT NULL,
	"name_en" text NOT NULL,
	"icon" text DEFAULT 'briefcase' NOT NULL,
	CONSTRAINT "categories_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "circular_counter_dedupe" (
	"circular_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"visitor_hash" text NOT NULL,
	"day" date NOT NULL,
	CONSTRAINT "circular_counter_dedupe_circular_id_kind_visitor_hash_day_pk" PRIMARY KEY("circular_id","kind","visitor_hash","day")
);
--> statement-breakpoint
CREATE TABLE "circular_posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"circular_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"title_bn" text NOT NULL,
	"title_en" text DEFAULT '' NOT NULL,
	"vacancies" integer NOT NULL,
	"grade" text,
	"salary_min" integer,
	"salary_max" integer,
	"salary_text" text,
	"min_education_level" "education_level" NOT NULL,
	"required_subjects" text[] DEFAULT '{}'::text[] NOT NULL,
	"experience_years_min" integer DEFAULT 0 NOT NULL,
	"age_min" integer,
	"age_max" integer,
	"age_relaxations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"eligible_district_ids" text[] DEFAULT '{}'::text[] NOT NULL,
	"eligible_division_ids" text[] DEFAULT '{}'::text[] NOT NULL,
	"gender_restriction" "gender_rule" DEFAULT 'any' NOT NULL,
	"other_requirements" text[] DEFAULT '{}'::text[] NOT NULL,
	"keywords_en" text[] DEFAULT '{}'::text[] NOT NULL,
	"keywords_preferred" text[] DEFAULT '{}'::text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "circular_posts_vacancies_positive" CHECK ("circular_posts"."vacancies" > 0),
	CONSTRAINT "circular_posts_age_range" CHECK ("circular_posts"."age_min" is null or "circular_posts"."age_max" is null or "circular_posts"."age_min" <= "circular_posts"."age_max"),
	CONSTRAINT "circular_posts_salary_range" CHECK ("circular_posts"."salary_min" is null or "circular_posts"."salary_max" is null or "circular_posts"."salary_min" <= "circular_posts"."salary_max")
);
--> statement-breakpoint
CREATE TABLE "circular_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"circular_id" uuid NOT NULL,
	"user_id" uuid,
	"message" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "circular_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"circular_id" uuid NOT NULL,
	"snapshot" jsonb NOT NULL,
	"changed_fields" text[] NOT NULL,
	"critical" boolean DEFAULT false NOT NULL,
	"changed_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "circular_tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"circular_id" uuid NOT NULL,
	"tag_id" text NOT NULL,
	"source" "tag_source" DEFAULT 'manual' NOT NULL,
	"confidence" double precision,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "circular_tags_circularId_tagId_unique" UNIQUE("circular_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "circulars" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"notice_no" text,
	"title_bn" text NOT NULL,
	"title_en" text DEFAULT '' NOT NULL,
	"slug" text NOT NULL,
	"description_bn" text DEFAULT '' NOT NULL,
	"how_to_apply_bn" text[] DEFAULT '{}'::text[] NOT NULL,
	"sector" "sector" NOT NULL,
	"job_type" "job_type" DEFAULT 'full_time' NOT NULL,
	"work_mode" "work_mode" DEFAULT 'onsite' NOT NULL,
	"category_id" text NOT NULL,
	"division_id" text,
	"district_id" text,
	"published_on" date,
	"application_start_at" timestamp with time zone NOT NULL,
	"application_end_at" timestamp with time zone NOT NULL,
	"original_end_at" timestamp with time zone,
	"age_reference_date" date,
	"apply_url" text NOT NULL,
	"apply_platform" "apply_platform" NOT NULL,
	"application_fee" integer,
	"fee_text" text,
	"source_url" text,
	"pdf_path" text,
	"pdf_sha256" text,
	"status" "circular_status" DEFAULT 'draft' NOT NULL,
	"review_note" text,
	"submitted_by" uuid,
	"reviewed_by" uuid,
	"published_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"parent_circular_id" uuid,
	"revision" integer DEFAULT 0 NOT NULL,
	"content_hash" text,
	"confidence" double precision,
	"source" "circular_source" DEFAULT 'manual' NOT NULL,
	"ai_tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"views" integer DEFAULT 0 NOT NULL,
	"apply_clicks" integer DEFAULT 0 NOT NULL,
	"total_vacancies" integer DEFAULT 0 NOT NULL,
	"max_salary" integer,
	"min_salary" integer,
	"search_text" text DEFAULT '' NOT NULL,
	"is_sample" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "circulars_end_after_start" CHECK ("circulars"."application_end_at" > "circulars"."application_start_at")
);
--> statement-breakpoint
CREATE TABLE "cv_parse_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"file_sha256" text NOT NULL,
	"mime" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"status" "cv_job_status" DEFAULT 'processing' NOT NULL,
	"result" jsonb,
	"error_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "districts" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"division_id" text NOT NULL,
	"name_bn" text NOT NULL,
	"name_en" text NOT NULL,
	"aliases" text[] DEFAULT '{}'::text[] NOT NULL,
	CONSTRAINT "districts_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "divisions" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name_bn" text NOT NULL,
	"name_en" text NOT NULL,
	"aliases" text[] DEFAULT '{}'::text[] NOT NULL,
	CONSTRAINT "divisions_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "educations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"level" "education_level" NOT NULL,
	"degree_name" text NOT NULL,
	"subject" text DEFAULT '' NOT NULL,
	"institution" text NOT NULL,
	"board_or_university" text,
	"result_text" text DEFAULT '' NOT NULL,
	"gpa" double precision,
	"passing_year" integer NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "experiences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"organization" text NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date,
	"is_current" boolean DEFAULT false NOT NULL,
	"bullets" text[] DEFAULT '{}'::text[] NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "idempotency_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"user_id" uuid NOT NULL,
	"action" text NOT NULL,
	"request_hash" text NOT NULL,
	"response" jsonb,
	"status" "idempotency_status" DEFAULT 'in_progress' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "idempotency_user_key_unique" UNIQUE("user_id","key")
);
--> statement-breakpoint
CREATE TABLE "notification_preferences" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"email_enabled" boolean DEFAULT true NOT NULL,
	"deadline_reminders" boolean DEFAULT true NOT NULL,
	"new_matches" boolean DEFAULT true NOT NULL,
	"exam_reminders" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" "notification_type" NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"link" text,
	"read_at" timestamp with time zone,
	"dedupe_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name_bn" text NOT NULL,
	"name_en" text NOT NULL,
	"short_name" text NOT NULL,
	"slug" text NOT NULL,
	"type" "organization_type" NOT NULL,
	"website" text,
	"verified" boolean DEFAULT false NOT NULL,
	"verified_by" uuid,
	"verified_at" timestamp with time zone,
	"created_by" uuid,
	"is_sample" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "preferences" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"category_ids" text[] DEFAULT '{}'::text[] NOT NULL,
	"district_ids" text[] DEFAULT '{}'::text[] NOT NULL,
	"sectors" text[] DEFAULT '{}'::text[] NOT NULL,
	"job_types" text[] DEFAULT '{}'::text[] NOT NULL,
	"work_modes" text[] DEFAULT '{}'::text[] NOT NULL,
	"min_salary" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"role" "role" DEFAULT 'seeker' NOT NULL,
	"status" "user_status" DEFAULT 'active' NOT NULL,
	"full_name" text DEFAULT '' NOT NULL,
	"phone" text,
	"date_of_birth" date,
	"gender" "gender",
	"home_district_id" text,
	"current_district_id" text,
	"special_categories" text[] DEFAULT '{}'::text[] NOT NULL,
	"headline" text DEFAULT '' NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"links" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"ai_filled_fields" text[] DEFAULT '{}'::text[] NOT NULL,
	"onboarding_step" integer DEFAULT 1 NOT NULL,
	"onboarding_completed_at" timestamp with time zone,
	"ai_consent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "profiles_onboarding_step" CHECK ("profiles"."onboarding_step" between 1 and 4)
);
--> statement-breakpoint
CREATE TABLE "rate_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "resume_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"resume_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"label_bn" text DEFAULT '' NOT NULL,
	"content" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "resumes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"circular_post_id" uuid,
	"title" text NOT NULL,
	"content" jsonb NOT NULL,
	"ats_score" integer DEFAULT 0 NOT NULL,
	"matched_keywords" text[] DEFAULT '{}'::text[] NOT NULL,
	"missing_keywords" text[] DEFAULT '{}'::text[] NOT NULL,
	"ai_changes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"ai_summary_bn" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "saved_searches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"filters" jsonb NOT NULL,
	"alert_enabled" boolean DEFAULT true NOT NULL,
	"last_notified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "search_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"normalized_query" text NOT NULL,
	"parsed_filters" jsonb NOT NULL,
	"mode" "search_mode" NOT NULL,
	"result_count" integer NOT NULL,
	"user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"plan_id" text DEFAULT 'free' NOT NULL,
	"status" "subscription_status" DEFAULT 'none' NOT NULL,
	"trial_ends_at" timestamp with time zone,
	"current_period_end" timestamp with time zone,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"trial_used" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tags" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"label_bn" text NOT NULL,
	"label_en" text DEFAULT '' NOT NULL,
	CONSTRAINT "tags_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "user_skills" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"skill" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_skills_userId_skill_unique" UNIQUE("user_id","skill")
);
--> statement-breakpoint
ALTER TABLE "app_settings" ADD CONSTRAINT "app_settings_updated_by_profiles_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."profiles"("user_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_events" ADD CONSTRAINT "application_events_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_events" ADD CONSTRAINT "application_events_actor_id_profiles_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."profiles"("user_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_user_id_profiles_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_circular_post_id_circular_posts_id_fk" FOREIGN KEY ("circular_post_id") REFERENCES "public"."circular_posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookmarks" ADD CONSTRAINT "bookmarks_user_id_profiles_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookmarks" ADD CONSTRAINT "bookmarks_circular_post_id_circular_posts_id_fk" FOREIGN KEY ("circular_post_id") REFERENCES "public"."circular_posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "circular_counter_dedupe" ADD CONSTRAINT "circular_counter_dedupe_circular_id_circulars_id_fk" FOREIGN KEY ("circular_id") REFERENCES "public"."circulars"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "circular_posts" ADD CONSTRAINT "circular_posts_circular_id_circulars_id_fk" FOREIGN KEY ("circular_id") REFERENCES "public"."circulars"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "circular_reports" ADD CONSTRAINT "circular_reports_circular_id_circulars_id_fk" FOREIGN KEY ("circular_id") REFERENCES "public"."circulars"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "circular_reports" ADD CONSTRAINT "circular_reports_user_id_profiles_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("user_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "circular_revisions" ADD CONSTRAINT "circular_revisions_circular_id_circulars_id_fk" FOREIGN KEY ("circular_id") REFERENCES "public"."circulars"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "circular_revisions" ADD CONSTRAINT "circular_revisions_changed_by_profiles_user_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."profiles"("user_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "circular_tags" ADD CONSTRAINT "circular_tags_circular_id_circulars_id_fk" FOREIGN KEY ("circular_id") REFERENCES "public"."circulars"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "circular_tags" ADD CONSTRAINT "circular_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "circulars" ADD CONSTRAINT "circulars_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "circulars" ADD CONSTRAINT "circulars_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "circulars" ADD CONSTRAINT "circulars_division_id_divisions_id_fk" FOREIGN KEY ("division_id") REFERENCES "public"."divisions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "circulars" ADD CONSTRAINT "circulars_district_id_districts_id_fk" FOREIGN KEY ("district_id") REFERENCES "public"."districts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "circulars" ADD CONSTRAINT "circulars_submitted_by_profiles_user_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."profiles"("user_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "circulars" ADD CONSTRAINT "circulars_reviewed_by_profiles_user_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."profiles"("user_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cv_parse_jobs" ADD CONSTRAINT "cv_parse_jobs_user_id_profiles_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "districts" ADD CONSTRAINT "districts_division_id_divisions_id_fk" FOREIGN KEY ("division_id") REFERENCES "public"."divisions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "educations" ADD CONSTRAINT "educations_user_id_profiles_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "experiences" ADD CONSTRAINT "experiences_user_id_profiles_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_profiles_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_profiles_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_verified_by_profiles_user_id_fk" FOREIGN KEY ("verified_by") REFERENCES "public"."profiles"("user_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_created_by_profiles_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("user_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preferences" ADD CONSTRAINT "preferences_user_id_profiles_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_home_district_id_districts_id_fk" FOREIGN KEY ("home_district_id") REFERENCES "public"."districts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_current_district_id_districts_id_fk" FOREIGN KEY ("current_district_id") REFERENCES "public"."districts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resume_versions" ADD CONSTRAINT "resume_versions_resume_id_resumes_id_fk" FOREIGN KEY ("resume_id") REFERENCES "public"."resumes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resumes" ADD CONSTRAINT "resumes_user_id_profiles_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resumes" ADD CONSTRAINT "resumes_circular_post_id_circular_posts_id_fk" FOREIGN KEY ("circular_post_id") REFERENCES "public"."circular_posts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_searches" ADD CONSTRAINT "saved_searches_user_id_profiles_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "search_logs" ADD CONSTRAINT "search_logs_user_id_profiles_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("user_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_profiles_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_skills" ADD CONSTRAINT "user_skills_user_id_profiles_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "application_events_application_id_created_at_index" ON "application_events" USING btree ("application_id","created_at");--> statement-breakpoint
CREATE INDEX "applications_user_status_idx" ON "applications" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "audit_logs_created_at_index" ON "audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "audit_logs_entity_type_entity_id_index" ON "audit_logs" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "bookmarks_circular_post_id_index" ON "bookmarks" USING btree ("circular_post_id");--> statement-breakpoint
CREATE INDEX "circular_posts_circular_idx" ON "circular_posts" USING btree ("circular_id");--> statement-breakpoint
CREATE INDEX "circular_revisions_circular_id_created_at_index" ON "circular_revisions" USING btree ("circular_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "circulars_slug_unique" ON "circulars" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "circulars_org_notice_unique" ON "circulars" USING btree ("organization_id","notice_no") WHERE "circulars"."notice_no" is not null and "circulars"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "circulars_pdf_sha_unique" ON "circulars" USING btree ("pdf_sha256") WHERE "circulars"."pdf_sha256" is not null;--> statement-breakpoint
CREATE INDEX "circulars_status_end_idx" ON "circulars" USING btree ("status","application_end_at");--> statement-breakpoint
CREATE INDEX "circulars_org_idx" ON "circulars" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "circulars_category_idx" ON "circulars" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "cv_parse_jobs_user_id_file_sha256_created_at_index" ON "cv_parse_jobs" USING btree ("user_id","file_sha256","created_at");--> statement-breakpoint
CREATE INDEX "districts_division_id_index" ON "districts" USING btree ("division_id");--> statement-breakpoint
CREATE INDEX "educations_user_id_index" ON "educations" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "experiences_user_id_index" ON "experiences" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idempotency_keys_created_at_index" ON "idempotency_keys" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_dedupe_unique" ON "notifications" USING btree ("dedupe_key");--> statement-breakpoint
CREATE INDEX "notifications_user_read_idx" ON "notifications" USING btree ("user_id","read_at");--> statement-breakpoint
CREATE UNIQUE INDEX "organizations_slug_unique" ON "organizations" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "profiles_role_index" ON "profiles" USING btree ("role");--> statement-breakpoint
CREATE INDEX "resume_versions_resume_id_created_at_index" ON "resume_versions" USING btree ("resume_id","created_at");--> statement-breakpoint
CREATE INDEX "resumes_user_id_index" ON "resumes" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "resumes_one_base_per_user" ON "resumes" USING btree ("user_id") WHERE "resumes"."circular_post_id" is null;--> statement-breakpoint
CREATE INDEX "saved_searches_user_id_index" ON "saved_searches" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "search_logs_created_at_index" ON "search_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "search_logs_normalized_query_index" ON "search_logs" USING btree ("normalized_query");