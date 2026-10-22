# Changelog

All notable changes to the FlowTrack project will be documented in this file.

## [0.3.0] - Phase 3: Hover Card, Detail Panel, Remarks, Documents & History (2026-10-21)

### Added
- **Non-Blocking Hover Card**:
  - 300ms debounce hover card with status badge, live progress indicator, due date / countdown, last remark snippet with author, document counts, and hint.
- **Slide-Over Detail Drawer (`NodeDetailDrawer.tsx`)**:
  - **Remarks Tab**: Chronological timeline with named collaborator authorship, timestamp, voice recording support via Web Audio `MediaRecorder`, photo attachments, and 5 quick status update presets.
  - **Details Tab**: Inline title editing, description, start and due date pickers, priority selector (`LOW`, `MEDIUM`, `HIGH`, `URGENT`), weight impact slider, 0-100% progress slider, dynamic custom fields renderer, and technical metadata card.
  - **Documents Tab**: Drag-and-drop file upload zone, document listing with mime icons, version tags (`v1`), file size, uploader attribution, inline preview modal for images and PDFs, download links, and delete options.
  - **Children Tab**: Infinite sub-canvas view drill-down banner, on-demand child task creator, and child item cards with live progress, weight, and delete actions.
  - **History Tab**: Real-time audit trail displaying collaborator actions (`CREATE`, `UPDATE`, `STATUS_CHANGE`), old vs. new values, and formatted timestamps.
  - **Danger Zone**: Prominent, high-contrast task deletion with safety confirmation on node cards, drawer header, and details footer.
  - **Mobile Ergonomics**: Full-screen responsive sheet modal layout on small devices with `Escape` keyboard dismissal.
- **Backend Enhancements (`apps/api`)**:
  - Document management endpoints (`POST /nodes/:id/documents`, `GET /nodes/:id/documents`, `DELETE /nodes/documents/:docId`) with BigInt serialization.
  - Audit trail history endpoint (`GET /nodes/:id/history`).
  - Real-time audit logging on node creation, updates, and status transitions.
- **Shared Rollup Engine**:
  - 9/9 Vitest unit tests passing for weighted progress rollups, overdue calculations, and group status blocker rules.

## [0.2.0] - Phase 2: Canvas Core & n8n/Automa Workflow (2026-10-21)

### Added
- **React Flow Infinite Canvas**:
  - Universal 4-directional connection handles (Left, Right, Top, Bottom) allowing users to connect any node to any other node.
  - n8n-style floating action toolbar on hover/selection (Inspect, Add Next Step `+`, Duplicate Task, Sub-Canvas, and Delete).
  - Right-click canvas context menu for quick node actions and deletion.
  - Custom sequence edges (`FlowTrackEdge.tsx`) with mid-point `(+)` insert button to add steps between existing nodes.
  - Quick-add menu on double-click empty canvas or dragging from output handles.
  - Dual Tidy Up Auto-Layout using Dagre: "Tidy Flow" (LR) and "Tree" (TB) with multi-column card grid organization for unconnected tasks.
  - Hierarchical sub-canvas drill-down with breadcrumb navigation.

## [0.1.0] - Phase 1: Foundation (2026-10-21)

### Added
- **Monorepo Architecture**: Setup `pnpm` workspaces for `apps/api`, `apps/web`, and `packages/shared`.
- **Shared Package (`@flowtrack/shared`)**:
  - Zod validation schemas for Auth, Workspaces, Projects, Nodes, Edges, Custom Fields.
  - Pure calculation engine for weighted average progress roll-up, group status waiting rules, and overdue detection with 100% test coverage (`vitest`).
- **PostgreSQL & Prisma ORM**:
  - Complete multi-tenant relational schema supporting Workspaces, Users, Memberships, Projects, Node Types, Dynamic Field Definitions, Nodes with hierarchy, Edges, Remarks, Chat, and Documents.
  - Seed script generating default `Acme Developments` workspace, Admin user (`admin@flowtrack.dev`), Manager (`suresh@flowtrack.dev`), Member (`ramesh@flowtrack.dev`), default status sets, and built-in node types.
- **NestJS API (`apps/api`)**:
  - Modules for Auth (Email/Password, Phone OTP, JWT access tokens, RBAC roles), Workspaces, Projects, Nodes (with optimistic locking `version`), Edges, and Node Types.
  - Global CORS, validation pipes, and Swagger documentation at `/api/docs`.
- **React PWA Web Shell (`apps/web`)**:
  - Vite + React 19 + Tailwind CSS + Lucide Icons + i18next (English, Hindi, Kannada).
  - Modern high-contrast design system with theme tokens and dark mode toggle.
  - Interactive Project List dashboard with health metrics, progress bars, and template creation wizard.
  - React Flow infinite canvas studio with custom node cards, status badges, handles, and animated sequence edges.
- **CI / CD Pipeline**: GitHub Actions workflow (`.github/workflows/ci.yml`) for automated testing, linting, and build verification.
