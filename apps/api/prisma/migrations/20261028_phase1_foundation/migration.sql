-- Phase 1 Foundation: Organization, Scoped Roles, Confidentiality, Projects & Unlimited-Depth Tasks Migration
-- Safe & Reversible Migration

-- 1. Create Enums
DO $$ BEGIN
    CREATE TYPE "ConfidentialityLevel" AS ENUM ('PUBLIC_INTERNAL', 'INTERNAL', 'RESTRICTED', 'CONFIDENTIAL', 'HIGHLY_CONFIDENTIAL');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE "RoleScopeType" AS ENUM ('ORGANIZATION', 'DEPARTMENT', 'TEAM', 'PROJECT', 'TASK');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. Alter Users
ALTER TABLE "users" 
    ADD COLUMN IF NOT EXISTS "job_title" TEXT,
    ADD COLUMN IF NOT EXISTS "department_id" TEXT,
    ADD COLUMN IF NOT EXISTS "backup_reviewer_id" TEXT;

-- 3. Alter Projects
ALTER TABLE "projects"
    ADD COLUMN IF NOT EXISTS "project_key" TEXT,
    ADD COLUMN IF NOT EXISTS "objectives" TEXT,
    ADD COLUMN IF NOT EXISTS "scope" TEXT,
    ADD COLUMN IF NOT EXISTS "deliverables" TEXT,
    ADD COLUMN IF NOT EXISTS "owner_id" TEXT,
    ADD COLUMN IF NOT EXISTS "responsible_manager_id" TEXT,
    ADD COLUMN IF NOT EXISTS "department_id" TEXT,
    ADD COLUMN IF NOT EXISTS "classification" "ConfidentialityLevel" NOT NULL DEFAULT 'INTERNAL',
    ADD COLUMN IF NOT EXISTS "access_policy" JSONB DEFAULT '{}';

-- 4. Alter Nodes
ALTER TABLE "nodes"
    ADD COLUMN IF NOT EXISTS "path" TEXT,
    ADD COLUMN IF NOT EXISTS "depth" INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS "is_required" BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS "classification" "ConfidentialityLevel" NOT NULL DEFAULT 'INTERNAL',
    ADD COLUMN IF NOT EXISTS "responsible_lead_id" TEXT,
    ADD COLUMN IF NOT EXISTS "acceptance_criteria" TEXT,
    ADD COLUMN IF NOT EXISTS "definition_of_done" TEXT,
    ADD COLUMN IF NOT EXISTS "collaborator_ids" JSONB DEFAULT '[]',
    ADD COLUMN IF NOT EXISTS "watcher_ids" JSONB DEFAULT '[]',
    ADD COLUMN IF NOT EXISTS "backup_reviewer_id" TEXT;

-- 5. Create Departments
CREATE TABLE IF NOT EXISTS "departments" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "parent_department_id" TEXT,
    "manager_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "departments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "departments_workspace_id_name_key" UNIQUE ("workspace_id", "name"),
    CONSTRAINT "departments_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE,
    CONSTRAINT "departments_parent_department_id_fkey" FOREIGN KEY ("parent_department_id") REFERENCES "departments"("id") ON DELETE SET NULL,
    CONSTRAINT "departments_manager_id_fkey" FOREIGN KEY ("manager_id") REFERENCES "users"("id") ON DELETE SET NULL
);

-- 6. Create Positions
CREATE TABLE IF NOT EXISTS "positions" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "department_id" TEXT,
    "title" TEXT NOT NULL,
    "reports_to_position_id" TEXT,
    "user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "positions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "positions_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE,
    CONSTRAINT "positions_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE SET NULL,
    CONSTRAINT "positions_reports_to_position_id_fkey" FOREIGN KEY ("reports_to_position_id") REFERENCES "positions"("id") ON DELETE SET NULL,
    CONSTRAINT "positions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL
);

-- 7. Create Scoped Role Assignments
CREATE TABLE IF NOT EXISTS "scoped_role_assignments" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "scope" "RoleScopeType" NOT NULL DEFAULT 'ORGANIZATION',
    "resource_id" TEXT,
    "granted_by_id" TEXT,
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scoped_role_assignments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "scoped_role_assignments_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE,
    CONSTRAINT "scoped_role_assignments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
    CONSTRAINT "scoped_role_assignments_granted_by_id_fkey" FOREIGN KEY ("granted_by_id") REFERENCES "users"("id") ON DELETE SET NULL
);

-- 8. Create Access Grants
CREATE TABLE IF NOT EXISTS "access_grants" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "resource_type" TEXT NOT NULL,
    "resource_id" TEXT NOT NULL,
    "access_level" TEXT NOT NULL DEFAULT 'view',
    "valid_until" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "granted_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "access_grants_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "access_grants_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE,
    CONSTRAINT "access_grants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
    CONSTRAINT "access_grants_granted_by_id_fkey" FOREIGN KEY ("granted_by_id") REFERENCES "users"("id") ON DELETE SET NULL
);

-- 9. Add Foreign Keys for Altered Columns
DO $$ BEGIN
    ALTER TABLE "users" ADD CONSTRAINT "users_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "users" ADD CONSTRAINT "users_backup_reviewer_id_fkey" FOREIGN KEY ("backup_reviewer_id") REFERENCES "users"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "projects" ADD CONSTRAINT "projects_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "projects" ADD CONSTRAINT "projects_responsible_manager_id_fkey" FOREIGN KEY ("responsible_manager_id") REFERENCES "users"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "projects" ADD CONSTRAINT "projects_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "nodes" ADD CONSTRAINT "nodes_responsible_lead_id_fkey" FOREIGN KEY ("responsible_lead_id") REFERENCES "users"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "nodes" ADD CONSTRAINT "nodes_backup_reviewer_id_fkey" FOREIGN KEY ("backup_reviewer_id") REFERENCES "users"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- 10. Performance & Materialized Path Indexes
CREATE INDEX IF NOT EXISTS "users_department_id_idx" ON "users"("department_id");
CREATE INDEX IF NOT EXISTS "projects_workspace_id_project_key_idx" ON "projects"("workspace_id", "project_key");
CREATE INDEX IF NOT EXISTS "projects_workspace_id_classification_idx" ON "projects"("workspace_id", "classification");
CREATE INDEX IF NOT EXISTS "nodes_project_id_path_idx" ON "nodes"("project_id", "path");
CREATE INDEX IF NOT EXISTS "nodes_workspace_id_classification_idx" ON "nodes"("workspace_id", "classification");
CREATE INDEX IF NOT EXISTS "positions_workspace_id_department_id_idx" ON "positions"("workspace_id", "department_id");
CREATE INDEX IF NOT EXISTS "scoped_role_assignments_lookup_idx" ON "scoped_role_assignments"("workspace_id", "user_id", "scope", "resource_id");
CREATE INDEX IF NOT EXISTS "access_grants_lookup_idx" ON "access_grants"("workspace_id", "user_id", "resource_type", "resource_id");
