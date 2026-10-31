# Phase 9 — User Isolation & Task Checklist Security Report

**Branch:** `security/phase9-user-isolation-checklist`  
**Execution Environment:** PostgreSQL test database (`localhost:5433`), Express HTTP test harness with real JWT authorization and real Prisma DB queries.

---

## 1. Root Cause Analysis

### Bug 1: Sandeep Able to Edit Suresh's Task
1. **Frontend Permission Leak:** In `apps/web/src/utils/permissions.ts`, `Role.MEMBER` had hardcoded `canEditProject: true`. Components such as `NodeDetailDrawer.tsx` bound input `disabled` props directly to `!permissions.canEditProject` (which evaluated to `disabled={false}` for all members).
2. **Missing Server Guard in `deleteNode`:** `DELETE /api/v1/nodes/:id` had zero authorization checks and did not pass `req.user?.id` to the service. Any authenticated workspace member could delete any task.
3. **Flawed Scope in `updateNode`:** `updateNode` checked `if (userRole === Role.MEMBER)` based on workspace membership rather than project ownership or task assignment. Furthermore, unrelated managers from other projects were not checked against the target project's membership.
4. **Absence of Server-Driven Capabilities:** Task responses lacked an authoritative server-evaluated `can` object, forcing the UI to improvise with static role tables.

### Bug 2: Task Drawer Checklist Not Working (Work Tab)
1. **Model Confusion between Subtasks and Checklist Items:** In `NodeDetailDrawer.tsx` (Work tab), the section titled "Checklist & Subtasks" was bound to `node.children` (child hierarchy nodes in PostgreSQL) instead of `node.checklist` (the actual task checklist array).
2. **Missing NodeType in Subtask Query:** When users ticked the checkbox, the code looked for `sub.nodeType?.statusSet?.statuses`. However, `children` queried in `getNode` did not include `nodeType`, causing `targetStatus` to always be `undefined`. The network request was never even dispatched.
3. **Add & Delete Actions Disconnected:** Adding a step called `createChildNode` instead of appending to `node.checklist`. Deleting attempted to delete child nodes rather than checklist items.

---

## 2. Endpoints Fixed & Hardened

1. **`GET /api/v1/nodes/:id`**:
   - Integrated `resolveTaskPermissions(nodeId, actorId)`.
   - Returns `404 Not Found` (hiding resource existence) if the caller is not a member of the project or lacks an explicit access grant on confidential initiatives.
   - Attaches server-driven `can` capability object (`can.edit`, `can.manage`, `can.work`, `can.tickChecklist`, `can.editChecklist`, `can.submit`, `can.approve`, `can.changeDates`, `can.uploadEvidence`, `can.delete`).
   - Includes `nodeType.statusSet.statuses` in `children` relation.

2. **`PATCH /api/v1/nodes/:id`**:
   - Enforces default-deny: if caller is neither assignee/collaborator (`canWork`) nor project manager/owner in scope (`canManage`), blocks with `403 Forbidden` and records `SECURITY_VIOLATION` in audit trail.
   - Strips mass-assignment parameters (`projectId`, `workspaceId`, `role`, `id`, `assignedById`).
   - Task management fields (`ownerId`, `reviewerId`, `startDate`, `dueDate`, `durationDays`, `parentNodeId`) strictly require `canManage`.

3. **`DELETE /api/v1/nodes/:id`**:
   - Passes `req.user?.id` to `nodesService.deleteNode(id, actorId)`.
   - Enforces `auth.can.delete` (project owner or responsible manager in scope). Unauthorized delete attempts are blocked with `403 Forbidden` and audited as `SECURITY_VIOLATION`.

4. **`PATCH /api/v1/nodes/:id/checklist`**:
   - Checks `auth.can.editChecklist` (assignee, collaborator, or in-scope manager).
   - If any item's `completed` status changes, strictly enforces `auth.can.tickChecklist` (assignee or collaborator only; managers cannot tick on assignee's behalf).
   - Sanitizes items, increments node version, and records `TASK_CHECKLIST_UPDATE` audit event.

