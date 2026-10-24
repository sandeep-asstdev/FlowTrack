# Chunk 7: Universal Dashboards, Reports and Budget Tracking

## Overview
Chunk 7 delivers an adaptive, high-performance reporting and analytics system that dynamically configures itself to any project methodology, industry template, and organizational settings. It strictly isolates physical task progress from financial expenditure, calculates budget variance and forecast cost (EAC) without inventing data or silently defaulting missing values to zero, supports role-based confidentiality, and enables one-click CSV and print-ready dossiers.

---

## Key Capabilities

### 1. Universal Industry Adaptation
The reporting engine dynamically adapts labels, badges, and view sections based on `project.settings.industry` and `project.settings.terminology`:
- **Construction & Real Estate**: Displays "Phase / Work Package", "Construction Task", "Key Handover Milestone", with budget variance and contingency reserves.
- **Education & Academics**: Displays "Academic Phase", "Curricular / Admin Task", "Accreditation Milestone", tracking accreditation gates and faculty review queues.
- **Healthcare & Hospital**: Displays "Clinical / Setup Phase", "Compliance Task", "NABH / Regulatory Gate".
- **IT & Software**: Displays "Sprint / Epic", "Story / Feature", "Release Milestone".

### 2. Physical vs. Financial Completion Separation
- **Physical Progress (%)**: Weighted average of task completion percentages (`progressPct * weight / totalWeight`).
- **Financial Spend (%)**: Computed independently as `(actualExpenditure / approvedBudget) * 100` (or `null` if unconfigured).
- *Critical Principle*: High expenditure does not artificially inflate physical work completion, and completed work without recorded costs does not invent false financial values.

### 3. Financial Variance and Forecast Calculations
- **Approved Budget**: Baseline project budget configured in `project.settings.budgetConfig.approvedBudget`.
- **Actual Expenditure**: Sum of verified actual costs on tasks (`node.actualCost`).
- **Forecast Final Cost (Estimate at Completion / EAC)**: Calculated as:
  $$\text{EAC} = \text{Actual Expenditure} + \sum (\text{Remaining Estimated Costs for Incomplete Nodes})$$
- **Budget Variance**:
  $$\text{Variance} = \text{Approved Budget} - \text{Forecast Final Cost}$$
  - Favorable (positive): Projected under budget.
  - Unfavorable (negative): Projected cost overrun.
- **Contingency Reserve**: Buffer budget that automatically reflects absorption of unfavorable variance.
- **Handling of Missing Values**: If financial tracking is disabled or costs are unentered, values are explicitly reported as `null` / "Not specified" rather than misleading false zeros.

### 4. Comprehensive Views & Analytics Tabs
1. **Executive Overview**: High-level KPI cards, physical completion gauge, stage breakdown cards, and milestone health summary.
2. **Milestones & Deadlines**: Roadmap of key handover and accreditation gates with due date countdowns (`daysRemaining`), overdue indicators, deliverable counts, and approval decisions.
3. **Budget & Financial Variance**: Live variance tracker, side-by-side comparison of physical work vs financial spend, and stage-by-stage cost breakdown table.
4. **Team Workload**: Assignee distribution showing total tasks, open tasks, completed tasks, overdue items, logged vs allocated hours, and capacity utilization %.
5. **Overdue & Blocked Work**: Root-cause blocker log with reporter justification, plus overdue critical path tasks.
6. **Pending Approvals**: Sign-off queue for managers and designated reviewers.

### 5. Multi-format Export & Print
- **CSV Export**: Clean downloadable CSVs for Tasks Dossier, Milestones Roadmap, Financial Dossier, and Team Workload (`/api/workspaces/:workspaceId/reports/export/:projectId?type=...`).
- **Print Dossier**: Integrated `@media print` styling for executive briefing and audit PDF generation.

---

## Endpoints & APIs

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/workspaces/:workspaceId/reports/project/:projectId` | Retrieves full adaptive metrics, milestones, workload, and financial variance |
| `GET` | `/api/workspaces/:workspaceId/reports/workspace` | Cross-project workspace portfolio summary for authenticated user |
| `GET` | `/api/workspaces/:workspaceId/reports/export/:projectId` | Generates formatted CSV payload for tasks, milestones, financials, or workload |

---

## Automated Test Coverage

- **`packages/shared`** (`reports.spec.ts`):
  - Construction scenario with budget variance, forecast EAC, and milestone handover calculations.
  - Education scenario with accreditation milestones, pending approvals, and unconfigured financials (verifying zero false zeros).
  - Physical completion vs financial spend independence tests.
  - Filter criteria tests (date ranges, assignees, status categories).
  - Localized currency formatting and CSV generation tests.
- **`apps/api`** (`reports.service.spec.ts`):
  - Workspace authorization guards.
  - Member vs Manager financial confidentiality masking.
  - Valid CSV file generation.
- **`apps/web`** (`reports.spec.ts`):
  - Filter payloads and report query integration.
  - Workspace report summary handling.

Monorepo status: **157/157 tests passing**.
