# FlowTrack PM Governance Platform — State & Persistent Memory

## 1. Project Overview & Execution Tracking

- **Current Phase**: Phase 8 — Authentication: Sign In, Sign Up, Google, Mobile OTP, Password Reset (Completed)
- **Status**: Completed (Exit Gate Satisfied, All 637 Monorepo Unit & Integration Tests Passing)
- **Last Updated**: 2026-10-30

### Phase Roadmap
- [x] **Phase 1: Foundation (Secure Organizational Model, Projects, Unlimited-Depth Tasks, Central Auth, Confidentiality)**
- [x] **Phase 2: Workflow Governance (Task State Machine, Work Reporting & Evidence, Configurable Approvals Engine, Privileged Operations, Immutable Audit Trail)**
- [x] **Phase 3: Lifecycle Safety, Experience and Verification (Delete / Archive / Restore, Event-Driven Notifications, Workspaces & Dashboards, Full Test & Security Pass)**
- [x] **Phase 4: Risk, Governance & Multi-Methodology Support (Governance Rules & Compliance)**
- [x] **Phase 5: Real User-Facing Bug Fixes (Server-Driven Task State, Unhandled ReferenceErrors, Strict Server Authorization)**
- [x] **Phase 6: Mobile-First UI/UX Rebuild (Full-Screen Mobile Sheet, Contradictions Fixed, 10-Viewport Responsive Testing, Zero Regressions)**
- [x] **Phase 8: Production-Grade Authentication & Security (Google OAuth, +91 Verified Mobile OTP, Session Invalidation via `tokenVersion`, Mass-Assignment Lockdown)**

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

### Phase 2: Workflow Governance & Approvals Engine (Completed 2026-10-29)
- **A. Task State Machine (Data-Driven, Jira-Style Lifecycle)**:
  - 14 formal states: `Draft`, `Assigned`, `Accepted`, `In Progress`, `Blocked`, `Ready for Review`, `In Review`, `Changes Requested`, `Resubmitted`, `Approved`, `Completed`, plus `On Hold`, `Cancelled`, `Archived`.
  - Data-driven transitions table (`TASK_STATE_TRANSITIONS`) with from-states, required permissions, guards, completion validators, and post-actions.
  - Post-actions execute only after database transactions commit.
  - **Approved is NOT Completed**: `Completed` strictly requires satisfying the 8-point completion gates:
    1. Work submitted (`hasSubmission`)
    2. Mandatory evidence present (`hasMandatoryEvidence`)
    3. Required children Completed and Approved (`requiredChildrenCompletedAndApproved`)
    4. Dependencies satisfied (`dependenciesSatisfied`)
    5. Required approvals passed on current submission version (`currentApprovalsPassed`)
    6. Checklist / acceptance criteria satisfied (`checklistSatisfied`)
    7. No active blocking condition (`notBlocked`)
    8. Actor authorized for completion (`authorizedForCompletion`)
  - Live Completion Readiness API: `GET /nodes/:id/completion-readiness`.
  - Direct API calls attempting invalid transitions are rejected and audited as security events (`INVALID_TRANSITION_ATTEMPT`). Progress = 100% is never proof of completion.
  - Optimistic locking via `version` column prevents concurrent conflicting transitions (HTTP 409 Conflict).
- **B. Work Reporting and Evidence**:
  - Work updates: status, % progress, done since last update, next planned, blockers and reasons, actual start/finish, notes, links (`POST /nodes/:id/work-updates`).
  - Reporting cadence per task or project (`immediate`, `daily`, `weekly`, `milestone`).
  - Submissions are versioned and immutable (`work_submissions` table; resubmission creates `version + 1`; nothing is overwritten).
  - Attached evidence with MIME allow-list, size limits, binary magic-byte content sniffing (`validateEvidenceFile`), secure storage in `vault_storage` outside web root, SHA-256 hash tracking, and authorization/confidentiality checks on download.
