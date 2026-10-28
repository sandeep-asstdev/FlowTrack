import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CpmService } from './cpm.service';
import { NotFoundException, BadRequestException } from '@nestjs/common';

describe('CpmService - Backend Project Critical Path Analysis', () => {
  let service: CpmService;
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      project: {
        findFirst: vi.fn(),
      },
      node: {
        findMany: vi.fn(),
      },
      edge: {
        findMany: vi.fn(),
      },
    };

    service = new CpmService(mockPrisma);
  });

  describe('Multi-Tenant & Organization Isolation', () => {
    it('throws NotFoundException when accessing a project from an unauthorized workspace', async () => {
      mockPrisma.project.findFirst.mockResolvedValue(null);

      await expect(
        service.calculateProjectCriticalPath('proj-foreign', 'ws-unauthorized')
      ).rejects.toThrow(NotFoundException);

      expect(mockPrisma.project.findFirst).toHaveBeenCalledWith({
        where: {
          id: 'proj-foreign',
          workspaceId: 'ws-unauthorized',
          deletedAt: null,
        },
      });
    });
  });

  describe('Empty Project Handling', () => {
    it('returns empty analysis safely when project has no tasks', async () => {
      mockPrisma.project.findFirst.mockResolvedValue({
        id: 'proj-empty',
        workspaceId: 'ws-1',
        startDate: new Date('2026-05-01T00:00:00Z'),
      });
      mockPrisma.node.findMany.mockResolvedValue([]);
      mockPrisma.edge.findMany.mockResolvedValue([]);

      const result = await service.calculateProjectCriticalPath('proj-empty', 'ws-1');

      expect(result.totalDurationDays).toBe(0);
      expect(result.criticalTaskCount).toBe(0);
      expect(result.tasks).toEqual([]);
      expect(result.criticalPathIds).toEqual([]);
    });
  });

  describe('Circular Dependency Handling', () => {
    it('throws BadRequestException with descriptive error when project graph has cycles', async () => {
      mockPrisma.project.findFirst.mockResolvedValue({
        id: 'proj-cycle',
        workspaceId: 'ws-1',
        startDate: new Date('2026-06-01T00:00:00Z'),
      });
      mockPrisma.node.findMany.mockResolvedValue([
        { id: 'node-1', title: 'Task 1', customData: { durationDays: 3 } },
        { id: 'node-2', title: 'Task 2', customData: { durationDays: 4 } },
      ]);
      mockPrisma.edge.findMany.mockResolvedValue([
        { id: 'e1', sourceNodeId: 'node-1', targetNodeId: 'node-2', kind: 'sequence' },
        { id: 'e2', sourceNodeId: 'node-2', targetNodeId: 'node-1', kind: 'sequence' },
      ]);

      await expect(
        service.calculateProjectCriticalPath('proj-cycle', 'ws-1')
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('Full Project Scheduling & Critical Path', () => {
    it('accurately identifies critical path and slack for a multi-branch project workflow', async () => {
      mockPrisma.project.findFirst.mockResolvedValue({
        id: 'proj-flow',
        workspaceId: 'ws-1',
        startDate: new Date('2026-07-01T00:00:00Z'),
        targetDate: new Date('2026-07-20T00:00:00Z'),
      });

      // Branch 1 (Long): Start(2d) -> Design(6d) -> Review(3d) => 11d
      // Branch 2 (Short): Start(2d) -> Research(3d) -> Review(3d) => 8d
      mockPrisma.node.findMany.mockResolvedValue([
        { id: 'start', title: 'Start Milestone', customData: { durationDays: 2 } },
        { id: 'design', title: 'UI Design', customData: { durationDays: 6 } },
        { id: 'research', title: 'Market Research', customData: { durationDays: 3 } },
        { id: 'review', title: 'Final Review', customData: { durationDays: 3 } },
      ]);

      mockPrisma.edge.findMany.mockResolvedValue([
        { id: 'e1', sourceNodeId: 'start', targetNodeId: 'design' },
        { id: 'e2', sourceNodeId: 'start', targetNodeId: 'research' },
        { id: 'e3', sourceNodeId: 'design', targetNodeId: 'review' },
        { id: 'e4', sourceNodeId: 'research', targetNodeId: 'review' },
      ]);

      const result = await service.calculateProjectCriticalPath('proj-flow', 'ws-1');

      expect(result.totalDurationDays).toBe(11); // 2 + 6 + 3
      expect(result.criticalTaskCount).toBe(3); // start, design, review
      expect(result.slackTaskCount).toBe(1); // research has slack
      expect(result.criticalPathIds).toEqual(['start', 'design', 'review']);

      const research = result.tasks.find((t) => t.id === 'research')!;
      expect(research.isCritical).toBe(false);
      expect(research.totalFloat).toBe(3); // 11 - 8 = 3 days slack

      // Deadline comparison
      expect(result.deadlineSlackDays).toBeDefined();
      expect(result.deadlineSlackDays!).toBeGreaterThan(0);
    });
  });
});
