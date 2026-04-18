CREATE TABLE IF NOT EXISTS "user_credits" (
  "user_id" text PRIMARY KEY,
  "credits" integer NOT NULL DEFAULT 0,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