- **C. Configurable Approval Engine**:
  - Dedicated relational schema: `approval_policies` (versioned), `policy_stages`, `approval_requests`, `approval_stage_instances`, `approval_decisions`.
  - Configurable policy selectors: task type, project classification, risk/impact, budget threshold, confidentiality, department, operation type (`matchApprovalPolicy`).
  - Stage modes: `SEQUENTIAL`, `PARALLEL`, `ALL_MUST_APPROVE`, `ANY_ONE_APPROVES`, `OPTIONAL`, `CONDITIONAL`.
  - Primary, backup, and authorized delegation (`delegateApproval`); automated escalation windows.
  - Outcomes: `Approved`, `Rejected` (mandatory reason), `Changes Requested` (mandatory feedback), `Withdrawn`. Only `Approved` can satisfy a stage.
  - Server-side separation of duties: submitter cannot approve own work; creator cannot bypass; one person cannot satisfy two independent sequential stages; emergency override is explicit, restricted, justified, and audited.
  - Idempotent decision recording with unique composite constraint `[approvalRequestId, approverId, submissionVersion]`.
  - Policy changes while requests are pending: bound to initial policy version (`policyVersion`); updates publish new version immutably. Material changes invalidate prior approvals and increment submission version.
- **D. Privileged Operations**:
  - Unified approval engine automates privileged operations: deadline/scope changes, budget increases over threshold, critical reassignment, release publishing, access/privilege changes, confidentiality changes, and policy exceptions.
  - Proposed changes stored in `payload` JSON, applied atomically to target entities only upon policy satisfaction.
- **E. Immutable Audit Trail**:
  - Append-only `audit_events` table recording actor, action, target type/id, timestamp, before/after values, reason, request/correlation ID, policy reference, and outcome.
  - Database trigger `trg_audit_events_immutable` and service-level checks forbid all `UPDATE` and `DELETE` operations.
  - Automatic scrubbing of passwords, tokens, API keys, and binary file content.
  - Confidentiality-aware masking of sensitive titles for unauthorized viewers (`[RESTRICTED CONTENT]`).
  - Searchable, filterable, and exportable (CSV and JSON) via `/audit/events` and `/audit/events/export`.
- **F. Verification Test Suite**:
  - Scenarios 1, 3, 4, 5, 7, 8, 10, 11, 13 verified with 22 dedicated test cases in `apps/api/src/modules/approvals/phase2-workflow-governance.spec.ts`.
  - Anti-Asana rule verified: Rejection or changes requested NEVER unblocks dependent tasks; dependent tasks remain strictly blocked until prerequisite is fully Completed & Approved.

### Phase 3: Lifecycle Safety, Experience and Verification (Completed 2026-10-29)
- **A. Delete / Archive / Restore Flow**:
  - Independent permissions: `project.archive`, `project.delete`, `project.restore` (independent of `project.edit`).
  - Impact calculation endpoint `GET /projects/:id/deletion-impact`: computes root tasks, subtasks, documents, evidence items, and cross-project external dependents.
  - Mandatory non-empty deletion reason input. Empty/whitespace reasons rejected with HTTP 400.
  - Cross-project dependency protection: Blocks project deletion if active external tasks depend on it, unless explicitly forced.
  - Soft-deletes project (`status: 'DELETED'`, `deletedAt: new Date()`) and child tasks into a recoverable trash state. Preserves audit, approval, compliance records, and shared files.
  - Trash view `GET /projects/trash` accessible only to authorized users (`project.restore`, `ADMIN`, `MANAGER`). Confidentiality filter applied.
  - Restoration flow `POST /projects/:id/restore` restores project and child tasks to `ACTIVE` and records append-only `PROJECT_RESTORED` audit event.
  - Separate, privileged permanent purge `POST /projects/:id/purge`: Restricted to Workspace Administrators, requires matching confirmation key (`project.name` or `PURGE-${project.key}`), mandatory justification, and enforces 30-day retention lock (unless explicit administrative waiver is authorized). Preserves immutable audit records.