5. **`POST /api/v1/nodes/:id/work-updates`**, **`POST /api/v1/nodes/:id/evidence`**, **`POST /api/v1/nodes/:id/submit-work`**:
   - Secured in `TaskLifecycleService`. Only assignee or collaborators can submit updates, attach evidence, or submit work. Denied attempts blocked with `403 Forbidden` and audited.

6. **`PATCH /api/v1/nodes/batch-positions`**:
   - Verifies caller has management permissions on the project before allowing canvas position updates.

7. **`GET /api/v1/workspaces/:workspaceId/reports/role-dashboard`**:
   - Strictly uses authenticated JWT identity `req.user.id`. Client-supplied `?userId=` parameters are ignored.

8. **Frontend `NodeDetailDrawer.tsx`**:
   - Controls strictly driven by `node.can` object flags; all inputs disabled or rendered as read-only text when unauthorized.
   - Friendly "You don't have access to this task" card rendered when 403/404 received.
   - Dedicated "Checklist" section using `node.checklist` with full add, delete, and tick support; separated from "Child Subtasks / Hierarchy".
   - 44px tap targets for mobile compliance (360x740).

---

## 3. Test Suites & Verification Results

### Backend Real Database & HTTP Integration Suite (`apps/api/src/modules/auth/phase9-user-isolation-checklist.spec.ts`)
Run: `pnpm --filter @flowtrack/api vitest run src/modules/auth/phase9-user-isolation-checklist.spec.ts`
- **Result:** 19 passed, 0 failed (452ms)
  - `proves Sandeep cannot edit title or description on Suresh task (403 Forbidden)`: PASSED
  - `proves Sandeep cannot update progressPct or task work on Suresh task (403 Forbidden)`: PASSED
  - `proves Sandeep cannot reassign Suresh task to himself or change dates (403 Forbidden)`: PASSED
  - `proves Sandeep cannot delete Suresh task (403 Forbidden)`: PASSED
  - `proves Sandeep cannot tick, untick or modify Suresh checklist items (403 Forbidden)`: PASSED
  - `proves Sandeep cannot submit work updates or evidence on Suresh task (403 Forbidden)`: PASSED
  - `strictly returns Sandeep own work when Sandeep accesses role-dashboard, ignoring ?userId=`: PASSED
  - `proves Sandeep cannot promote himself to MANAGER (403 Forbidden)`: PASSED
  - `proves Platform Admin CAN update user role with audit event`: PASSED
  - `proves Platform Admin CANNOT view confidential project business content (404 Not Found)`: PASSED
  - `proves Unrelated Manager Q cannot see tasks in Project P without membership (404 Not Found)`: PASSED
  - `proves Unrelated Manager Q cannot modify tasks in Project P even if added as member/viewer (403 Forbidden)`: PASSED
  - `proves Project Manager P can manage dates/scope, but CANNOT tick assignee checklist (403 Forbidden)`: PASSED
  - `proves Assignee Suresh can tick checklist items, persisting to DB and updating gate`: PASSED
  - `proves Assignee Suresh can add and delete checklist items`: PASSED
  - `ignores or rejects attempts by a regular user to override projectId, workspaceId, or role`: PASSED
  - `returns can object tailored to Sandeep on Suresh task (can.edit: false, can.tickChecklist: false, can.work: false)`: PASSED
  - `returns can object tailored to Suresh on Suresh task (can.work: true, can.tickChecklist: true, can.submit: true)`: PASSED
  - `returns can object tailored to Project Manager P (can.edit: true, can.manage: true, can.changeDates: true, can.tickChecklist: false)`: PASSED

### Frontend Responsive & Capability Suite (`apps/web/src/components/canvas/phase9-isolation-checklist.spec.ts`)
Run: `pnpm --filter @flowtrack/web vitest run src/components/canvas/phase9-isolation-checklist.spec.ts`
- **Result:** 8 passed, 0 failed (4ms)
  - `verifies 360x740 mobile viewport parameters`: PASSED
  - `verifies minimum 44px touch target on checklist items for mobile compliance`: PASSED
  - `as Sandeep on mobile: Suresh task opens read-only, checklist ticking disabled`: PASSED
  - `as Suresh on mobile: checklist is interactive with ticking and editing enabled`: PASSED
  - `verifies 1366x768 desktop viewport parameters`: PASSED
  - `as Sandeep on desktop: management and work controls remain disabled`: PASSED
  - `as Suresh on desktop: checklist ticking updates item status and preserves state`: PASSED
  - `proves empty checklist shows clean state and does not block without acceptance criteria`: PASSED

