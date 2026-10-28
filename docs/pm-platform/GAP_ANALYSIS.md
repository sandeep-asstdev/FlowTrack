# FlowTrack PM Governance Platform — Gap Analysis (Phase 1 Foundation)

**Date**: 2026-10-28  
**Scope**: Phase 1 Foundation — Organization Model, Central Authorization, Confidentiality, Projects, Unlimited-Depth Tasks.  
**Auditor**: Senior Software Architect, Security Engineer, QA Engineer.

---

## 1. System Inventory & Repository Mapping

### Technology Stack
- **Monorepo**: pnpm workspaces
- **Backend API (`apps/api`)**: NestJS 10, Prisma ORM 6.19, PostgreSQL 15+, JWT Auth (`@nestjs/jwt`, `passport-jwt`), bcryptjs, Socket.io gateway.
- **Shared Domain (`packages/shared`)**: TypeScript library (`tsup` compiled), Zod schemas, CPM calculation, dependency cycle validation, baseline permissions.
- **Frontend Web (`apps/web`)**: React 19, Vite 6, Tailwind CSS 3.4, `@xyflow/react` (ReactFlow 12), Zustand state management, i18next, Lucide React icons.
- **Deployment**: Render (API + PostgreSQL), Cloudflare Workers (`flowtrack.asstitdev3.workers.dev`).

### Current Database Models (`apps/api/prisma/schema.prisma`)
- `Workspace`: Tenant boundary (maps to Organization).
- `User`: Global account (email, phone, googleId, passwordHash, fullName, avatarUrl, isActive).
- `Membership`: User role within a Workspace (`ADMIN`, `MANAGER`, `TEAM_LEAD`, `MEMBER`, `GUEST`).
- `Project`: Project container (`workspaceId`, `name`, `description`, `status`, `startDate`, `targetDate`).
- `ProjectMember`: Project-scoped membership (`projectId`, `userId`, `role`).
- `Team`: Workspace-level team grouping (`workspaceId`, `name`).
- `TeamMember`: Membership in a team (`teamId`, `userId`, `role`).
- `Node`: Universal workflow item (task, stage, milestone, approval gate).
- `Edge`: Directed dependency edge between nodes.
- `Remark`, `Document`, `ChatThread`, `ChatMessage`, `AuditLog`, `Notification`, `TaskApproval`.

---

## 2. Detailed Requirement Gap Analysis

