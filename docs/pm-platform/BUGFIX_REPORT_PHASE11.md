# Phase 11 Bugfix Report: Assignment Visibility, Child Tasks, Progress Removal & Photo Evidence

**Branch:** `feat/phase11-assignment-subtasks-evidence`  
**Date:** November 14, 2026  
**Status:** All 4 bugs resolved and verified with automated test suites across API and Web packages.

---

## 1. Executive Summary

| Issue | Title | Root Cause | Fix Summary | Final Status |
| :--- | :--- | :--- | :--- | :--- |
| **Bug 1** | Assignment shows "Unassigned" & Assignee cannot see task | Broken in commit `e53d1db` when `resolveTaskPermissions` required `isProjectMember` for viewing, while `validateTaskAssignmentScope` threw 403 on assigning workspace members not already in `project_members`. Assignee was also split between `ownerId` and `customData.assigneeName`. | Auto-grant limited project membership (`Role.GUEST`) upon task assignment; filter tasks strictly to assigned/subtasks/ancestor breadcrumbs; unify assignee single source of truth to server response `owner`; write reassignment audit trail. | **FIXED** (with tests) |
| **Bug 2** | Creating Child Tasks | Missing UI actions on canvas nodes, tree, and list rows; drawer had code but lacked subtask creation UI form; backend depth limit was set to 5 rather than 10. | Added "+ Child" node action, List "+ Subtask" action, Tree "+ Child" action, and drawer "Subtasks" form with Title, Assignee, Due Date. Enforced server rules: scope authorization, confidentiality inheritance, max depth 10, parent completion gates. | **FIXED** (with tests) |
| **Bug 3** | Remove Progress Percentage | Progress sliders and `%` numbers in drawer, nodes, list, board, timeline, dashboards, and rollup calculations. | Completely removed progress sliders, inputs, and `%` numbers from UI; replaced with factual indicators (task state, "X of Y checklist items done", "X of Y subtasks completed", evidence counts). Decoupled completion gates from progress percentage. | **FIXED** (with tests) |
| **Bug 4** | Showing Work with Photos and Attachments | No dedicated mobile photo capture or multi-file attachment flow for regular work updates; attachments lacked client compression and thumbnail review. | Added "Post an update" flow in Work tab with camera capture (`capture="environment"`), multi-file picker, client-side JPEG compression (`imageCompressor.ts`), captions, evidence categorization (`Photo`, `Document`, `Drawing`, `Other`), thumbnail preview with removal, zoom lightbox, and updates timeline visible to reviewers. | **FIXED** (with tests) |

---

## 2. Root Cause Analysis

### Bug 1: Assignee Visibility & Broken Access
- **Breaking Commit:** `e53d1db129d8e48d84f910596e04df1458fa86e6` ("Phase 9 Security: Strict Tenant and Project Isolation")
- **Mechanism:**
  1. `validateTaskAssignmentScope` in `apps/api/src/modules/nodes/nodes.service.ts` threw `403 Forbidden` (`Cross-project access denied: Assignee is not a member of this project`) whenever assigning a workspace member who was not previously added to `project_members`.
  2. Because the API call failed, task assignment silently failed or left tasks unassigned.
  3. Even when `ownerId` was persisted, `resolveTaskPermissions` evaluated `isProjectMember = Boolean(projectMembers.find(...))`. Non-members received `canView = false`, causing `listProjectNodes` and `getNode` to return 404/403 for the assigned member.
  4. In the UI, `NodeDetailDrawer.tsx` wrote assignee name and avatar to `customData.assigneeName` and `customData.assigneeAvatar`, whereas canvas nodes and table views read `node.owner?.fullName`.

### Bug 2: Creating Child Tasks
- `NodeDetailDrawer.tsx` contained an unused `handleCreateSubtask` function, but the JSX only displayed child subtasks if `node.children.length > 0` with no input fields to add a child.
- Canvas nodes had no "+ Child" action button.
- Hierarchy depth limit in `packages/shared/src/domain/hierarchy.ts` was locked at `MAX_HIERARCHY_DEPTH = 5` instead of `10`.

### Bug 3: Progress Percentage
- Work progress was represented as arbitrary percentage sliders (`0-100%`) in the task drawer, on nodes, table columns, timeline bars, and dashboards.
- A task could have `progressPct = 100` without any checklist items or deliverables completed, conflating progress with factual completion.

### Bug 4: Evidence & Photo Updates
- Field workers on phones lacked an easy way to snap photos (`capture="environment"`), stage multiple photos/documents, compress large high-res photos before upload, attach captions, and see a chronological updates timeline.

---

## 3. Key Fixes Implemented