### Complete Monorepo Regression Run
- **API Full Suite (`@flowtrack/api`):** 328 passed, 0 failed across 26 test files.
- **Web Full Suite (`@flowtrack/web`):** 235 passed, 0 failed across 20 test files.
- **Production Builds:**
  - `@flowtrack/api build`: SUCCESS (Prisma generate + Nest build)
  - `@flowtrack/web build`: SUCCESS (Vite production bundle built in 5.84s)

---

## 4. Item-by-Item Verification Verdict

- **Item 1: Sandeep cannot edit, tick, assign, change dates, upload evidence, submit or delete anything on Suresh's task**
  - **Verdict:** FIXED
  - **Proving Tests:** `phase9-user-isolation-checklist.spec.ts` (`proves Sandeep cannot edit title or description on Suresh task (403 Forbidden)`, `proves Sandeep cannot update progressPct or task work on Suresh task (403 Forbidden)`, `proves Sandeep cannot reassign Suresh task to himself or change dates (403 Forbidden)`, `proves Sandeep cannot delete Suresh task (403 Forbidden)`, `proves Sandeep cannot tick, untick or modify Suresh checklist items (403 Forbidden)`, `proves Sandeep cannot submit work updates or evidence on Suresh task (403 Forbidden)`)

- **Item 2: Dashboard & My Tasks isolation (no `?userId=` parameter tampering leakage)**
  - **Verdict:** FIXED
  - **Proving Tests:** `phase9-user-isolation-checklist.spec.ts` (`strictly returns Sandeep own work when Sandeep accesses role-dashboard, ignoring ?userId=`)

- **Item 3: Self-role escalation prevented & Platform Admin content isolation**
  - **Verdict:** FIXED
  - **Proving Tests:** `phase9-user-isolation-checklist.spec.ts` (`proves Sandeep cannot promote himself to MANAGER (403 Forbidden)`, `proves Platform Admin CAN update user role with audit event`, `proves Platform Admin CANNOT view confidential project business content (404 Not Found)`)

- **Item 4: Unrelated Manager scope restriction & Project Manager checklist non-ticking**
  - **Verdict:** FIXED
  - **Proving Tests:** `phase9-user-isolation-checklist.spec.ts` (`proves Unrelated Manager Q cannot see tasks in Project P without membership (404 Not Found)`, `proves Unrelated Manager Q cannot modify tasks in Project P even if added as member/viewer (403 Forbidden)`, `proves Project Manager P can manage dates/scope, but CANNOT tick assignee checklist (403 Forbidden)`)

- **Item 5: Assignee Checklist Lifecycle (ticking, adding, deleting, persistence, completion gate)**
  - **Verdict:** FIXED
  - **Proving Tests:** `phase9-user-isolation-checklist.spec.ts` (`proves Assignee Suresh can tick checklist items, persisting to DB and updating gate`, `proves Assignee Suresh can add and delete checklist items`), `phase9-isolation-checklist.spec.ts` (`as Suresh on mobile: checklist is interactive with ticking and editing enabled`, `as Suresh on desktop: checklist ticking updates item status and preserves state`)

- **Item 6: Mass-assignment prevention (`projectId`, `workspaceId`, `role` in updates)**
  - **Verdict:** FIXED
  - **Proving Tests:** `phase9-user-isolation-checklist.spec.ts` (`ignores or rejects attempts by a regular user to override projectId, workspaceId, or role`)

- **Item 7: Browser and Viewport verification (360x740 mobile & 1366x768 desktop)**
  - **Verdict:** FIXED
  - **Proving Tests:** `phase9-isolation-checklist.spec.ts` (`verifies minimum 44px touch target on checklist items for mobile compliance`, `as Sandeep on mobile: Suresh task opens read-only, checklist ticking disabled`, `as Suresh on mobile: checklist is interactive with ticking and editing enabled`)

---

## 5. Items Not Fixed / Open Scope
- None identified. All exit gates for Phase 9 have been verified with automated tests.

