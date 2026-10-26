# FlowTrack User Management, Assignment & Approval — Chunk Plan

Repository: https://github.com/BelladCompany/Project-managment-app
Local folder: `C:\Users\User\Desktop\Project-managment-app`

**Goal:** Add secure user management and task assignment/approval to the existing FlowTrack application. Keep its existing frontend/backend/database architecture and reuse current models. Do not rebuild the app.

**Status note:** User reports universal-platform Chunks 1–3 are complete. Verify the current code and tests before assuming they work. Do not duplicate existing functionality.

## Initial roles and rules

### Platform Admin
- Create, edit, activate/deactivate user accounts.
- Assign roles and manage teams/projects within platform policy.
- Assign projects/tasks within allowed scope.
- May view records as policy permits.
- **Must never approve or reject tasks**, even if the admin created the task or has broad access.

### Manager
- Manage authorized teams/projects.
- Assign work to Team Leads and eligible team members within scope.
- Review, approve, reject, or request changes on submitted work within scope.
- Track deadlines, blockers, and workload.
- Cannot grant Platform Admin rights or elevate their own role.

### Team Lead
- Manage assigned teams/projects.
- Assign work to eligible members within scope.
- Review, approve, reject, or request changes on submitted work within scope.
- Escalate blockers to a Manager.
- Cannot manage platform-wide users or grant themselves elevated privileges.

### Basic task assignee
A user account is needed for people who receive work. Use the existing lowest-privilege role if present; do not add a duplicate role unnecessarily. Assignees can view assigned tasks, update permitted fields, comment/add evidence, and submit work for review. They cannot assign tasks or approve/reject work.

### Non-negotiable authorization
1. Only **Manager and Team Lead** can approve/reject.
2. Platform Admin is never an approver.
3. No one can approve their own work or a task they are assigned to.
4. Frontend button visibility is not security; enforce all permissions in backend guards/services.
5. Check organization/team/project scope on every protected operation.
6. Never trust client-supplied role, reviewer ID, user ID, team ID, or project ID without server-side validation.
7. Use least privilege. If not explicitly permitted, deny.
8. Preserve existing data and uncommitted changes. Use safe additive migrations; never reset/drop the database.

## Permission matrix

| Action | Platform Admin | Manager | Team Lead | Assignee |
|---|---|---|---|---|
| Create/manage user accounts | Yes | No by default; only if explicitly scoped | No | No |
| Grant roles | Yes, with safeguards | No | No | No |
| Manage teams/projects | Platform policy | Authorized scope | Assigned scope only | No |
| Assign tasks | Yes, within policy | Authorized scope | Assigned scope | No |
| Update assigned task | If assigned | If assigned | If assigned | Yes |
| Submit work for review | If assigned and allowed | If assigned and allowed | If assigned and allowed | Yes |
| Approve/reject | **Never** | Yes, scoped; not own work | Yes, scoped; not own work | **Never** |
| Edit/delete approval history | No | No | No | No |

## Chunk 0 — Audit current implementation
Inspect relevant existing Prisma models/migrations, authentication/JWT, role guards, user/team/project/task models, assignments, approval/status workflow, shared Zod types, frontend screens, and tests. Classify each feature as verified, partial, missing, broken, or not tested. Recommend minimal additive changes. Do not refactor unrelated modules. Wait for approval before implementation.

## Chunk 1 — Shared role and permission contracts
Reuse existing role structures where possible. Define a single permission vocabulary and centralized permission helpers. Example permissions: `users:read`, `users:create`, `users:update`, `users:deactivate`, `roles:assign`, `teams:manage`, `projects:manage`, `tasks:assign`, `tasks:update_assigned`, `tasks:submit`, `approvals:review`, `audit:read`. Keep role checks separate from scope checks. Share TypeScript types and Zod validation between frontend/backend where appropriate. Follow existing error conventions (`401` unauthenticated, `403` forbidden, `400` invalid input). Test that Platform Admin has no approval permission.

## Chunk 2 — Database and safe migrations
Only add models/fields missing from the current schema. Support user active/deactivated state, role assignment, team membership, project access scope, task assignment metadata, and immutable approval history as needed. Approval history should record task, submitter/time, reviewer, decision, comment/reason, and decision time. Record audit events for role changes, deactivation, assignments, submissions, and decisions. Use foreign keys/indexes/constraints appropriately. Prefer deactivation over deleting users with historical work. Never store everything in one JSON field. Preserve IDs and records. Add a migration and document how to apply it; do not reset the database.

## Chunk 3 — Backend authorization and account lifecycle
Secure the API before relying on UI controls. Reuse existing auth and guards. Enforce role and scope checks in every user/team/project/task/approval endpoint. Validate account creation, duplicate emails, role changes, deactivation, and memberships. Prevent self-promotion; prevent Manager/Team Lead from granting Platform Admin; prevent accidental deactivation of the last active Platform Admin. Deactivated users cannot log in or act. Scope database queries by organization/team/project. Never return password hashes, tokens, secrets, or OTPs. Test direct API calls that attempt forbidden actions.

