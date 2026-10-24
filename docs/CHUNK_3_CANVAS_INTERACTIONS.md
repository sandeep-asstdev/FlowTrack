# Chunk 3 — Universal Visual Workflow Canvas Specification

## Overview

The Universal Visual Workflow Canvas delivers a configurable, industry-agnostic interactive canvas built upon React Flow. It allows organizations across construction, education, automotive, retail, software, healthcare, or any custom sector to visualize, organize, structure, and govern project work without altering underlying canvas code.

---

## 1. Node & Edge Configuration Model

### Node Classifications Supported
1. **Stage / Phase Groups (`isGroup: true`, `nodeTypeKey: 'stage'`):**
   - Represents high-level organizational phases (e.g. *Academic Term* in education, *Substructure* in civil engineering, *Showroom Tier* in automotive).
   - Supports sub-canvas drill-down with persistent breadcrumb navigation.
2. **Tasks & Subtasks (`nodeTypeKey: 'task'`):**
   - Operational work items with assignees, live presence indicators, due dates, countdowns, progress percentage, and remarks counter.
   - Subtasks nest hierarchically under stages or parent tasks.
3. **Milestones (`isMilestone: true`, `nodeTypeKey: 'milestone'`):**
   - Distinct amber diamond badge and flag icon indicating critical project checkpoints, deadlines, or client handovers.
4. **Approval Gates (`isApprovalGate: true`, `nodeTypeKey: 'approval'`):**
   - Formal sign-off checkpoints with status badges (`Pending Sign-Off`, `Sign-Off Granted`, `Rework Required`).
   - Integrated with role-based manager approval workflows.

### Edge Relationship Types Supported
1. **Enforced Blocking Dependency (`kind: 'dependency'`):**
   - Amber stroke (`#f59e0b`) with animated dash and `🔒 Blocking Dependency` badge.
   - Enforces workflow progression: source task must reach `done` status before dependent task can begin.
   - Triggers `waitingCount` blocker alerts on the target node.
2. **Standard Sequence Flow (`kind: 'sequence'`):**
   - Solid blue stroke (`#3b82f6`) with directional arrowhead.
   - Indicates chronological operational progression without hard-locking status transitions.
3. **Informational Association (`kind: 'related'`):**
   - Subtle dotted slate stroke (`#94a3b8`).
   - Links related tasks for context without creating blocking cycle constraints.

---

## 2. Supported Canvas Interactions

| Interaction | Trigger / Gesture | Behavior & Safeguards |
| :--- | :--- | :--- |
| **Search & Keyword Filter** | `Ctrl+F` or Search Input | Live text query across task title, description, and assignee name. Dims non-matching nodes to `0.22` opacity with grayscale to preserve spatial graph context. |
| **Multi-Facet Filtering** | Dropdowns / Filter Chips | Filter simultaneously by Status (`all`, `active`, `blocked`, `done`), Node Type (`all`, `task`, `stage`, `milestone`, `approval`), and Priority (`all`, `URGENT`, `HIGH`, `MEDIUM`, `LOW`). |
| **Connection Creation** | Drag from Node Handle | Validates connection via DFS cycle detection (`validateDependencyEdge`). Rejects self-loops and circular cycles with human-readable error toast. |
| **Midpoint Node Insertion** | Click `+` on Edge Midpoint | Splits edge: creates new node at midpoint, severs previous edge, and automatically creates `source -> new` and `new -> target` edges. |
| **Hierarchical Drill-Down** | Double-click Stage / "Drill Down" | Navigates into nested sub-canvas level. Updates interactive breadcrumb trail at top of studio. |
| **Safe Node Deletion** | `Delete` / `Backspace` / Trash icon | Prompts confirmation modal displaying count of nested children and affected connections before executing deletion. |
| **Node Duplication** | `Ctrl+D` or Context Menu | Clones node configuration, priority, and metadata with offset positioning `(+50, +50)`. |
| **Position Persistence** | Drag & Drop Node | Debounced persistence to backend API (`ApiClient.updateNode`) on drag release, with live `Saving...` / `Saved` indicator. |
| **Tidy Hierarchical Auto-Layout** | "Tidy Flow" / "Tree" Button | Applies Dagre hierarchical layout in either Horizontal (`LR`) or Vertical Tree (`TB`) orientations. (Restricted to authorized roles). |
| **Empty State Quick Actions** | Center Overlay | When canvas has 0 nodes, presents quick-action cards to instantiate first Stage, Task, Milestone, or Approval Gate. |
| **Mobile Bottom Sheet Creation** | Floating Action Button | Allows touch-friendly task creation positioned at the center of the mobile viewport. |

---

## 3. Unsupported / Prevented Interactions

| Prevented Action | Guard Mechanism | Rationale |
| :--- | :--- | :--- |
| **Self-Dependency Connection** | `validateDependencyEdge` & `isValidConnection` | Connecting a task to itself creates an immediate paradox. |
| **Duplicate Edge Creation** | Existing edge check | Prevents redundant parallel edges between identical nodes. |
| **Circular Dependency Loop** | Directed DFS cycle detection (`cyclePath`) | Prevents deadlocks (e.g. `Task A -> Task B -> Task C -> Task A`). |
| **Unauthorized Workflow Editing** | `RolePermissions` (`canEditProject`) | Viewers and Guests cannot drag nodes, connect edges, or delete tasks (`nodesDraggable=false`, `nodesConnectable=false`). |
| **Unauthorized Layout Design Alteration** | `RolePermissions` (`canEditLayout`) | Super Admin exclusive for global auto-organization. |
| **Direct Deletion of Nodes with Children** | Confirmation Intercept | Deletion of a stage without warning would orphan or delete child tasks without user awareness. |

---

## 4. Test Verification Summary

- **Total Monorepo Tests Passing:** 68 / 68
  - `packages/shared`: 39 unit tests (hierarchy, dependencies, custom fields, workflow, rollups, templates)
  - `apps/api`: 14 tests (projects, templates, roles guard)
  - `apps/web`: 15 tests (permissions, canvas core operations & interaction tests)
- **Production Build Status:** `@flowtrack/web` and `@flowtrack/api` compile cleanly with 0 TypeScript or bundling errors.
