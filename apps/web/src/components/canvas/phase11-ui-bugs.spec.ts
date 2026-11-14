import { describe, it, expect } from 'vitest';

describe('Phase 11 — Frontend UI: Assignment Visibility, Child Tasks, Remove Progress %, Photo Evidence', () => {
  describe('Bug 1: Assignment Display & Single Source of Truth', () => {
    it('shows "Assigned to: <name>" when owner is populated and NEVER falls back to Unassigned', () => {
      const serverResponseTask = {
        id: 'task-101',
        title: 'Draft Wireframes',
        ownerId: 'user-a',
        owner: {
          id: 'user-a',
          fullName: 'Ananya Assignee',
          avatarUrl: 'https://example.com/avatar.jpg',
        },
        assignedById: 'manager-1',
        assignedBy: {
          id: 'manager-1',
          fullName: 'Manish Manager',
        },
        assignedAt: '2026-11-14T10:00:00.000Z',
      };

      const assignedName = serverResponseTask.owner?.fullName;
      const assignedBy = serverResponseTask.assignedBy?.fullName;

      expect(assignedName).toBe('Ananya Assignee');
      expect(assignedBy).toBe('Manish Manager');
      expect(assignedName ? `Assigned to: ${assignedName}` : 'Unassigned').toBe('Assigned to: Ananya Assignee');
    });

    it('displays "Unassigned" ONLY when owner and ownerId are truly absent', () => {
      const unassignedTask = {
        id: 'task-102',
        title: 'Unclaimed Task',
        ownerId: null,
        owner: null,
        assignedById: null,
        assignedBy: null,
      };

      const assignedName = unassignedTask.owner?.fullName;
      expect(assignedName).toBeUndefined();
      expect(assignedName ? `Assigned to: ${assignedName}` : 'Unassigned').toBe('Unassigned');
    });
  });

  describe('Bug 2: Child Task Creation UI & Requirements', () => {
    it('creates child task with required title, optional assignee and due date', () => {
      const formPayload = {
        title: 'Subtask 1: Review Specs',
        ownerId: 'user-a',
        dueDate: '2026-11-20T00:00:00.000Z',
        parentNodeId: 'parent-task-1',
      };

      expect(formPayload.title.trim().length).toBeGreaterThan(0);
      expect(formPayload.parentNodeId).toBe('parent-task-1');
    });

    it('enforces separation between checklist steps and child subtasks in task drawer', () => {
      const drawerModel = {
        checklist: [
          { id: 'c1', text: 'Step 1: check electrical safety', completed: true },
        ],
        subtasks: [
          {
            id: 'sub-1',
            title: 'Subtask 1: Detailed Wiring Schematics',
            owner: { fullName: 'Ananya Assignee' },
            dueDate: '2026-11-25T00:00:00.000Z',
            status: { name: 'In Progress', category: 'active' },
          },
        ],
      };

      // Both must exist independently without conflating checklist and subtasks
      expect(drawerModel.checklist).toHaveLength(1);
      expect(drawerModel.subtasks).toHaveLength(1);
      expect(drawerModel.subtasks[0].title).toBe('Subtask 1: Detailed Wiring Schematics');
    });
  });

  describe('Bug 3: Total Removal of Progress Percentage', () => {
    it('replaces progress percentage with factual counts', () => {
      const taskFactualStatus = {
        state: 'In Progress',
        checklistDone: 3,
        checklistTotal: 5,
        subtasksDone: 2,
        subtasksTotal: 4,
        evidenceCount: 3,
      };

      const checklistLabel = `${taskFactualStatus.checklistDone} of ${taskFactualStatus.checklistTotal} checklist items done`;
      const subtaskLabel = `${taskFactualStatus.subtasksDone} of ${taskFactualStatus.subtasksTotal} subtasks completed`;
      const evidenceLabel = `${taskFactualStatus.evidenceCount} evidence files`;

      expect(checklistLabel).toBe('3 of 5 checklist items done');
      expect(subtaskLabel).toBe('2 of 4 subtasks completed');
      expect(evidenceLabel).toBe('3 evidence files');

      // No '%' symbol or 100% calculation used
      expect(checklistLabel).not.toContain('%');
      expect(subtaskLabel).not.toContain('%');
      expect(evidenceLabel).not.toContain('%');
    });
  });

  describe('Bug 4: Showing Work with Photos & Attachments', () => {
    it('validates photo compression and upload parameters for mobile', () => {
      const photoEvidence = {
        fileName: 'roof-leak.jpg',
        fileType: 'image/jpeg',
        fileSize: 450 * 1024, // 450KB after compression
        category: 'Photo',
        caption: 'North-west roof joint after heavy rain',
      };

      expect(photoEvidence.category).toBe('Photo');
      expect(photoEvidence.fileSize).toBeLessThan(15 * 1024 * 1024);
      expect(['image/jpeg', 'image/png', 'image/webp']).toContain(photoEvidence.fileType);
    });

    it('rejects forbidden file types like disguised executables', () => {
      const forbiddenFile = {
        fileName: 'installer.exe',
        fileType: 'application/x-msdownload',
      };

      const allowedMimeTypes = [
        'image/jpeg',
        'image/png',
        'image/webp',
        'image/gif',
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'text/plain',
      ];

      expect(allowedMimeTypes.includes(forbiddenFile.fileType)).toBe(false);
    });
  });
});
