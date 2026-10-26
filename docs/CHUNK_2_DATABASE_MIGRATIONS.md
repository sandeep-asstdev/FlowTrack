# Chunk 2 — Database and Safe Migrations

## Overview
This document specifies the database schema enhancements and safe migration procedure for **FlowTrack User Management, Assignment & Approval (Chunk 2)**.

All schema modifications are **strictly additive and backward-compatible**:
- Existing records, foreign key relationships, and primary keys are preserved intact.
- No tables, columns, or data are dropped or reset.
- User deactivation (`isActive = false`) is supported to preserve audit history and historical work instead of deleting user records.
- Approval history is stored in a dedicated relational table `TaskApproval` (`task_approvals`) rather than unstructured JSON blobs, providing full relational integrity, foreign keys, and performant indexes.

---

## 1. Schema Additions

### 1.1 User Model (`users` table)
- **`isActive` (`is_active` BOOLEAN, default `true`, indexed)**:
  Tracks user active / deactivated state without destroying historical relations or records.

### 1.2 Node Model (`nodes` table)
- **`assignedById` (`assigned_by_id` TEXT, FK -> `users.id`, indexed)**:
  Tracks which manager, team lead, or admin assigned the task.
- **`assignedAt` (`assigned_at` TIMESTAMP(3))**:
  Timestamp when assignment occurred.
- **`submitterId` (`submitter_id` TEXT, FK -> `users.id`, indexed)**:
  Tracks the user who submitted the task for review.
- **`submittedAt` (`submitted_at` TIMESTAMP(3))**:
  Timestamp when the task was submitted for review.

### 1.3 TaskApproval Model (`task_approvals` table)
Immutable approval history recording every approval decision:
- **`id` (UUID string, PK)**
- **`workspaceId` (FK -> `workspaces.id` ON DELETE CASCADE)**
- **`nodeId` (FK -> `nodes.id` ON DELETE CASCADE)**
- **`submitterId` (FK -> `users.id` ON DELETE SET NULL, optional)**
- **`submittedAt` (TIMESTAMP(3), optional)**
- **`reviewerId` (FK -> `users.id` ON DELETE RESTRICT)**
- **`decision` (TEXT: `'approved' | 'rejected' | 'changes_requested'`)**
- **`feedback` (TEXT, optional reason / comment)**
- **`decidedAt` (TIMESTAMP(3), default `now()`)**
- **`createdAt` (TIMESTAMP(3), default `now()`)**

**Indexes**:
- `@@index([nodeId, decidedAt])`: Fast lookup of approval history per task in chronological order.
- `@@index([reviewerId])`: Fast lookup of reviews conducted by a reviewer.
- `@@index([workspaceId, decidedAt])`: Fast compliance auditing across workspace.

---

## 2. Migration Execution Instructions

The migration script is located at:
[`apps/api/prisma/migrations/20261024_user_management_and_approvals/migration.sql`](../apps/api/prisma/migrations/20261024_user_management_and_approvals/migration.sql)

### Option A: Via PostgreSQL CLI / Direct Connection (Zero Risk of Reset)
Run the script directly against your PostgreSQL database:

```bash
# Using psql
psql "$DATABASE_URL" -f apps/api/prisma/migrations/20261024_user_management_and_approvals/migration.sql
```

All SQL statements use `IF NOT EXISTS` guards, so the script is idempotent and safe to run multiple times.

### Option B: Via Prisma Client Schema Sync
If you are running in local development with Prisma:

```bash
# Generate updated Prisma client
pnpm --filter @flowtrack/api prisma:generate

# Push additive schema changes without resetting data
pnpm --filter @flowtrack/api prisma db push
```

> [!IMPORTANT]
> Never run `prisma migrate reset` in environments with existing project data. The migration SQL is specifically designed to run on top of existing data without touching existing rows.

---

## 3. Rollback Plan
If for any reason these additions need to be reverted:

```sql
DROP TABLE IF EXISTS "task_approvals";

ALTER TABLE "nodes" DROP COLUMN IF EXISTS "assigned_by_id";
ALTER TABLE "nodes" DROP COLUMN IF EXISTS "assigned_at";
ALTER TABLE "nodes" DROP COLUMN IF EXISTS "submitter_id";
ALTER TABLE "nodes" DROP COLUMN IF EXISTS "submitted_at";

ALTER TABLE "users" DROP COLUMN IF EXISTS "is_active";
```