## Chunk 4 — Platform Admin user-management UI
Build or improve a user list with search/filter by name, email, role, team, and active state. Add create/edit user, assign role, assign team/project scope, activate/deactivate with confirmation, and clear loading/empty/error states. Prevent accidental self-deactivation and last-admin lockout. Use the existing secure invitation/password/reset flow; never store plaintext passwords. API must remain authoritative even if a user manually calls endpoints.

## Chunk 5 — Teams and project membership
Manage team membership and Team Lead assignment; assign Managers to authorized teams/projects; maintain project access scopes. Validate that task assignees belong to the same authorized organization/project/team. Platform Admin manages memberships according to policy; Manager and Team Lead act only in their scope. Removing membership must not erase historical tasks/approvals. Test cross-team and cross-project access denials.

## Chunk 6 — Task assignment and submission
Add assignment/reassignment actions to the existing task/project UI. Show eligible assignees only, but also validate them on the server. Record who assigned/reassigned and when. Provide filters such as assigned to me, assigned by me, project/team/status/due date. Assignees can update permitted task fields, add comments/evidence, and submit work. Use existing statuses where possible, mapping to logical states such as Open, In Progress, Pending Approval, Changes Requested, Approved/Done, and Blocked. Do not create duplicate status systems. Preserve previous review cycles on resubmission.

## Chunk 7 — Approval/rejection workflow
Create a review queue for eligible Managers and Team Leads. Show task details, submitter, submitted time, comments/evidence, and previous decisions. Actions: Approve, Reject/Request Changes. Require a reason/comment for rejection or changes requested. Store reviewer identity from the authenticated session, not client input. Save decision and audit record atomically where practical. Notify the assignee through existing notification infrastructure if available.

For every decision, verify:
- User is Manager or Team Lead.
- User has access to the task's project/team.
- Task is currently pending approval.
- Reviewer is neither submitter nor assignee.
- Transition is valid and not a duplicate/stale decision.
- Rejection/changes reason is valid.
- Client cannot impersonate a reviewer.

Platform Admin approval attempt must return `403`; assignee approval attempt must return `403`; out-of-scope reviewer must be denied. For the initial version, allow one eligible Manager or Team Lead to make a valid decision unless multi-stage approval is explicitly requested. Do not silently invent a two-step chain.

## Chunk 8 — Audit, dashboards, and notifications
Add audit events for account/role changes, activation/deactivation, memberships, assignments, submissions, and approvals. Where existing infrastructure supports it, notify users about assignment, reassignment, submission, approval, rejection, and changes requested. Add role-scoped views: Admin user overview, Manager/Team Lead pending review and team workload, assignee's tasks and review status. Notification failure must not corrupt task/approval transactions. Avoid duplicate services and expensive unnecessary queries.

## Chunk 9 — End-to-end tests and hardening
Test role matrix, account lifecycle, role changes, team/project scope, assignment/reassignment, submit/approve/reject/rework/resubmit, invalid transitions, duplicate decisions, audit records, and deactivated users. Run actual repo scripts for schema validation, tests, type checks, lint, and builds. Mark every result PASS, FAIL, or NOT TESTED.

Manual scenario:
1. Platform Admin creates Manager M1, Team Lead TL1, and assignee U1.
2. Admin assigns M1 to Project A and TL1 to Team A.
3. M1 assigns a task to TL1; TL1 assigns a task to U1.
4. U1 submits work for approval.
5. TL1 approves it; verify task state and immutable history.
6. Submit another task; TL1 requests changes; U1 edits and resubmits.
7. Try approval as Platform Admin: denied.
8. Try approval as assignee: denied.
9. Try approval by a Team Lead from another team: denied.
10. Deactivate a user; login/actions fail but history remains.
11. Refresh pages; changes persist.
12. Inspect browser console, network requests, and server logs.

## Execution order
Chunk 0 audit → Chunk 1 permissions → Chunk 2 database → Chunk 3 backend security → Chunk 4 admin UI → Chunk 5 team/project scope → Chunk 6 assignment/submission → Chunk 7 approvals → Chunk 8 audit/notifications → Chunk 9 tests.

Do one chunk at a time. Report changed files, exact commands/results, PASS/FAIL/NOT TESTED, and remaining issues. Wait for user approval between chunks. Reuse working code; do not start over.

## Reusable prompt to append to every chunk
> Work fast and implement only this chunk in the existing codebase. Inspect only relevant files and reuse the current architecture. Make the smallest complete changes; avoid unrelated refactoring and long plans. Preserve existing work and data. Enforce permissions on the backend, not only in the UI. Add focused tests and run relevant existing checks. Do not claim success without verification. At the end, list files changed, exact commands/results, PASS/FAIL/NOT TESTED items, and remaining issues. Do not begin the next chunk until I approve it.

## Immediate next step
The user reports that universal-platform Chunks 1–3 are done. First verify those changes and current user/team/task models, then start at Chunk 0/1 only where needed. Do not duplicate existing functionality. Do not start Chunk 4 of this user-management plan until the user approves the prior chunk's results.
