-- Phase 2 Workflow Governance: State Machine, Work Reporting, Evidence, Approval Engine & Immutable Audit Trail
-- Safe & Non-destructive Reversible Migration

-- 1. Alter Nodes table with Phase 2 governance columns
ALTER TABLE "nodes"
    ADD COLUMN IF NOT EXISTS "state" TEXT NOT NULL DEFAULT 'Draft',
    ADD COLUMN IF NOT EXISTS "cadence" TEXT DEFAULT 'immediate',
    ADD COLUMN IF NOT EXISTS "checklist" JSONB DEFAULT '[]',
    ADD COLUMN IF NOT EXISTS "mandatory_evidence_count" INTEGER NOT NULL DEFAULT 0;

-- 2. Create Work Submissions Table (Immutable & Versioned)
CREATE TABLE IF NOT EXISTS "work_submissions" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "node_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "submitter_id" TEXT NOT NULL,
    "summary" TEXT,
    "deliverables" TEXT,
    "custom_data" JSONB DEFAULT '{}',
    "metadata" JSONB DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'submitted',
    "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "work_submissions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "work_submissions_node_id_version_key" UNIQUE ("node_id", "version"),
    CONSTRAINT "work_submissions_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE,
    CONSTRAINT "work_submissions_node_id_fkey" FOREIGN KEY ("node_id") REFERENCES "nodes"("id") ON DELETE CASCADE,
    CONSTRAINT "work_submissions_submitter_id_fkey" FOREIGN KEY ("submitter_id") REFERENCES "users"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "work_submissions_workspace_id_node_id_idx" ON "work_submissions"("workspace_id", "node_id");

-- 3. Create Work Updates Table
CREATE TABLE IF NOT EXISTS "work_updates" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "node_id" TEXT NOT NULL,
    "author_id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "progress_pct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "done_since_last" TEXT,
    "next_planned" TEXT,
    "blockers" TEXT,
    "actual_start" TIMESTAMP(3),
    "actual_finish" TIMESTAMP(3),
    "notes" TEXT,
    "links" JSONB DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "work_updates_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "work_updates_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE,
    CONSTRAINT "work_updates_node_id_fkey" FOREIGN KEY ("node_id") REFERENCES "nodes"("id") ON DELETE CASCADE,
    CONSTRAINT "work_updates_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "work_updates_node_id_created_at_idx" ON "work_updates"("node_id", "created_at");

-- 4. Create Approval Policies Table
CREATE TABLE IF NOT EXISTS "approval_policies" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "task_type" TEXT,
    "project_classification" "ConfidentialityLevel",
    "risk_impact" TEXT,
    "budget_threshold" DECIMAL(14,2),
    "confidentiality" "ConfidentialityLevel",
    "department_id" TEXT,
    "operation_type" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "approval_policies_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "approval_policies_workspace_id_name_version_key" UNIQUE ("workspace_id", "name", "version"),
    CONSTRAINT "approval_policies_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE,
    CONSTRAINT "approval_policies_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS "approval_policies_workspace_id_operation_type_idx" ON "approval_policies"("workspace_id", "operation_type");