| Requirement | Status | Current Implementation | Gap / Remediation Needed |
| :--- | :---: | :--- | :--- |
| **B.1 Multi-tenant safety** | **PARTIAL** | All existing business tables carry `workspace_id`. | In FlowTrack, `workspace_id` acts as the tenant ID. Need explicit alias/support for `organization_id` and strict query scoping so that no endpoint can leak cross-workspace data. |
| **B.2 Configurable hierarchy (Departments, Teams, Positions, Reporting)** | **MISSING** | Flat `Team` and `TeamMember` only. | No `Department` model, no `Position` model, no supervisor/reporting hierarchy (`reportsToPositionId`), no cycle detection on reporting chains. |
| **B.3 Job titles are labels only** | **PARTIAL** | Roles are separate from titles, but `User` has no formal title/position field. | Formalize `Position` and `jobTitle` as labels, decoupling completely from permission roles. |
| **B.4 Scoped Roles (Org / Dept / Team / Project / Task)** | **PARTIAL** | Fragmented across `Membership`, `ProjectMember`, `TeamMember`. | No unified `ScopedRole` entity; no department-level or task-level role grants. Needs unified role-assignment model supporting arbitrary scopes. |
| **B.5 Granular permissions vocabulary** | **PARTIAL** | Colon-separated strings (`projects:manage`, `tasks:create`). | Missing dot-separated standard vocabulary (`project.create`, `project.view`, `confidentiality.change`, `approve.privileged`, `project.archive`, `project.restore`, `permissions.grant`). |
| **B.6 Central Authorization Service (`can(user, perm, resource)`)** | **BROKEN** | Endpoints use coarse `@Roles('ADMIN', 'MANAGER')` guards or ad-hoc inline checks. | Insecure: No single authoritative `AuthorizationService.can(user, permission, resource)` method. Inline role checks allow bypasses. |
| **B.7 Tech Admins NOT business-content authorized** | **BROKEN** | `permissions.ts` and controller guards give `ADMIN` automatic access to all content (`if (role === 'ADMIN') return true`). | Major security issue: Technical administrators must not have blanket access to confidential business content. |
| **B.8 Backup approvers & reassignment** | **MISSING** | `Node.reviewerId` is a single static user foreign key. | No designated backup approvers, delegation windows, or reassignment policies when staff leaves. |
| **C.1 Confidentiality classification levels** | **MISSING** | No classification model; only arbitrary `isLocked` flag in JSON. | Need formal classification levels: `PUBLIC_INTERNAL`, `INTERNAL`, `RESTRICTED`, `CONFIDENTIAL`, `HIGHLY_CONFIDENTIAL`. |
| **C.2 Explicit access grants with expiry/revocation** | **MISSING** | None. | Need `AccessGrant` model with `userId`, `resourceType`, `resourceId`, `accessLevel`, `validUntil`, `revokedAt`. |
| **C.3 Strict inheritance & Most-restrictive-wins** | **MISSING** | None. | Subtasks must inherit parent project/task confidentiality and can only become more restrictive, never less. |
| **C.4 Shared visibility filter (404 on unauthorized)** | **MISSING** | Endpoints either return 403 or expose metadata in lists. | Need shared visibility filter across list/get/search that returns 404 (not 403) so confidential projects do not leak existence. |
| **D.1 Project governance fields** | **PARTIAL** | Has `name`, `description`, `startDate`, `targetDate`, `status`. | Missing unique `key` (e.g. `PRJ-SHOWROOM`), `objectives`, `scope`, `deliverables`, `ownerId`, `responsibleManagerId`, `classification`, `accessPolicy`. Distinct owner, executor, approver. |
| **E.1 Unlimited task hierarchy with max depth (10)** | **PARTIAL** | `Node.parentNodeId` is flat adjacency list with N+1 retrieval. | Needs materialized `path` (`/rootId/parentId/...`) and `depth` column to query subtrees in $O(1)$ query and enforce depth limit $\le 10$. |
| **E.2 Task governance fields** | **PARTIAL** | Has `ownerId`, `dueDate`, `priority`. | Missing collaborators list, watchers list, `assignedById`, `responsibleLeadId`, acceptance criteria, definition of done, `isRequired` flag for children. |
| **E.3 Dependencies with cycle detection** | **EXISTS** | `validateDependencyEdge` in `@flowtrack/shared` detects DFS cycles. | Needs integration with new task reparenting and authorization rules. |
| **E.4 Reparent/reorder preserving history** | **PARTIAL** | Canvas drag moves coordinates; reparenting doesn't re-validate depth or path. | Reparenting must update materialized path, verify depth $\le 10$, check cycle, and record audit log. |
| **E.5 Creating task grants NO approval authority** | **EXISTS** | Enforced in `@flowtrack/shared/permissions` (`canApproveTask` blocks self-approval). | Ensure central authorization service rigorously enforces this. |
| **E.6 Scope-limited assignment** | **PARTIAL** | Basic check in `canAssignTask`. | Integrate with Department and Team hierarchy validation in the central service. |
| **E.7 Progress rollup respecting optional children** | **PARTIAL** | Rollup math exists, but assumes all children are mandatory. | Update rollup to skip or weight optional children (`isRequired === false`). |
| **E.8 Pagination and filtering on lists** | **PARTIAL** | Ad-hoc limit/offset on some queries; others fetch all. | Standardize cursor/offset pagination, search, and multi-filter criteria. |

---

## 3. Insecure Permission Checks & Anti-Patterns Identified

1. **Platform Admin Auto-Bypass (`ADMIN` Superuser Fallback)**:
   - File: `packages/shared/src/permissions/index.ts` lines 205-207:
     ```typescript
     if (role === MEMBERSHIP_ROLES.ADMIN) {
       return { allowed: true, statusCode: 200 };
     }
     ```
   - **Vulnerability**: A technical workspace administrator automatically has approval power and unrestricted read access to confidential project documents, violating the separation of technical administration from business-content authorization.
   - **Remediation**: Remove automatic blanket permission; technical admins only possess administrative permissions (`users:manage`, `settings:edit`), while content read/approve requires explicit scoped grant or role.

2. **Controller-Level Role Checking (`@Roles('ADMIN', 'MANAGER')`)**:
   - Files: `projects.controller.ts`, `nodes.controller.ts`, `teams.controller.ts`.
   - **Vulnerability**: Coarse role checks ignore project-level and resource-level scoping. A user who is a Manager in Department A could invoke manager endpoints on Project B in Department B.
   - **Remediation**: Replace static `@Roles` guards with `AuthorizationService.can(user, permission, resourceContext)` for every mutation and read.

3. **Confidential Resource Existence Leakage (HTTP 403 vs 404)**:
   - Files: `projects.service.ts`, `nodes.service.ts`.
   - **Vulnerability**: Returning HTTP 403 Forbidden informs an unauthorized actor that a project or task with that UUID exists.
   - **Remediation**: The visibility filter must return HTTP 404 Not Found for any resource the requesting user does not have permission to view.
