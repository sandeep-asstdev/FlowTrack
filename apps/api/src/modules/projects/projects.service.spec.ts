import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProjectsService } from './projects.service';
import { NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';

describe('ProjectsService - Creation, Cloning, and Data Isolation', () => {
  let service: ProjectsService;
  let mockPrisma: any;
  let mockAuthService: any;

  beforeEach(() => {
    mockPrisma = {
      project: {
        findMany: vi.fn(),
        findFirst: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      node: {
        findMany: vi.fn(),
        create: vi.fn(),
        updateMany: vi.fn(),
      },
      edge: {
        findMany: vi.fn().mockResolvedValue([]),
        create: vi.fn(),
        updateMany: vi.fn(),
      },
      template: {
        create: vi.fn(),
      },
      auditLog: {
        create: vi.fn(),
      },
      auditEvent: {
        create: vi.fn(),
      },
      fieldDefinition: {
        findMany: vi.fn().mockResolvedValue([]),
        create: vi.fn(),
      },
      membership: {
        findUnique: vi.fn().mockResolvedValue({ role: 'ADMIN' }),
      },
      $transaction: vi.fn((callback) => callback(mockPrisma)),
    };

    mockAuthService = {
      getProjectVisibilityFilter: vi.fn().mockReturnValue({ workspaceId: 'ws-100', deletedAt: null }),
      evaluate: vi.fn().mockResolvedValue({ allowed: true }),
      enforce: vi.fn().mockResolvedValue(undefined),
      can: vi.fn().mockResolvedValue(true),
    };

    service = new ProjectsService(mockPrisma, mockAuthService);
  });

  describe('createProject (Blank Canvas - No Predefined Industry Required)', () => {
    it('creates a universal blank project without requiring an industry selection', async () => {
      mockPrisma.project.create.mockResolvedValue({
        id: 'proj-blank-1',
        workspaceId: 'ws-100',
        name: 'General Operational Overhaul',
        settings: {
          industry: 'general',
          methodology: 'agile_sprint',
          currency: { code: 'EUR', symbol: '€' },
        },
      });

      const result = await service.createProject('ws-100', {
        name: 'General Operational Overhaul',
        description: 'Universal workflow across operations',
        settings: {
          industry: 'general',
          methodology: 'agile_sprint',
          currency: { code: 'EUR', symbol: '€' },
        } as any,
      });

      expect(mockPrisma.project.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          workspaceId: 'ws-100',
          name: 'General Operational Overhaul',
          settings: expect.objectContaining({
            industry: 'general',
            methodology: 'agile_sprint',
          }),
        }),
      });
      expect(result.id).toBe('proj-blank-1');
    });
  });

  describe('cloneProject (Deep Copying with Hierarchy & Isolation)', () => {
    const mockSourceProject = {
      id: 'proj-source-99',
      workspaceId: 'ws-100',
      name: 'Automobile 3S Showroom Construction',
      description: 'Original showroom blueprint',
      templateId: 'tmpl-auto-1',
      startDate: new Date('2026-01-01'),
      targetDate: new Date('2026-12-31'),
      settings: {
        industry: 'automotive_dealerships',
        methodology: 'stage_gate',
        currency: { code: 'USD', symbol: '$' },
      },
      nodes: [
        {
          id: 'old-node-1',
          parentNodeId: null,
          nodeTypeId: 'nt-stage',
          title: '1. Foundation & Substructure',
          description: 'Piling and concrete base',
          positionX: 100,
          positionY: 200,
          priority: 'HIGH',
          weight: 2.0,
          progressPct: 100,
          estimatedCost: 50000,
          actualCost: 52000,
          allocatedHours: 400,
          actualHours: 420,
          isMilestone: false,
          customData: { zone: 'Bay 1' },
          statusId: 'status-done',
        },
        {
          id: 'old-node-2',
          parentNodeId: 'old-node-1',
          nodeTypeId: 'nt-task',
          title: 'Subtask: Soil Compaction',
          description: 'Testing density',
          positionX: 120,
          positionY: 280,
          priority: 'MEDIUM',
          weight: 1.0,
          progressPct: 100,
          estimatedCost: 10000,
          actualCost: 9500,
          allocatedHours: 80,
          actualHours: 75,
          isMilestone: false,
          customData: {},
          statusId: 'status-done',
        },
        {
          id: 'old-node-3',
          parentNodeId: null,
          nodeTypeId: 'nt-milestone',
          title: '2. Civil Handover Milestone',
          description: 'Handover to MEP engineers',
          positionX: 450,
          positionY: 200,
          priority: 'URGENT',
          weight: 1.5,
          progressPct: 50,
          estimatedCost: 0,
          actualCost: 0,
          allocatedHours: 0,
          actualHours: 0,
          isMilestone: true,
          customData: {},
          statusId: 'status-active',
        },
      ],
      edges: [
        {
          id: 'old-edge-1',
          sourceNodeId: 'old-node-1',
          targetNodeId: 'old-node-3',
          kind: 'sequence',
          label: 'Civil Works Complete',
          metadata: {},
        },
      ],
    };

    it('safely clones a project with independent IDs, remapped parent hierarchy, and reset progress', async () => {
      mockPrisma.project.findFirst.mockResolvedValue(mockSourceProject);

      const createdClonedProject = {
        id: 'proj-cloned-new',
        workspaceId: 'ws-100',
        name: 'Automobile 3S Showroom Construction (Copy)',
        description: 'Original showroom blueprint',
        templateId: 'tmpl-auto-1',
        settings: mockSourceProject.settings,
      };
      mockPrisma.project.create.mockResolvedValue(createdClonedProject);

      let createdNodeCount = 0;
      mockPrisma.node.create.mockImplementation((args: any) => {
        createdNodeCount++;
        return Promise.resolve({
          id: `new-node-${createdNodeCount}`,
          ...args.data,
        });
      });

      mockPrisma.edge.create.mockResolvedValue({ id: 'new-edge-1' });

      const result = await service.cloneProject(
        'proj-source-99',
        'ws-100',
        'actor-manager-1',
        { resetProgress: true }
      );

      expect(result.project.id).toBe('proj-cloned-new');
      expect(result.nodesCount).toBe(3);
      expect(result.edgesCount).toBe(1);

      // Verify node creation reset progress and actual costs
      expect(mockPrisma.node.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            projectId: 'proj-cloned-new',
            title: '1. Foundation & Substructure',
            progressPct: 0,
            actualCost: 0,
            actualHours: 0,
          }),
        })
      );

      // Verify child node remapped parentNodeId to new root node ID
      expect(mockPrisma.node.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            projectId: 'proj-cloned-new',
            title: 'Subtask: Soil Compaction',
            parentNodeId: 'new-node-1', // Remapped from old-node-1
            progressPct: 0,
          }),
        })
      );

      // Verify edge remapped sourceNodeId and targetNodeId
      expect(mockPrisma.edge.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          projectId: 'proj-cloned-new',
          sourceNodeId: 'new-node-1',
          targetNodeId: 'new-node-2',
          kind: 'sequence',
          label: 'Civil Works Complete',
        }),
      });

      // Verify audit log
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'CLONE',
          entityId: 'proj-cloned-new',
          actorId: 'actor-manager-1',
        }),
      });
    });

    it('rejects cloning a project from another workspace (tenant isolation)', async () => {
      mockPrisma.project.findFirst.mockResolvedValue(null);

      await expect(
        service.cloneProject('proj-foreign', 'ws-our-tenant', 'actor-1')
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('saveAsTemplate', () => {
    it('converts an existing configured project into a reusable workspace template', async () => {
      const mockProject = {
        id: 'proj-custom-1',
        workspaceId: 'ws-100',
        name: 'Hubli Showroom Delivery',
        description: 'Standard branch setup pipeline',
        settings: {
          industry: 'automotive_dealerships',
          methodology: 'stage_gate',
          currency: { code: 'INR', symbol: '₹' },
        },
        nodes: [
          {
            id: 'n-1',
            title: 'Stage 1: Civil Layout',
            description: 'Showroom footprint',
            nodeType: { key: 'stage' },
            positionX: 80,
            positionY: 200,
            priority: 'HIGH',
            weight: 2,
            children: [{ title: 'Civil subtask', priority: 'MEDIUM', weight: 1 }],
          },
          {
            id: 'n-2',
            title: 'Stage 2: Tooling Rigging',
            description: 'Hydraulic bays',
            nodeType: { key: 'task' },
            positionX: 420,
            positionY: 200,
            priority: 'MEDIUM',
            weight: 1.5,
            children: [],
          },
        ],
        edges: [
          {
            sourceNodeId: 'n-1',
            targetNodeId: 'n-2',
            kind: 'sequence',
            label: 'Layout Approved',
          },
        ],
      };

      mockPrisma.project.findFirst.mockResolvedValue(mockProject);
      mockPrisma.template.create.mockResolvedValue({
        id: 'tmpl-new-saved',
        name: 'Hubli Showroom Delivery Blueprint',
        workspaceId: 'ws-100',
      });

      const template = await service.saveAsTemplate('proj-custom-1', 'ws-100', 'actor-mgr', {
        name: 'Custom Automotive Showroom Blueprint',
        category: 'Automotive & Dealerships',
      });

      expect(mockPrisma.template.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          workspaceId: 'ws-100',
          name: 'Custom Automotive Showroom Blueprint',
          category: 'Automotive & Dealerships',
          graphJson: expect.objectContaining({
            nodes: expect.arrayContaining([
              expect.objectContaining({
                title: 'Stage 1: Civil Layout',
                subtasks: expect.arrayContaining([
                  expect.objectContaining({ title: 'Civil subtask' }),
                ]),
              }),
            ]),
            edges: expect.arrayContaining([
              expect.objectContaining({
                sourceIndex: 0,
                targetIndex: 1,
                kind: 'sequence',
              }),
            ]),
          }),
        }),
      });

      expect(template.id).toBe('tmpl-new-saved');
    });
  });

  describe('listWorkspaceProjects & getProject (Visibility & Confidentiality)', () => {
    it('applies centralized getProjectVisibilityFilter from AuthorizationService', async () => {
      mockPrisma.project.findMany.mockResolvedValue([
        { id: 'proj-vis-1', name: 'Open Project', workspaceId: 'ws-100', metrics: {} },
      ]);
      mockPrisma.node.findMany.mockResolvedValue([]);

      const result = await service.listWorkspaceProjects('ws-100', { id: 'user-regular', role: 'MEMBER' });

      expect(mockAuthService.getProjectVisibilityFilter).toHaveBeenCalledWith({
        id: 'user-regular',
        role: 'MEMBER',
        workspaceId: 'ws-100',
      });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('proj-vis-1');
    });

    it('returns 404 when project is confidential and user lacks access', async () => {
      mockPrisma.project.findFirst.mockResolvedValue({
        id: 'proj-secret-1',
        name: 'Top Secret Initiative',
        workspaceId: 'ws-100',
        classification: 'HIGHLY_CONFIDENTIAL',
        ownerId: 'ceo-user',
        responsibleManagerId: null,
      });

      mockAuthService.evaluate.mockResolvedValue({
        allowed: false,
        statusCode: 404,
        reason: 'Project not found or unauthorized under confidentiality classification',
      });

      await expect(
        service.getProject('proj-secret-1', 'ws-100', { id: 'unauthorized-user', role: 'MEMBER' })
      ).rejects.toThrow(NotFoundException);
    });

    it('returns project details when user has access clearance', async () => {
      mockPrisma.project.findFirst.mockResolvedValue({
        id: 'proj-clear-1',
        name: 'Authorized Initiative',
        workspaceId: 'ws-100',
        classification: 'INTERNAL',
        ownerId: 'actor-1',
      });
      mockAuthService.evaluate.mockResolvedValue({ allowed: true, statusCode: 200 });

      const project = await service.getProject('proj-clear-1', 'ws-100', { id: 'actor-1', role: 'MANAGER' });
      expect(project.id).toBe('proj-clear-1');
      expect(project.name).toBe('Authorized Initiative');
    });
  });

  describe('deleteProject, listTrashProjects, and restoreProject (Lifecycle & Trash)', () => {
    it('requires mandatory non-empty reason for project soft-deletion', async () => {
      mockPrisma.project.findFirst.mockResolvedValue({
        id: 'proj-del-1',
        workspaceId: 'ws-100',
        name: 'Project to Delete',
        deletedAt: null,
      });

      await expect(
        service.deleteProject('proj-del-1', 'ws-100', 'actor-1', 'ADMIN', { reason: '   ' })
      ).rejects.toThrow(BadRequestException);
    });

    it('soft-deletes project and marks deletedAt in database', async () => {
      mockPrisma.project.findFirst.mockResolvedValue({
        id: 'proj-del-2',
        workspaceId: 'ws-100',
        name: 'Project to Delete',
        deletedAt: null,
      });
      mockPrisma.project.update.mockResolvedValue({
        id: 'proj-del-2',
        deletedAt: new Date(),
      });

      const deleted = await service.deleteProject(
        'proj-del-2',
        'ws-100',
        'actor-admin',
        'ADMIN',
        { reason: 'Initiative completed and archived' }
      );

      expect(deleted.id).toBe('proj-del-2');
      expect(mockPrisma.project.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'proj-del-2' },
          data: expect.objectContaining({
            deletedAt: expect.any(Date),
          }),
        })
      );
    });

    it('lists soft-deleted projects in trash with includeDeleted filter', async () => {
      mockPrisma.project.findMany.mockResolvedValue([
        { id: 'proj-trash-1', name: 'Deleted Project', deletedAt: new Date() },
      ]);

      const trash = await service.listTrashProjects('ws-100', { id: 'actor-admin', role: 'ADMIN' });
      expect(trash).toHaveLength(1);
      expect(trash[0].id).toBe('proj-trash-1');
    });

    it('restores soft-deleted project from trash setting deletedAt to null', async () => {
      mockPrisma.project.findFirst.mockResolvedValue({
        id: 'proj-trash-1',
        workspaceId: 'ws-100',
        name: 'Restorable Project',
        deletedAt: new Date(),
      });
      mockPrisma.project.update.mockResolvedValue({
        id: 'proj-trash-1',
        deletedAt: null,
      });

      const restored = await service.restoreProject(
        'proj-trash-1',
        'ws-100',
        'actor-admin',
        'ADMIN',
        { reason: 'Accidental deletion' }
      );

      expect(restored.id).toBe('proj-trash-1');
      expect(restored.deletedAt).toBeNull();
      expect(mockPrisma.project.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'proj-trash-1' },
          data: expect.objectContaining({
            deletedAt: null,
          }),
        })
      );
    });
  });
});
