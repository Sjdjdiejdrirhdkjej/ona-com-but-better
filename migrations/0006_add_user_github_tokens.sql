CREATE TABLE IF NOT EXISTS "user_github_tokens" (
  "user_id" text PRIMARY KEY,
  "github_token" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