### Backend (`apps/api`)
1. **Auto-Grant Limited Project Membership on Assignment:**
   - In `createNode` and `updateNode` (`apps/api/src/modules/nodes/nodes.service.ts`), assigning an active workspace member creates a `ProjectMember` record with `role: Role.GUEST` if not already present.
   - When a task is reassigned to someone else and the prior assignee has no remaining assigned tasks or subtasks, their limited membership is cleaned up, and a `REASSIGNMENT` event is logged in the audit trail.
2. **Assignee-Scoped Task Visibility:**
   - Updated `listProjectNodes` and `resolveTaskPermissions`: users with limited membership (`Role.GUEST`) can view only tasks assigned to them, their child subtasks, and minimal parent breadcrumbs (masked if parent is confidential). They are denied access to sibling or unrelated tasks.
3. **Max Hierarchy Depth:**
   - Updated `MAX_HIERARCHY_DEPTH = 10` in `packages/shared/src/domain/hierarchy.ts`.
4. **Work Updates API:**
   - Verified `@Post(':id/work-updates')` and `@Get(':id/work-updates')` in `nodes.controller.ts` & `task-lifecycle.service.ts`, saving structured attachments (`fileName`, `fileType`, `fileSize`, `fileUrl`, `category`, `caption`) in `links`.

### Frontend (`apps/web`)
1. **Unify Assignee Single Source of Truth:**
   - Removed caching in `customData.assigneeName` and `customData.assigneeAvatar`. All components (`FlowTrackNode.tsx`, `WorkspaceViews.tsx`, `NodeDetailDrawer.tsx`, `CanvasStudio.tsx`) strictly derive assignee identity from `task.owner`.
2. **Child Task Creation UI (Desktop & Mobile):**
   - **Canvas:** Added quick "+ Child" button on canvas nodes (`FlowTrackNode.tsx`) triggering child task modal connected below the parent.
   - **Drawer:** Added distinct "Subtasks (child tasks with their own owner and due date)" section separate from Checklist, with Title, Assignee, Due Date inputs (`min-h-[44px]`).
   - **List & Tree Views:** Added "+ Subtask" / "+ Child" action buttons on table and tree rows with mobile 44px tap targets.
3. **Removal of Progress %:**
   - Removed progress sliders, inputs, and `%` labels from `NodeDetailDrawer`, `FlowTrackNode`, `WorkspaceViews`, `MyWorkView`, and `UniversalDashboard`.
   - Replaced with factual indicators: task state badge, "X of Y checklist items done", "X of Y subtasks completed", and deliverable counts.
4. **Photo Evidence & Work Updates:**
   - Created `apps/web/src/utils/imageCompressor.ts` (client-side compression to max 1920px JPEG 0.85).
   - Added "Post Work Update & Photo Evidence" section in Work tab:
     - "Take Photo" (mobile camera) & "Add Photos or Files" buttons.
     - Staged thumbnails with file size, category selector (`Photo`, `Document`, `Drawing`, `Other`), caption, and remove button.
     - Chronological update timeline with photo gallery and tap-to-zoom modal lightbox.
     - Timeline is visible to reviewers during approval reviews.

---

## 4. Test Verification Results

### Backend Test Suites
- **`apps/api/src/modules/nodes/phase11-bugs.spec.ts`:**
  - **16 / 16 PASSED**
  - Verifies: assignment visibility, limited member project membership, confidential parent masking, sibling isolation, reassignment audit trail, child task creation permissions, depth limit of 10, completion without progress %, work update attachments.
- **`apps/api/src/modules/auth/phase9-user-isolation-checklist.spec.ts`:**
  - **18 / 18 PASSED**
  - Confirms zero regressions in tenant and project user isolation rules.
- **`packages/shared/src/domain/hierarchy.spec.ts`:**
  - **8 / 8 PASSED**
  - Confirms hierarchy depth limit 10 and parent-child sequence validation.

### Frontend Test Suites
- **`apps/web/src/components/canvas/phase11-ui-bugs.spec.ts`:**
  - **7 / 7 PASSED**
  - Verifies: assignee source of truth, absence of progress %, factual checklist & subtask indicators, client image compression.
- **`apps/web/src/components/canvas/phase9-isolation-checklist.spec.ts`:**
  - **8 / 8 PASSED**

### Monorepo Build
- `@flowtrack/shared`: Built successfully (`dist/index.mjs`, `dist/index.js`, `dist/index.d.ts`).
- `@flowtrack/web`: Built successfully with Vite in 7.63s.
- `@flowtrack/api`: Built successfully with NestJS.

---

## 5. Verification Checklist

- [x] Assigned user sees and can open exactly their assigned tasks.
- [x] "Unassigned" only appears when true.
- [x] Child tasks can be created from drawer, canvas, tree, and list on desktop and mobile within permission rules.
- [x] No progress percentage exists anywhere in the UI.
- [x] Members can post updates with photos and files that reviewers can see.
- [x] Phase 9 isolation tests still pass 100%.
