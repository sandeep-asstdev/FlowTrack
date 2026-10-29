-- Rollback Script for Phase 2 Workflow Governance Migration

DROP TRIGGER IF EXISTS trg_audit_events_immutable ON "audit_events";
DROP FUNCTION IF EXISTS prevent_audit_events_modification();

DROP TABLE IF EXISTS "audit_events" CASCADE;
DROP TABLE IF EXISTS "evidence_items" CASCADE;
DROP TABLE IF EXISTS "approval_decisions" CASCADE;
DROP TABLE IF EXISTS "approval_stage_instances" CASCADE;
DROP TABLE IF EXISTS "approval_requests" CASCADE;
DROP TABLE IF EXISTS "policy_stages" CASCADE;
DROP TABLE IF EXISTS "approval_policies" CASCADE;
DROP TABLE IF EXISTS "work_updates" CASCADE;
DROP TABLE IF EXISTS "work_submissions" CASCADE;

ALTER TABLE "nodes"
    DROP COLUMN IF EXISTS "state",
    DROP COLUMN IF EXISTS "cadence",
    DROP COLUMN IF EXISTS "checklist",
    DROP COLUMN IF EXISTS "mandatory_evidence_count";

