-- Safe additive migration for FlowTrack Google Authentication
-- Date: 2026-10-26
-- Chunk 1: Authentication Backend

-- 1. Add google_id column to users table if not exists
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "google_id" TEXT;

-- 2. Create unique index for google_id
CREATE UNIQUE INDEX IF NOT EXISTS "users_google_id_key" ON "users"("google_id");
