# Chunk 5 — Custom Fields, Dynamic Forms, and Industry Adaptability

## Overview

FlowTrack now provides a safe, production-grade, configurable custom-field architecture. Authorized users (Administrators and Managers) can define, organize, localize, and enforce custom metadata fields across **Projects**, **Stages**, and **Tasks/Nodes** without requiring database schema migrations or frontend code modifications.

---

## 1. Domain Model & Separation of Concerns

```
Workspace
  └── FieldDefinition[] (workspaceId, targetType, fieldKey, label, labelI18n, type, validation, visibilityRules, editableRoles, version, isActive)
        │
        ├── Target: 'project' ──> Project.customData (JSONB)
        ├── Target: 'stage'   ──> Node (type: 'stage').customData (JSONB)
        └── Target: 'task'    ──> Node (type: 'task').customData (JSONB)
```

- **Definition Storage**: Separate `FieldDefinition` model in PostgreSQL (`field_definitions` table).
- **Value Storage**: `custom_data` JSONB columns on `Project` and `Node`.
- **Target Types Supported**: `'project' | 'stage' | 'task' | 'node'`.

---

## 2. Supported Field Types (11 Initial Types)

| Field Type | Data Format | Validation & Constraints |
|---|---|---|
| `text` | `string` | `minLength`, `maxLength`, safe regex `pattern` |
| `longtext` | `string` | `minLength`, `maxLength` |
| `number` | `number` | `min`, `max`, `decimalPlaces` |
| `currency` | `{ amount: number, currency: string }` | `min`, `max`, currency code |
| `date` | ISO 8601 string (`YYYY-MM-DDTHH:mm:ss.sssZ`) | `minDate`, `maxDate` |
| `boolean` | `boolean` | Strict boolean coercion |
| `select` | `string` | Choice membership (`choices` array), `allowCustom` |
| `multiselect` | `string[]` | Choice membership, `minItems`, `maxItems` |
| `user` | UUID string (`User.id`) | Workspace member reference |
| `team` | UUID string (`Team.id` / group) | Team or collaborative group |
| `link` / `url` | URL string | Safe HTTP/HTTPS protocol validation |
| `file` / `document`| Storage key / URL string | Document reference |

---

## 3. Security, Safety, and Backend Validation

1. **No Unsafe Formulas or Script Execution**:
   - Conditional field visibility is strictly declarative via `VisibilityRuleDto`:
     - Operators: `equals`, `not_equals`, `contains`, `greater_than`, `less_than`, `is_empty`, `is_not_empty`.
     - Evaluated purely via static branching logic; no `eval()`, `new Function()`, or dynamic code execution.
2. **Backend Validation Engines**:
   - `ProjectsService.createProject` & `updateProject` validate project-level fields.
   - `NodesService.createNode` & `updateNode` validate node-level fields against workspace-level and node-type-level definitions.
   - Rule 3 Gate: Prevents transitioning tasks to `done` if required fields are missing.
3. **Role-Based Modification Restrictions**:
   - Field definitions can restrict editing to specific roles via `editableRoles` (e.g. `['ADMIN', 'MANAGER']`).
   - If an unauthorized role attempts to mutate a guarded field, the backend rejects the update.
   - The UI disables guarded inputs and displays a lock with the required role badge.
4. **Versioning & Soft-Retirement**:
   - Each `FieldDefinition` has an auto-incrementing `version` number.
   - Fields can be soft-retired (`isActive: false`).
   - Retired fields retain legacy values in existing records without corrupting data or failing validation.
5. **Localization Without Identifier Corruption**:
   - The underlying `fieldKey` is immutable and normalized.
   - `labelI18n` stores localized labels (e.g. `{ es: 'Contratista', de: 'Hauptauftragnehmer' }`).
   - `getLocalizedFieldLabel(field, locale)` resolves the appropriate label dynamically.

---

## 4. Industry Adaptability Verification

The custom-field engine was verified with tests against three distinct industry domains:

### 1. Construction Engineering
- `contractor`: Short text, required, validated for length, localized in Spanish and German.
- `inspectionDate`: Date field for municipal site inspections.
- `budgetAllocation`: Currency field formatted with amount and currency code.

### 2. Automotive Dealership
- `brandApprovalReference`: Short text validated against OEM format regex (`^[A-Z]{3}-[0-9]{4}$`).
- `showroomReadiness`: Single-select field with constrained choices (`Pending Review`, `Staged & Prepped`, `VIP Unveiling Approved`, `Archived`).

### 3. Higher Education & Accreditation
- `accreditationDeadline`: Target completion date for regulatory review.
- `department`: Single-select academic department.
- `classroomReadiness`: Boolean lab and classroom readiness signoff.

---

## 5. UI Components Delivered

1. **`DynamicCustomFieldsForm.tsx`**:
   - Generic form component rendering all 11 field types.
   - Handles section grouping, help tooltips, localized labels, validation errors, and conditional visibility in real time.
2. **`FieldConfigurationModal.tsx`**:
   - Administrator management modal for creating, updating, archiving, and configuring custom fields.
   - Accessible from both the Project Dashboard and the Canvas Studio header.
3. **Canvas & Project Integrations**:
   - `NodeDetailDrawer.tsx` and `NodeViewDetailsModal.tsx` render dynamic custom fields.
   - `CreateProjectModal.tsx` supports project-level custom fields during project instantiation.
   - `ProjectReportModal.tsx` exports custom fields in CSV and displays custom metadata cards.

---

## 6. Test Coverage

- **`@flowtrack/shared`**: 60/60 tests passing (includes custom fields validator suite, dependencies, hierarchy, rollup, workflow).
- **`@flowtrack/api`**: 30/30 tests passing (includes field definitions CRUD, role guards, node validation, project custom fields).
- **`@flowtrack/web`**: 31/31 tests passing (includes industry test cases, visibility rules, role guards, version compatibility).
- **Total**: 121 automated tests passing across the monorepo.
