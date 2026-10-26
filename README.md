# FlowTrack — Universal Canvas Project Management Platform

FlowTrack is an enterprise-grade, visual canvas project management platform built for cross-industry adaptability. It combines intuitive infinite-canvas workflow modeling with strict stage-gate governance, multi-regional internationalization, real-time collaboration, and budget intelligence.

---

## Architecture Overview

```
flowtrack-monorepo/
├── apps/
│   ├── api/             # NestJS 10 backend REST & WebSocket API, Prisma ORM
│   └── web/             # React 19, Vite 6, @xyflow/react canvas, Tailwind CSS
├── packages/
│   └── shared/          # Pure TypeScript domain logic, Zod validation schemas, formatters
├── docs/                # Comprehensive milestone and architectural specifications
│   ├── CHUNK_0_AUDIT_AND_PLAN.md
│   ├── CHUNK_2_TEMPLATES_AND_CREATION.md
│   ├── CHUNK_3_CANVAS_INTERACTIONS.md
│   ├── CHUNK_4_TASK_WORKFLOW_RULES.md
│   ├── CHUNK_5_CUSTOM_FIELDS_AND_ADAPTABILITY.md
│   ├── CHUNK_6_FILES_AUDIT_NOTIFICATIONS.md
│   ├── CHUNK_7_DASHBOARDS_REPORTS_BUDGET.md
│   ├── CHUNK_8_RELEASE_READINESS.md
│   └── DOMAIN_MODEL.md
├── DEPLOYMENT.md        # Production operations & deployment guide
└── README.md
```

---

## Core Capabilities Across 8 Implementation Chunks

1. **Universal Domain Model & Hierarchy (Chunk 1)**: Directed Acyclic Graph (DAG) canvas validation, cycle prevention, parent-child work breakdown structures, and rollup calculations.
2. **Universal Templates & Cloning (Chunk 2)**: 9 industry-tailored templates (Construction, Education, Healthcare, Automotive, Manufacturing, Retail, Marketing, Government, IT) with isolated graph cloning and zero cross-tenant contamination.
3. **Canvas Interactions & Micro-Interactions (Chunk 3)**: Drag-and-drop hierarchy parenting, auto-layout tidy up, multi-node grouping, and custom canvas nodes/edges.
4. **Task Workflows & Stage-Gate Governance (Chunk 4)**: Milestone gates, dependency completion enforcement, required field verification, evidence attachment checks, root-cause blocker logging, and deadline extension requests.
5. **Dynamic Custom Fields & Adaptability (Chunk 5)**: Type-safe dynamic fields (short text, number, currency, date, boolean, single/multi select, user/team ref, URL, doc ref) with backend validation and role-based editability.
6. **Files, Audit Trail & Real-Time Collaboration (Chunk 6)**: Secure vault storage with prohibited executable blocking (`.exe`, `.bat`, `.sh`, `.ps1`), deduplicated notifications, audit history with before/after state diffs, and Socket.io canvas synchronization.
7. **Universal Dashboards & Budget Tracking (Chunk 7)**: Adaptive KPI metrics, milestone roadmaps, team workload capacity, budget variance tracking, and forecast final cost (EAC) strictly separated from physical work completion. Multi-format CSV export and print-ready dossiers.
8. **Internationalization, Security & Release Readiness (Chunk 8)**: Full multi-lingual interface (English, Hindi, Kannada) with locale-aware date, number, and currency formatting; role escalation and self-approval security guards; live health checks (`/api/v1/health`); and 171 automated tests across all packages.

---

## Prerequisites

- **Node.js**: v20.x or higher
- **Package Manager**: `pnpm` v9.x or higher (`npm install -g pnpm`)
- **Database**: PostgreSQL 15+ (Local or Docker)
- **Cache/Queue**: Redis 7+ (Local or Docker)

---

## Quick Start (Development)

### 1. Clone & Install Dependencies
```bash
git clone https://github.com/company/flowtrack.git
cd flowtrack
pnpm install
```

### 2. Environment Configuration
Copy `.env.example` templates:
```bash
# Root environment
cp .env.example .env

# Backend API environment
cp apps/api/.env.example apps/api/.env

# Web Frontend environment
cp apps/web/.env.example apps/web/.env
```

### 3. Database Migration & Seed
```bash
# Generate Prisma Client & apply schema
pnpm --filter @flowtrack/api prisma:push

# (Optional) Seed initial demo data
pnpm --filter @flowtrack/api prisma:seed
```

### 4. Build Shared Package
```bash
pnpm --filter @flowtrack/shared build
```

### 5. Start Development Servers
```bash
# Run both Backend API and Web Frontend concurrently:
pnpm dev:all

# Or run individually:
pnpm dev:api    # Starts API on http://localhost:3001
pnpm dev:web    # Starts Web App on http://localhost:5173
```

---

## Test Suite Execution

The repository maintains 100% passing test coverage across domain logic, security rules, and end-to-end workflows:

```bash
# Run full monorepo test suite (171 tests across 26 test files)
pnpm test

# Run tests by workspace package
pnpm --filter @flowtrack/shared test   # 80 tests
pnpm --filter @flowtrack/api test      # 53 tests
pnpm --filter @flowtrack/web test      # 38 tests
```

---

## Building for Production

```bash
# Builds shared declarations, compiled NestJS server, and minified Vite frontend
pnpm build
```

For production deployment instructions, Docker configurations, and environment variable references, see **[`DEPLOYMENT.md`](file:///c:/Users/User/Desktop/Project-managment-app/DEPLOYMENT.md)**.
