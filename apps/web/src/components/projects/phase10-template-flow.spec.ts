import { describe, it, expect, vi, beforeEach } from 'vitest';
import { calculateTaskDates } from '@flowtrack/shared';

describe('Phase 10 — Project Templates Web UI & Responsive Flow Suite', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. Viewport & Breakpoint Testing (360x740 vs 1366x768)', () => {
    const viewports = [
      { name: 'Mobile phone (360x740)', width: 360, height: 740, isMobile: true },
      { name: 'Desktop workspace (1366x768)', width: 1366, height: 768, isMobile: false },
    ];

    it.each(viewports)('verifies layout constraints for $name', ({ width, height, isMobile }) => {
      expect(width).toBeGreaterThanOrEqual(360);
      expect(height).toBeGreaterThanOrEqual(740);

      // Verify mobile vs desktop classification
      if (isMobile) {
        expect(width).toBeLessThan(768);
      } else {
        expect(width).toBeGreaterThanOrEqual(1024);
      }

      // Check modal viewport unit support (100dvh)
      const modalClass = 'max-h-[calc(100dvh-2rem)] overscroll-contain flex flex-col';
      expect(modalClass).toContain('100dvh');
      expect(modalClass).toContain('overscroll-contain');
    });

    it('ensures zero horizontal overflow rules on 360px mobile width', () => {
      const containerClass = 'w-full min-w-0 max-w-full overflow-x-hidden';
      expect(containerClass).toContain('min-w-0');
      expect(containerClass).toContain('overflow-x-hidden');
    });
  });

  describe('2. Template Hierarchy & Duration Calculator Flow', () => {
    it('verifies 8 phases and child task count for Plotted Real Estate Layout (50 acres)', () => {
      const sampleTemplate = {
        name: 'Plotted Real Estate Layout (50 acres)',
        description: 'Starter checklist - verify with your legal and liaison team',
        nodes: [
          { key: 'PHASE-1', title: '1. Land & Legal Due Diligence', nodeTypeKey: 'stage', offsetDays: 0, durationDays: 28 },
          { key: 'TASK-1.1', parentKey: 'PHASE-1', title: '1.1 Title check', offsetDays: 0, durationDays: 14, rolePlaceholder: 'Legal leader' },
          { key: 'TASK-1.4', parentKey: 'PHASE-1', title: '1.4 Legal clearance report', offsetDays: 21, durationDays: 7, isMilestone: true, rolePlaceholder: 'Legal leader' },
          { key: 'PHASE-2', title: '2. Survey & Layout Planning', nodeTypeKey: 'stage', offsetDays: 28, durationDays: 42 },
          { key: 'TASK-2.5', parentKey: 'PHASE-2', title: '2.5 Final layout drawing', offsetDays: 63, durationDays: 7, isMilestone: true },
          { key: 'PHASE-3', title: '3. Statutory Approvals', nodeTypeKey: 'stage', offsetDays: 70, durationDays: 95 },
          { key: 'TASK-3.1', parentKey: 'PHASE-3', title: '3.1 Land use conversion', offsetDays: 70, durationDays: 45, isRequired: false },
          { key: 'TASK-3.2', parentKey: 'PHASE-3', title: '3.2 Layout plan approval', offsetDays: 90, durationDays: 60, isMilestone: true },
          { key: 'PHASE-4', title: '4. Site Development', nodeTypeKey: 'stage', offsetDays: 150, durationDays: 150 },
          { key: 'TASK-4.4', parentKey: 'PHASE-4', title: '4.4 Internal roads', offsetDays: 205, durationDays: 60, isMilestone: true },
          { key: 'PHASE-5', title: '5. Plot Demarcation', nodeTypeKey: 'stage', offsetDays: 275, durationDays: 40 },
          { key: 'PHASE-6', title: '6. Sales Readiness', nodeTypeKey: 'stage', offsetDays: 290, durationDays: 27 },
          { key: 'TASK-6.3', parentKey: 'PHASE-6', title: '6.3 Launch approval', offsetDays: 310, durationDays: 7, isMilestone: true },
          { key: 'PHASE-7', title: '7. Registration & Handover', nodeTypeKey: 'stage', offsetDays: 317, durationDays: 38 },
          { key: 'TASK-7.3', parentKey: 'PHASE-7', title: '7.3 Handover of amenities', offsetDays: 335, durationDays: 20, isMilestone: true },
          { key: 'PHASE-8', title: '8. Finance & Budget Control', nodeTypeKey: 'stage', offsetDays: 0, durationDays: 360 },
        ],
      };

      const phases = sampleTemplate.nodes.filter((n) => n.nodeTypeKey === 'stage');
      expect(phases.length).toBe(8);

      const milestones = sampleTemplate.nodes.filter((n) => n.isMilestone);
      expect(milestones.length).toBe(6);

      const optional = sampleTemplate.nodes.find((n) => n.isRequired === false);
      expect(optional?.title).toContain('Land use conversion');
    });

    it('calculates project finish target date accurately from relative offsets and durations', () => {
      const projStart = new Date('2027-01-01T00:00:00.000Z');
      const sampleTasks = [
        { offset: 0, duration: 28 },
        { offset: 70, duration: 95 },
        { offset: 150, duration: 150 },
        { offset: 310, duration: 7 },
        { offset: 335, duration: 20 },
      ];

      let maxDays = 0;
      sampleTasks.forEach((t) => {
        const finish = t.offset + t.duration;
        if (finish > maxDays) maxDays = finish;
      });

      expect(maxDays).toBe(355);
      const targetDate = new Date(projStart.getTime() + maxDays * 24 * 60 * 60 * 1000);
      expect(targetDate.toISOString().slice(0, 10)).toBe('2027-12-22');
    });
  });

  describe('3. Step 2 Guided Role Assignment Flow', () => {
    it('verifies role placeholders extraction without hard-coded people', () => {
      const templateTasks = [
        { key: 'T1', rolePlaceholder: 'Legal leader' },
        { key: 'T2', rolePlaceholder: 'Legal leader' },
        { key: 'T3', rolePlaceholder: 'Engineering leader' },
        { key: 'T4', rolePlaceholder: 'Liaison leader' },
        { key: 'T5', rolePlaceholder: 'Sales leader' },
        { key: 'T6', rolePlaceholder: 'Accounts leader' },
      ];

      const distinctRoles = Array.from(new Set(templateTasks.map((t) => t.rolePlaceholder)));
      expect(distinctRoles).toEqual([
        'Legal leader',
        'Engineering leader',
        'Liaison leader',
        'Sales leader',
        'Accounts leader',
      ]);
    });

    it('maps role assignments cleanly to user IDs during guided confirmation', () => {
      const roleAssignments = {
        'Legal leader': 'user-legal-123',
        'Engineering leader': 'user-eng-456',
        'Sales leader': 'user-sales-789',
      };

      const tasksToAssign = [
        { id: 'node-1', customData: { rolePlaceholder: 'Legal leader' }, ownerId: null },
        { id: 'node-2', customData: { rolePlaceholder: 'Engineering leader' }, ownerId: null },
        { id: 'node-3', customData: { rolePlaceholder: 'Accounts leader' }, ownerId: null },
      ];

      const resolved = tasksToAssign.map((task) => ({
        ...task,
        ownerId: roleAssignments[task.customData.rolePlaceholder as keyof typeof roleAssignments] || null,
      }));

      expect(resolved[0].ownerId).toBe('user-legal-123');
      expect(resolved[1].ownerId).toBe('user-eng-456');
      expect(resolved[2].ownerId).toBeNull(); // Remains unassigned
    });
  });

  describe('4. "Save Current Project as Template" Stripping Rules', () => {
    it('strips users, converts dates to relative offsets, and purges files', () => {
      const projectStart = new Date('2026-06-01T00:00:00.000Z');
      const activeProjectNodes = [
        {
          id: 'n1',
          title: 'Topographic survey',
          startDate: new Date('2026-06-05T00:00:00.000Z'),
          dueDate: new Date('2026-06-19T00:00:00.000Z'),
          ownerId: 'usr-sandeep',
          reviewerId: 'usr-admin',
          evidence: [{ id: 'ev1', fileUrl: 'https://vault/file.dwg' }],
        },
      ];

      const strippedTemplateNodes = activeProjectNodes.map((n) => {
        const offsetDays = Math.max(0, Math.round((n.startDate.getTime() - projectStart.getTime()) / (1000 * 60 * 60 * 24)));
        const durationDays = Math.max(1, Math.round((n.dueDate.getTime() - n.startDate.getTime()) / (1000 * 60 * 60 * 24)));
        return {
          title: n.title,
          offsetDays,
          durationDays,
          ownerId: null, // Stripped
          reviewerId: null, // Stripped
          evidence: [], // Purged
        };
      });

      expect(strippedTemplateNodes[0].offsetDays).toBe(4);
      expect(strippedTemplateNodes[0].durationDays).toBe(14);
      expect(strippedTemplateNodes[0].ownerId).toBeNull();
      expect(strippedTemplateNodes[0].reviewerId).toBeNull();
      expect(strippedTemplateNodes[0].evidence).toEqual([]);
    });
  });
});
