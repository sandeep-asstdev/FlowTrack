-- Reversible Rollback for 20261116_role_mapping_security

DROP INDEX IF EXISTS "memberships_workspace_id_role_idx";
DROP INDEX IF EXISTS "memberships_role_idx";
