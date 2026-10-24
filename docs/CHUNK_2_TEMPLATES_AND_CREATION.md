# Chunk 2 — Configurable Project Creation and Templates

## Executive Summary
Chunk 2 delivers a configurable, universal project creation experience for FlowTrack. Users can launch projects through three creation pathways:
1. **Universal Blank Project**: Instant setup with zero industry lock-in, customizable methodology, and international currencies.
2. **Reusable Industry Blueprints**: Versionable starter templates across 8 distinct industries (including Automobile Showroom, Real Estate, Education, Manufacturing, IT/Software, and Universal Starter). Includes an interactive blueprint preview drawer detailing stages, gates, milestones, subtasks, and suggested roles before instantiation.
3. **Safe Project Cloning**: Full, isolated deep-copying of existing projects, remapping complex node nesting hierarchies and edge dependency graphs, resetting progress and actual expenses for clean re-execution.

---

## 1. The Three Project Creation Pathways

### Pathway A: Universal Blank Canvas (No Industry Lock-In)
- **Universal Agnostic Start**: The platform never enforces selecting an industry.
- **Methodology Selection**: Stage-Gate Delivery, Agile Sprint, Linear Waterfall, or Continuous Kanban Flow.
- **Financial & Localization Configuration**: Currency selection (USD, INR, EUR, GBP, AED, SGD), date formats (`YYYY-MM-DD`, `DD/MM/YYYY`, etc.), and target handover dates.

### Pathway B: Reusable Templates (Starter Blueprints)
- **Built-in Starter Blueprints (A through F)**:
  1. **Automobile 3S Dealership & Showroom Launch** (A. New automobile showroom construction): OEM letter of intent, corporate identity fit-out, hydraulic workshop bays, staff certification, and commercial launch milestone.
  2. **Real Estate & Civil Infrastructure Township** (B. Residential real-estate development): Land survey, statutory sanctions & environmental NOC, civil substructure, MEP services, and occupancy handover.
  3. **Higher Education Academic Programme Launch** (C. Educational institution setup): Syllabus sanction, faculty appointments, laboratory compute clusters, accreditation audit, and student admissions.
  4. **Industrial Manufacturing & Plant Setup** (D. Manufacturing facility setup): Reinforced floor casting, CNC machinery power rigging, environmental safety NOC, Factory Acceptance Testing (FAT) gate, and commercial batch release.
  5. **Cloud-Native Enterprise Software Release** (E. IT/software delivery): Architecture spike & threat modeling, core microservices, design system frontend, SOC2 penetration audit, and canary rollout.
  6. **Universal Project Blueprint** (F. Blank universal starter): Charter & scope definition, execution workstream, executive quality approval gate, and delivery milestone.
  - *Plus*: Healthcare Hospital Specialty Wing & Retail Commercial Flagship blueprints.
- **Interactive Blueprint Preview**:
  - Full stage & quality gate breakdown with sequence arrows and priority badges.
  - Subtask listings.
  - Default currency and date format.
  - One-click instantiation button ("Use This Blueprint").

### Pathway C: Safe Project Cloning
- **Deep Hierarchical Copying**:
  - Two-pass node recreation guarantees child subtasks are re-linked to newly generated parent node IDs.
  - Sequence and dependency edges are dynamically remapped from old node IDs to new node IDs.
  - Progress percentages (`progressPct`) and actual metrics (`actualCost`, `actualHours`) are reset to `0` for clean execution (configurable via `resetProgress`).
  - Estimates (`estimatedCost`, `allocatedHours`), custom data attributes, priorities, and weights are preserved.
- **Tenant Isolation**:
  - Cloned projects are strictly bounded to the requesting workspace.
  - Projects belonging to other workspaces cannot be cloned or inspected.
- **Audit Logging**:
  - Every clone operation creates an immutable `AuditLog` entry documenting the source project ID, new project ID, and cloned entity count.

---

## 2. Template Model, Versioning, and Data Isolation

### Schema & Database Architecture
- `Template` model in PostgreSQL:
  - `workspaceId`: Null for global public templates; set to workspace UUID for custom tenant templates.
  - `version`: Integer version number, automatically incremented on updates.
  - `graphJson`: JSON structure containing nodes, subtasks, priorities, coordinates, weights, and dependency edges.
  - `defaultSettings`: Currency, methodology, date formats, feature toggles, and terminology.
- `Project` model:
  - `templateId`: Soft reference string to the originating template.
  - `settings`: Permanently embeds a snapshot of template settings (`templateVersion`, `templateName`, `industry`, `methodology`, `currency`).

### Complete Data Isolation Guarantee
- **Independent Project State**: Instantiating a template creates distinct rows in `projects`, `nodes`, and `edges`. Modifying or deleting a template later has **zero impact** on previously instantiated projects.
- **Cross-Workspace Protection**: Tenants can only update or delete custom templates belonging to their own workspace.

---

## 3. Authorization & Permissions (`RolesGuard`)

- **Role-Based Access Control**:
  - `@Roles(Role.ADMIN, Role.MANAGER)` protects all template mutation endpoints (`POST /templates`, `PATCH /templates/:id`, `DELETE /templates/:id`).
  - `GET /templates` and `POST /templates/:id/instantiate` are accessible to all authenticated workspace members.
  - `POST /projects/:id/clone` and `POST /projects/:id/save-as-template` verify active workspace tenancy and user creation privileges.

---

## 4. API Endpoints Reference

| Method | Endpoint | Description | Roles |
|---|---|---|---|
| `GET` | `/templates` | List public and workspace templates (filterable by industry/category) | Authenticated |
| `GET` | `/templates/:id` | Get full template blueprint with graph definition | Authenticated |
| `POST` | `/templates` | Create a new custom template | `ADMIN`, `MANAGER` |
| `PATCH` | `/templates/:id` | Update template and increment version | `ADMIN`, `MANAGER` |
| `DELETE` | `/templates/:id` | Delete a custom workspace template | `ADMIN`, `MANAGER` |
| `POST` | `/templates/:id/instantiate` | Atomically instantiate a template into an independent project | Authenticated |
| `POST` | `/projects` | Create a universal blank project | Authenticated |
| `POST` | `/projects/:id/clone` | Safely clone an existing project with fresh IDs and hierarchy | Authenticated |
| `POST` | `/projects/:id/save-as-template` | Convert an existing configured project into a reusable template | `ADMIN`, `MANAGER` |

---

## 5. Verification & Automated Test Results

Across all workspace packages (`@flowtrack/shared`, `@flowtrack/api`, `@flowtrack/web`), **56 automated tests pass**:
- `packages/shared`:
  - `template-instantiation-isolation.spec.ts`: Proves two projects created from different templates (Automobile vs. Real Estate) customize independently with zero leakage, while using universal rollup and workflow engines.
  - `template.spec.ts`: Validates Zod schemas for template graph definitions and instantiation payloads.
  - `hierarchy.spec.ts`: Validates cycle prevention and depth limits.
  - `dependencies.spec.ts`: Validates cycle detection and topological sorting.
  - `rollup.spec.ts`: Validates weighted hierarchical progress calculation.
- `apps/api`:
  - `projects.service.spec.ts`: Unit tests covering universal blank creation, deep project cloning with parent remapping, progress resetting, and tenant isolation.
  - `templates.service.spec.ts`: Unit tests covering template instantiation, version incrementing, and workspace boundary checks.
  - `roles.guard.spec.ts`: Unit tests enforcing RBAC per workspace.
- `apps/web`:
  - `permissions.spec.ts`: Role capabilities and permissions for UI buttons.