- **B. Event-Driven Notifications Engine**:
  - Events supported: assignments, child creation, deadlines, overdue, blockers, submissions, review requests, decisions, rejections, changes requested, resubmissions, access grants, completion.
  - Confidentiality filter (Scenario 14): Masks titles to `[Confidential Initiative] Update` and sanitizes body for recipients lacking clearance, preventing secret project title leakage.
  - Deduplication via `[userId, dedupKey]` composite unique constraint.
  - Automated reminder and escalation scheduler:
    - Approaching approvals (< 24h) trigger deadline reminders to assigned approvers (`POST /notifications/cron/escalations`).
    - Overdue approval stages trigger automated escalation to `escalateToUserId` or backup approver and record `APPROVAL_ESCALATED` audit event.
    - Overdue work reminders dispatched for overdue incomplete tasks (`POST /notifications/cron/overdue-reminders`).
- **C. Real-Data Dashboards & Workspace Views**:
  - Role-aware dashboards (`reports.service.ts`): Indexed, paginated, permission-filtered queries for `ADMIN` (Executive), `MANAGER`, `TEAM_LEAD`, and `MEMBER`.
  - 6 Unified Project Workspace Views (`WorkspaceViews.tsx`):
    1. **Canvas View**: Interactive ReactFlow canvas with node drag, connections, and critical path highlighting.
    2. **List View**: Hierarchical table with state badges, priority, assignee, due date, progress %, confidentiality badges.
    3. **Board View (Kanban)**: Columns for `Draft`, `In Progress`, `Blocked`, `In Review`, `Approved`, `Completed`.
    4. **Tree View**: Expandable/collapsible task breakdown structure showing deep nesting, subtask counts, and progress rollups.
    5. **Timeline View (Gantt)**: Chronological task schedule with progress bars and milestone indicators.
    6. **Calendar View**: Grid mapping tasks and deliverables to due dates.
  - Task Detail Drawer (`NodeDetailDrawer.tsx`):
    - Live **Completion Readiness Panel** displaying real-time pass/fail status across the 8 gates.
    - Evidence items list with categories, download links, size, and magic bytes verification.
    - Submission history with notes and timestamps.
    - Review panel with Approve / Reject / Request Changes actions.
    - Append-only **Immutable Audit Trail** tab showing event history.
  - Deletion Impact Modal (`ProjectDeleteImpactModal.tsx`) and Trash Recovery Modal (`TrashProjectsModal.tsx`).
- **D. Full Test & Security Pass**:
  - Scenarios 2, 6, 9, 12, 14, 15 verified with 20 dedicated test cases in `apps/api/src/modules/projects/phase3-lifecycle-safety.spec.ts`.
  - IDOR security sweep verified: cross-organization / foreign-tenant project access strictly returns HTTP 404.
  - Mass assignment prevention verified: system columns (`workspaceId`, `deletedAt`, `version`) cannot be overridden via PATCH.
  - Safe error masking verified: database internals and stack traces are never leaked in error responses.

---

## 3. Test Suite Verification Checklist (Exit Gate)

| Package | Test Suites | Tests | Status |
| :--- | :---: | :---: | :---: |
| **`@flowtrack/shared`** | 12 | 130 | **130 / 130 Passed** |
| **`@flowtrack/api`** | 21 | 279 | **279 / 279 Passed** |
| **`@flowtrack/web`** | 16 | 217 | **217 / 217 Passed** |
| **Total Monorepo Suite** | **49** | **626** | **626 / 626 Passed (0 Failures)** |

### Master Spec 15-Scenario Complete Traceability Matrix

