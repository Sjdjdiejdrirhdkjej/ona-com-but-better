CREATE TABLE IF NOT EXISTS "demo_requests" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  "email" TEXT NOT NULL,
  "company" TEXT NOT NULL,
  "size" TEXT NOT NULL DEFAULT '',
  "notes" TEXT NOT NULL DEFAULT '',
  "created_at" TIMESTAMP NOT NULL DEFAULT NOW()
);
