-- Rollback Script for 20261028_phase1_foundation
-- WARNING: Reversing Phase 1 Foundation tables and columns

-- 1. Drop Tables
DROP TABLE IF EXISTS "access_grants" CASCADE;
DROP TABLE IF EXISTS "scoped_role_assignments" CASCADE;
DROP TABLE IF EXISTS "positions" CASCADE;
DROP TABLE IF EXISTS "departments" CASCADE;

-- 2. Drop Added Columns on Nodes
ALTER TABLE "nodes"
    DROP COLUMN IF EXISTS "path",
    DROP COLUMN IF EXISTS "depth",
    DROP COLUMN IF EXISTS "is_required",
    DROP COLUMN IF EXISTS "classification",
    DROP COLUMN IF EXISTS "responsible_lead_id",
    DROP COLUMN IF EXISTS "acceptance_criteria",
    DROP COLUMN IF EXISTS "definition_of_done",
    DROP COLUMN IF EXISTS "collaborator_ids",
    DROP COLUMN IF EXISTS "watcher_ids",
    DROP COLUMN IF EXISTS "backup_reviewer_id";

-- 3. Drop Added Columns on Projects
ALTER TABLE "projects"
    DROP COLUMN IF EXISTS "project_key",
    DROP COLUMN IF EXISTS "objectives",
    DROP COLUMN IF EXISTS "scope",
    DROP COLUMN IF EXISTS "deliverables",
    DROP COLUMN IF EXISTS "owner_id",
    DROP COLUMN IF EXISTS "responsible_manager_id",
    DROP COLUMN IF EXISTS "department_id",
    DROP COLUMN IF EXISTS "classification",
    DROP COLUMN IF EXISTS "access_policy";

-- 4. Drop Added Columns on Users
ALTER TABLE "users"
    DROP COLUMN IF EXISTS "job_title",
    DROP COLUMN IF EXISTS "department_id",
    DROP COLUMN IF EXISTS "backup_reviewer_id";

-- 5. Drop Enums
DROP TYPE IF EXISTS "RoleScopeType";
DROP TYPE IF EXISTS "ConfidentialityLevel";