- [x] **Scenario 1: Approver Delegation** (Phase 2 — `phase2-workflow-governance.spec.ts`)
- [x] **Scenario 2: Project Deletion Flow & Trash Visibility** (Phase 3 — `phase3-lifecycle-safety.spec.ts`)
- [x] **Scenario 3: Executive Multi-Stage Approval** (Phase 2 — `phase2-workflow-governance.spec.ts`)
- [x] **Scenario 4: Rejection and Resubmission Versioning** (Phase 2 — `phase2-workflow-governance.spec.ts`)
- [x] **Scenario 5: Unauthorized Approvals & Separation of Duties** (Phase 2 — `phase2-workflow-governance.spec.ts`)
- [x] **Scenario 6: Role-Based Project Archive & Restore** (Phase 3 — `phase3-lifecycle-safety.spec.ts`)
- [x] **Scenario 7: Parent Task Completion Gates** (Phase 2 — `phase2-workflow-governance.spec.ts`)
- [x] **Scenario 8: Invalid Transitions & Security Violations** (Phase 2 — `phase2-workflow-governance.spec.ts`)
- [x] **Scenario 9: Cross-Project Dependency Protection** (Phase 3 — `phase3-lifecycle-safety.spec.ts`)
- [x] **Scenario 10: Policy Versioning & Immutability** (Phase 2 — `phase2-workflow-governance.spec.ts`)
- [x] **Scenario 11: Concurrency & Optimistic Locking** (Phase 2 — `phase2-workflow-governance.spec.ts`)
- [x] **Scenario 12: Permanent Purge Privilege & Retention Enforcement** (Phase 3 — `phase3-lifecycle-safety.spec.ts`)
- [x] **Scenario 13: Audit Trail Integrity & Redaction** (Phase 2 — `phase2-workflow-governance.spec.ts`)
- [x] **Scenario 14: Confidentiality Filter on Notifications** (Phase 3 — `phase3-lifecycle-safety.spec.ts`)
- [x] **Scenario 15: Approval Escalation & Reminder Scheduler** (Phase 3 — `phase3-lifecycle-safety.spec.ts`)

---

## 4. Phase 6: Mobile-First UI/UX Rebuild (Completed 2026-10-29)

### Key Architectural & UX Transformations
1. **Foundations**:
   - Safe-area CSS utilities (`pt-safe`, `pb-safe`) and 16px minimum font size for mobile inputs to prevent automatic iOS Safari viewport zoom.
   - Design tokens verified across WCAG AA contrast ratios ($> 4.5:1$ text contrast, dark mode tested).
2. **App Shell & Responsive Navigation**:
   - Organization/Workspace switcher accessible on all mobile screen widths in top bar.
   - Dedicated fixed bottom navigation bar on mobile (`#mobile-bottom-nav`) with 4 touch-friendly tabs (`Projects`, `My Tasks`, `Alerts`, `Menu`) having $\ge 44\times 44$px touch targets.
   - Role badges, language toggles, theme switches, and logout cleanly grouped into Avatar Menu.
3. **Canvas Studio & Toolbar**:
   - Automatic default to `'list'` card view on viewports $< 768$px, with mobile floating action button (`#mobile-fab-add-task-btn`) for task creation.
   - Consolidated single project title (no duplicate title strings or breadcrumb redundancies).
   - Removed duplicate Critical Path and Fit View buttons from filter row; cleaned "+ +Add Task" label.
   - Fixed stuck "Saving..." indicator via recursive flush and 3.5s auto-reset safety guard.
4. **Task Details Drawer (Mobile Sheet)**:
   - Full-width mobile sheet on phones ($< 768$px), max 520px side drawer on desktop.
   - Wrapped 2-line title (`line-clamp-2`), safe from mobile browser address bar clipping.
   - 4 short tabs: `Details`, `Work`, `Approvals`, `History` with horizontal no-scrollbar scrolling.
   - Sticky bottom action bar (`#mobile-drawer-primary-action`) showing ONE clear primary action per state.
   - Fixed all UX contradictions:
     - "Task Approved & Completed" banner strictly guarded by `node.state === 'Completed'`.
     - 0/0 Checklist displays "No checklist required" instead of contradictory "✓ Satisfied".
     - Removed legacy status dropdown; state badge is single source of truth.
     - Members (Maya) see Priority, Reviewer, and Assignee as read-only cards, avoiding failed dropdown attempts.
5. **Views Overhaul**:
   - **List View**: Mobile card layout with touch cards (`min-h-[48px]`) showing title, status pill, assignee avatar, and due date. Desktop dense sortable table retained.
   - **Board View**: Mobile horizontal snap-scrolling (`snap-x snap-mandatory`, 85vw columns) with touch "Move to..." dropdown on cards.
   - **Timeline View**: Mobile chronological list with relative due dates ("Due in 2 days", "Overdue by 1 day").
