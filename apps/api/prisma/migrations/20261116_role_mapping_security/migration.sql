-- Role Mapping & Membership Security Migration
-- Safe & Non-destructive Reversible Migration

-- 1. Ensure Role enum exists with complete set of standard roles
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'Role') THEN
        CREATE TYPE "Role" AS ENUM ('ADMIN', 'MANAGER', 'TEAM_LEAD', 'MEMBER', 'GUEST');
    END IF;
END $$;

-- 2. Ensure memberships table has default role MEMBER
ALTER TABLE "memberships"
    ALTER COLUMN "role" SET DEFAULT 'MEMBER';

-- 3. Add composite index on (workspace_id, role) and (role) for fast server-side authorization resolution
CREATE INDEX IF NOT EXISTS "memberships_workspace_id_role_idx" ON "memberships"("workspace_id", "role");
CREATE INDEX IF NOT EXISTS "memberships_role_idx" ON "memberships"("role");