-- 5. Create Policy Stages Table
CREATE TABLE IF NOT EXISTS "policy_stages" (
    "id" TEXT NOT NULL,
    "policy_id" TEXT NOT NULL,
    "policy_version" INTEGER NOT NULL DEFAULT 1,
    "stage_order" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "mode" TEXT NOT NULL DEFAULT 'SEQUENTIAL',
    "rule" TEXT NOT NULL DEFAULT 'ANY_ONE_APPROVES',
    "condition" JSONB DEFAULT '{}',
    "approver_role" TEXT,
    "specific_approver_id" TEXT,
    "backup_approver_id" TEXT,
    "allow_delegation" BOOLEAN NOT NULL DEFAULT true,
    "due_duration_hours" INTEGER,
    "escalate_after_hours" INTEGER,
    "escalate_to_user_id" TEXT,

    CONSTRAINT "policy_stages_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "policy_stages_policy_id_fkey" FOREIGN KEY ("policy_id") REFERENCES "approval_policies"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "policy_stages_policy_id_stage_order_idx" ON "policy_stages"("policy_id", "stage_order");

-- 6. Create Approval Requests Table
CREATE TABLE IF NOT EXISTS "approval_requests" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "project_id" TEXT,
    "node_id" TEXT,
    "submission_id" TEXT,
    "submission_version" INTEGER NOT NULL DEFAULT 1,
    "operation_type" TEXT NOT NULL DEFAULT 'TASK_COMPLETION',
    "policy_id" TEXT NOT NULL,
    "policy_version" INTEGER NOT NULL DEFAULT 1,
    "submitter_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "current_stage_index" INTEGER NOT NULL DEFAULT 0,
    "payload" JSONB DEFAULT '{}',
    "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "approval_requests_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "approval_requests_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE,
    CONSTRAINT "approval_requests_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE,
    CONSTRAINT "approval_requests_node_id_fkey" FOREIGN KEY ("node_id") REFERENCES "nodes"("id") ON DELETE CASCADE,
    CONSTRAINT "approval_requests_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "work_submissions"("id") ON DELETE SET NULL,
    CONSTRAINT "approval_requests_policy_id_fkey" FOREIGN KEY ("policy_id") REFERENCES "approval_policies"("id") ON DELETE RESTRICT,
    CONSTRAINT "approval_requests_submitter_id_fkey" FOREIGN KEY ("submitter_id") REFERENCES "users"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "approval_requests_workspace_id_status_idx" ON "approval_requests"("workspace_id", "status");
CREATE INDEX IF NOT EXISTS "approval_requests_node_id_status_idx" ON "approval_requests"("node_id", "status");
CREATE INDEX IF NOT EXISTS "approval_requests_project_id_idx" ON "approval_requests"("project_id");

-- 7. Create Approval Stage Instances Table
CREATE TABLE IF NOT EXISTS "approval_stage_instances" (
    "id" TEXT NOT NULL,
    "approval_request_id" TEXT NOT NULL,
    "stage_order" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'SEQUENTIAL',
    "rule" TEXT NOT NULL DEFAULT 'ANY_ONE_APPROVES',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "assigned_approver_ids" JSONB DEFAULT '[]',
    "primary_approver_id" TEXT,
    "backup_approver_id" TEXT,
    "delegated_approver_id" TEXT,
    "due_date" TIMESTAMP(3),
    "escalated_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "approval_stage_instances_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "approval_stage_instances_approval_request_id_fkey" FOREIGN KEY ("approval_request_id") REFERENCES "approval_requests"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "approval_stage_instances_request_stage_idx" ON "approval_stage_instances"("approval_request_id", "stage_order");

-- 8. Create Approval Decisions Table
CREATE TABLE IF NOT EXISTS "approval_decisions" (
    "id" TEXT NOT NULL,
    "approval_request_id" TEXT NOT NULL,
    "stage_instance_id" TEXT,
    "approver_id" TEXT NOT NULL,
    "delegated_from_user_id" TEXT,
    "decision" TEXT NOT NULL,
    "comment" TEXT,
    "policy_version" INTEGER NOT NULL,
    "submission_version" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "approval_decisions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "approval_decisions_request_approver_subver_key" UNIQUE ("approval_request_id", "approver_id", "submission_version"),
    CONSTRAINT "approval_decisions_approval_request_id_fkey" FOREIGN KEY ("approval_request_id") REFERENCES "approval_requests"("id") ON DELETE CASCADE,
    CONSTRAINT "approval_decisions_stage_instance_id_fkey" FOREIGN KEY ("stage_instance_id") REFERENCES "approval_stage_instances"("id") ON DELETE SET NULL,
    CONSTRAINT "approval_decisions_approver_id_fkey" FOREIGN KEY ("approver_id") REFERENCES "users"("id") ON DELETE CASCADE,
    CONSTRAINT "approval_decisions_delegated_from_user_id_fkey" FOREIGN KEY ("delegated_from_user_id") REFERENCES "users"("id") ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS "approval_decisions_request_stage_idx" ON "approval_decisions"("approval_request_id", "stage_instance_id");
CREATE INDEX IF NOT EXISTS "approval_decisions_approver_id_idx" ON "approval_decisions"("approver_id");

-- 9. Create Evidence Items Table
CREATE TABLE IF NOT EXISTS "evidence_items" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "node_id" TEXT,
    "submission_id" TEXT,
    "submission_version" INTEGER,
    "approval_request_id" TEXT,
    "uploaded_by" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'general',
    "description" TEXT,
    "mime_type" TEXT NOT NULL,
    "file_size" BIGINT NOT NULL,
    "storage_key" TEXT NOT NULL,
    "file_hash" TEXT,
    "metadata" JSONB DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "evidence_items_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "evidence_items_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE,
    CONSTRAINT "evidence_items_node_id_fkey" FOREIGN KEY ("node_id") REFERENCES "nodes"("id") ON DELETE CASCADE,
    CONSTRAINT "evidence_items_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "work_submissions"("id") ON DELETE SET NULL,
    CONSTRAINT "evidence_items_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "users"("id") ON DELETE CASCADE,
    CONSTRAINT "evidence_items_approval_request_id_fkey" FOREIGN KEY ("approval_request_id") REFERENCES "approval_requests"("id") ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS "evidence_items_workspace_node_idx" ON "evidence_items"("workspace_id", "node_id");
CREATE INDEX IF NOT EXISTS "evidence_items_submission_id_idx" ON "evidence_items"("submission_id");
CREATE INDEX IF NOT EXISTS "evidence_items_approval_request_id_idx" ON "evidence_items"("approval_request_id");

-- 10. Create Immutable Audit Events Table
CREATE TABLE IF NOT EXISTS "audit_events" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "actor_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "target_type" TEXT NOT NULL,
    "target_id" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "before_values" JSONB,
    "after_values" JSONB,
    "reason" TEXT,
    "request_id" TEXT,
    "policy_reference" TEXT,
    "outcome" TEXT NOT NULL DEFAULT 'SUCCESS',

    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "audit_events_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE,
    CONSTRAINT "audit_events_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "audit_events_workspace_target_idx" ON "audit_events"("workspace_id", "target_type", "target_id");
CREATE INDEX IF NOT EXISTS "audit_events_workspace_timestamp_idx" ON "audit_events"("workspace_id", "timestamp");
CREATE INDEX IF NOT EXISTS "audit_events_actor_id_idx" ON "audit_events"("actor_id");

-- 11. Append-Only Rule / Trigger on audit_events
-- Enforces that neither UPDATE nor DELETE can ever be performed on audit_events
CREATE OR REPLACE FUNCTION prevent_audit_events_modification()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Audit events are strictly append-only: UPDATE and DELETE operations are forbidden.';
END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
    DROP TRIGGER IF EXISTS trg_audit_events_immutable ON "audit_events";
    CREATE TRIGGER trg_audit_events_immutable
    BEFORE UPDATE OR DELETE ON "audit_events"
    FOR EACH ROW
    EXECUTE FUNCTION prevent_audit_events_modification();
EXCEPTION
    WHEN undefined_function THEN null;
END $$;