6. **Automated Verification & Artifacts**:
   - Before and after screenshots captured across 10 viewports + 200% zoom in `docs/pm-platform/ui-screenshots/`.
   - Comprehensive test suite `e2e/phase6-mobile-ui.spec.ts` passing 14/14 tests.
   - Zero horizontal overflow (`document.documentElement.scrollWidth <= window.innerWidth`) verified at all 10 viewports.

### Phase 8: Production-Grade Authentication & Security (Completed 2026-10-30)
- **A. Sign-In Security & Uniform Latency**:
  - Dummy `bcrypt.compare` on non-existent accounts ensures uniform response latency, mitigating email enumeration attacks.
  - Uniform generic error: `"Invalid email or password"` for all credential failures.
  - Session invalidation via `user.tokenVersion`: Changing passwords or requesting password resets increments `tokenVersion`, instantly terminating all active JWT sessions.
- **B. Mobile Phone Verification (+91 Indian Format)**:
  - Phone numbers strictly validated to `+91[6-9]\d{9}`.
  - Modular SMS provider architecture (`ConsoleProvider` in dev, `Msg91Provider` for production DLT).
  - Rate limiting & bot defenses: 45s resend cooldown, 5 sends/hr/phone, 10 sends/hr/IP, 500 daily global cap, 5-attempt challenge lockout.
  - Single-use `PhoneVerificationProof` (15-min TTL) cryptographically verified and consumed on registration.
- **C. Strict Role Enforcement & Mass-Assignment Lockdown**:
  - Public registration unconditionally assigns `Role.MEMBER`.
  - Client attempts to supply `role` or `requestedRole` are discarded by server-side DTO validation.
  - Role promotion is restricted to platform administrators via `PATCH /users/:id/role`.
- **D. Google OAuth & Identity Linking**:
  - Validates Google ID tokens with public key signature, audience, and `email_verified: true` checks.
  - Auto-links Google identities to existing accounts with verified matching emails.
  - New Google signups require phone verification before account creation.
- **E. Password Recovery**:
  - Anti-enumeration response: `"If an account exists with this email, password recovery instructions have been dispatched."`
  - 30-minute single-use reset tokens stored as SHA-256 hashes.
- **F. Full Audit Trail**:
  - All auth lifecycle events (`USER_REGISTERED`, `LOGIN_SUCCESS`, `LOGIN_FAILED`, `OTP_DISPATCHED`, `OTP_VERIFIED`, `PASSWORD_RESET_REQUESTED`, `PASSWORD_RESET_COMPLETED`, `GOOGLE_LINKED`) logged to immutable audit trail.
  - Zero sensitive credentials (passwords, OTPs, tokens) stored in audit payloads.

---

## 5. Production Build Verification

```bash
# All builds executed cleanly:
@flowtrack/shared: dist/index.js, dist/index.mjs, dist/index.d.ts (tsup)
@flowtrack/api: nest build server production bundle
@flowtrack/web: vite v6.4.4 build (dist/index.html, assets, gzip verified)
```

---

## 6. Honest List of Limitations & Current Scope Boundaries

1. **SMS Provider Setup**: Local development and testing utilize the in-memory/console provider. Production deployment requires setting `MSG91_AUTH_KEY` or `ALLOW_CONSOLE_SMS_IN_PRODUCTION=true`.
2. **Google OAuth Client Credentials**: Google authentication requires `GOOGLE_CLIENT_ID` in production matching the registered domain in Google Cloud Console.
3. **Email Dispatcher**: External SMTP/SES integration is configured via environment variables and falls back safely to in-app delivery when unconfigured.
4. **Object Storage**: Evidence upload validates magic bytes and hashes into local secure vault (`vault_storage`); S3/GCS bucket adapters are ready for plug-in via environment configuration.

---

## 7. Exit Gate Satisfied

> [!IMPORTANT]
> **Exit Gate Satisfied**: Phase 8 — Authentication: Sign In, Sign Up, Google, Mobile OTP, Password Reset is verified and passing. All 637 monorepo tests pass cleanly with 0 regressions. Full verification details are documented in `docs/pm-platform/AUTH_REPORT.md` and operations in `docs/pm-platform/OWNER_HANDBOOK.md`.
