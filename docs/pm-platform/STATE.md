# FlowTrack PM Governance Platform — State & Persistent Memory

## 1. Project Overview & Execution Tracking

- **Current Phase**: Phase 1 — Foundation
- **Status**: In Progress
- **Last Updated**: 2026-10-28

### Phase Roadmap
- [ ] **Phase 1: Foundation (Secure Organizational Model, Projects, Unlimited-Depth Tasks, Central Auth, Confidentiality)**
- [ ] Phase 2: Workflow & Approvals Engine
- [ ] Phase 3: Resource Management, Scheduling & Baselining
- [ ] Phase 4: Risk, Governance & Multi-Methodology Support
- [ ] Phase 5: Reporting, Analytics & Executive Portals

---

## 2. Completed Phases

*(None yet — Phase 1 currently in progress)*

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
