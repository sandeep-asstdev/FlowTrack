# FlowTrack PM Governance Platform — State & Persistent Memory

## 1. Project Overview & Execution Tracking

- **Current Phase**: Phase 1 — Foundation (Completed) -> Awaiting Phase 2
- **Status**: Completed (Exit Gate Satisfied)
- **Last Updated**: 2026-10-28

### Phase Roadmap
- [x] **Phase 1: Foundation (Secure Organizational Model, Projects, Unlimited-Depth Tasks, Central Auth, Confidentiality)**
- [ ] Phase 2: Workflow & Approvals Engine
- [ ] Phase 3: Resource Management, Scheduling & Baselining
- [ ] Phase 4: Risk, Governance & Multi-Methodology Support
- [ ] Phase 5: Reporting, Analytics & Executive Portals

---

## 2. Completed Phases

### Phase 1: Foundation (Completed 2026-10-28)
- **Gap Analysis & Audit**: `/docs/pm-platform/GAP_ANALYSIS.md` produced mapping all existing features, missing requirements, and security remediation needs.
- **Organizational Model**:
  - Departments with parent-child relationships and cycle detection (`validateHierarchyCycle`).
  - Positions with arbitrary-depth reporting hierarchies and cycle detection.
  - Scoped role assignment architecture across `ORGANIZATION`, `DEPARTMENT`, `TEAM`, `PROJECT`, and `TASK` scopes with privilege escalation rejection.
  - Departure work reassignment mechanism (`reassignUserWork`) ensuring no orphaned tasks or projects.
  - Backup approver delegation support (`backupReviewerId`).
- **Central Authorization Service (`AuthorizationService`)**:
  - Authoritative `evaluate` and `enforce` methods with `GRANULAR_PERMISSIONS` dictionary.
  - Strict separation of duties: Technical Admins (`ADMIN`) do NOT automatically inherit business content visibility.
  - Confidentiality classification enforcement across 5 levels (`PUBLIC_INTERNAL`, `INTERNAL`, `RESTRICTED`, `CONFIDENTIAL`, `HIGHLY_CONFIDENTIAL`).
  - Secure 404 Not Found masking to prevent resource enumeration attacks.
  - Access grant system with validity periods, revocation tracking, and automatic expiration.
- **Projects Governance**:
  - Automatic project key generation and uniqueness verification per workspace.
  - Distinct separation of Owner, Executor, and Approver roles.
  - Confidentiality-scoped database listings (`getProjectVisibilityFilter`).
- **Tasks & Subtask Materialized Hierarchy**:
  - Unlimited-depth tasks with max depth limit (10) and materialized path calculation (`/rootId/.../nodeId`).
  - Single accountable assignee with collaborator and watcher tracking.
  - Subtree reparenting with automatic depth and path recalculation.
  - Weighted progress rollup respecting required vs. optional child nodes (`calculateGovernanceProgressRollup`).
- **Database Schema & Migrations**:
  - Non-destructive, reversible SQL migration in `apps/api/prisma/migrations/20261028_phase1_foundation/migration.sql`.
  - Documented rollback script in `apps/api/prisma/migrations/20261028_phase1_foundation/rollback.sql`.
- **Test Suite Results**:
  - `@flowtrack/shared`: 130/130 passing tests (12 test suites).
  - `@flowtrack/api`: 237/237 passing tests (19 test suites, including 22 Phase 1 foundation security & governance unit tests).
  - `@flowtrack/web`: 217/217 passing tests (16 test suites).
  - Total: 584 passing tests across the entire repository. Built artifacts verified.

---

## 3. Architectural & Design Decisions (with Rationale)

1. **Organization Model & Multi-Tenancy (B.1)**:
   - *Decision*: Map `organization_id` to `workspaceId` (aliasing `Workspace` as `Organization` at the schema/domain layer) so that zero existing tables, database records, foreign keys or active live projects are broken. Every new query and model explicitly checks `workspaceId` / `organizationId`.
   - *Rationale*: Rule 1 & Rule 3 (Inspect before changing, never break or reset DB).

2. **Unlimited Task Hierarchy & Materialized Path (E.1)**:
   - *Decision*: Augment `Node` (tasks/items) with `path` (VARCHAR, e.g., `/rootId/parentId/nodeId`) and `depth` (INT). Default max depth is 10.
   - *Rationale*: Adjacency list alone causes recursive N+1 queries. Materialized path allows finding any subtree with a single `LIKE '/rootId/parentId/%'` query, indexable via B-tree.

3. **Central Authorization Service (`can(user, permission, resource)`) (B.6)**:
   - *Decision*: Create an authoritative `AuthorizationService` implementing `can(user: AuthenticatedUser, permission: Permission, resource?: ResourceContext): Promise<AuthorizationDecision>`.
   - *Rationale*: Removes scattered `if (role === 'ADMIN')` checks and ensures deny-by-default with full auditability.

4. **Confidentiality & Existence Hiding (C.4)**:
   - *Decision*: Any query for a project or task that exists but the user is not authorized to view due to confidentiality classification or absence of access grant returns `404 Not Found`, NOT `403 Forbidden`.
   - *Rationale*: Prevents information leakage and enumeration of confidential initiatives (e.g. M&A, stealth products).

5. **Technical Admins Separation (B.7)**:
   - *Decision*: Workspace administrators (`ADMIN`) do NOT inherit business content permissions (`project.view`, `task.update`, `approve.task`) automatically. They can manage tenant users, settings, and infrastructure, but must be granted explicit project membership or access grants to read business content.
   - *Rationale*: Core security requirement: separation of technical admin duties from confidential content oversight.

---

## 4. Open Questions

1. *Department Hierarchy Depth*: Can a department have multiple sub-departments?
   - *Resolution (Rule 7: safer, more restrictive)*: Yes, `Department` supports an optional `parentDepartmentId` with recursive cycle detection and depth validation ($\le 5$).

---

## 5. Known Limitations

1. Legacy task records created before Phase 1 have `depth = 0` and `path = null`; a lazy migration / backfill will compute their paths on load/touch.
2. Direct PostgreSQL stored procedures for closures are omitted in favor of Prisma-managed materialized path to maintain multi-environment compatibility (Neon, Render, Cloudflare Hyperdrive, standard Postgres).

---

## 6. Verification Commands

```bash
# Run shared domain tests
pnpm --filter @flowtrack/shared test

# Run API tests (auth, security, projects, nodes, cpm)
pnpm --filter @flowtrack/api test

# Run Web frontend tests
pnpm --filter @flowtrack/web test

# Run all test suites across the monorepo
pnpm test

# Build all packages
pnpm --filter @flowtrack/shared build
pnpm --filter @flowtrack/api build
pnpm --filter @flowtrack/web build
```
