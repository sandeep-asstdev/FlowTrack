-- Safe additive migration for FlowTrack User Management & Approval System
-- Date: 2026-10-24
-- Chunk 2: Database and safe migrations

-- 1. Add isActive to users
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "is_active" BOOLEAN NOT NULL DEFAULT true;
CREATE INDEX IF NOT EXISTS "users_is_active_idx" ON "users"("is_active");

-- 2. Add task assignment and submission metadata to nodes
ALTER TABLE "nodes" ADD COLUMN IF NOT EXISTS "assigned_by_id" TEXT;
ALTER TABLE "nodes" ADD COLUMN IF NOT EXISTS "assigned_at" TIMESTAMP(3);
ALTER TABLE "nodes" ADD COLUMN IF NOT EXISTS "submitter_id" TEXT;
ALTER TABLE "nodes" ADD COLUMN IF NOT EXISTS "submitted_at" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "nodes_assigned_by_id_idx" ON "nodes"("assigned_by_id");
CREATE INDEX IF NOT EXISTS "nodes_submitter_id_idx" ON "nodes"("submitter_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'nodes_assigned_by_id_fkey'
  ) THEN
    ALTER TABLE "nodes" ADD CONSTRAINT "nodes_assigned_by_id_fkey" FOREIGN KEY ("assigned_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'nodes_submitter_id_fkey'
  ) THEN
    ALTER TABLE "nodes" ADD CONSTRAINT "nodes_submitter_id_fkey" FOREIGN KEY ("submitter_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- 3. Create task_approvals table for immutable approval history
CREATE TABLE IF NOT EXISTS "task_approvals" (
  "id" TEXT NOT NULL,
  "workspace_id" TEXT NOT NULL,
  "node_id" TEXT NOT NULL,
  "submitter_id" TEXT,
  "submitted_at" TIMESTAMP(3),
  "reviewer_id" TEXT NOT NULL,
  "decision" TEXT NOT NULL,
  "feedback" TEXT,
  "decided_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "task_approvals_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "task_approvals_node_id_decided_at_idx" ON "task_approvals"("node_id", "decided_at");
CREATE INDEX IF NOT EXISTS "task_approvals_reviewer_id_idx" ON "task_approvals"("reviewer_id");
CREATE INDEX IF NOT EXISTS "task_approvals_workspace_id_decided_at_idx" ON "task_approvals"("workspace_id", "decided_at");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'task_approvals_workspace_id_fkey'
  ) THEN
    ALTER TABLE "task_approvals" ADD CONSTRAINT "task_approvals_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'task_approvals_node_id_fkey'
  ) THEN
    ALTER TABLE "task_approvals" ADD CONSTRAINT "task_approvals_node_id_fkey" FOREIGN KEY ("node_id") REFERENCES "nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'task_approvals_submitter_id_fkey'
  ) THEN
    ALTER TABLE "task_approvals" ADD CONSTRAINT "task_approvals_submitter_id_fkey" FOREIGN KEY ("submitter_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'task_approvals_reviewer_id_fkey'
  ) THEN
    ALTER TABLE "task_approvals" ADD CONSTRAINT "task_approvals_reviewer_id_fkey" FOREIGN KEY ("reviewer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
