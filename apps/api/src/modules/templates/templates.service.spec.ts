import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TemplatesService } from './templates.service';

describe('TemplatesService', () => {
  let service: TemplatesService;
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      template: {
        findFirst: vi.fn(),
        create: vi.fn(),
        findMany: vi.fn(),
        findUnique: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
      nodeType: {
        findMany: vi.fn(),
      },
      project: {
        create: vi.fn(),
      },
      node: {
        create: vi.fn(),
      },
      edge: {
        create: vi.fn(),
      },
      auditLog: {
        create: vi.fn(),
      },
      $transaction: vi.fn((callback) => callback(mockPrisma)),
    };

    service = new TemplatesService(mockPrisma);
  });

  it('lists public and workspace templates', async () => {
    mockPrisma.template.findMany.mockResolvedValue([
      { id: 't1', name: 'Civil Construction', isPublic: true },
    ]);

    const result = await service.listTemplates('ws-123', 'construction_real_estate');

    expect(mockPrisma.template.findMany).toHaveBeenCalled();
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Civil Construction');
  });

  it('instantiates a template into a full project with nodes, edges, and settings', async () => {
    const templateMock = {
      id: 'tmpl-auto-1',
      name: 'Automobile 3S Dealership',
      industry: 'automotive_dealerships',
      methodology: 'stage_gate',
      description: 'Turnkey automobile dealership launch',
      defaultSettings: {
        currency: { code: 'USD', symbol: '$' },
        terminology: { task: 'Setup Activity' },
      },
      graphJson: {
        nodes: [
          {
            key: 'site_selection',
            title: '1. Site Selection & Feasibility',
            nodeTypeKey: 'stage',
            positionX: 100,
            positionY: 200,
            weight: 2.0,
            subtasks: [
              { title: 'Subtask A', nodeTypeKey: 'task' },
            ],
          },
          {
            key: 'ci_design',
            title: '2. OEM CI Showroom Design',
            nodeTypeKey: 'task',
            positionX: 450,
            positionY: 200,
            weight: 1.5,
          },
        ],
        edges: [
          {
            sourceIndex: 0,
            targetIndex: 1,
            kind: 'sequence',
            label: 'Site Confirmed',
          },
        ],
      },
    };

    mockPrisma.template.findUnique.mockResolvedValue(templateMock);
    mockPrisma.nodeType.findMany.mockResolvedValue([
      { id: 'nt-stage', key: 'stage' },
      { id: 'nt-task', key: 'task' },
    ]);

    mockPrisma.project.create.mockResolvedValue({
      id: 'proj-123',
      workspaceId: 'ws-123',
      name: 'New Apex Motors Dealership',
      settings: {
        industry: 'automotive_dealerships',
        methodology: 'stage_gate',
        currency: { code: 'INR', symbol: '₹' },
      },
    });

    let nodeCallIndex = 0;
    mockPrisma.node.create.mockImplementation((args: any) => {
      nodeCallIndex++;
      return Promise.resolve({
        id: `node-${nodeCallIndex}`,
        ...args.data,
      });
    });

    mockPrisma.edge.create.mockResolvedValue({
      id: 'edge-1',
      sourceNodeId: 'node-1',
      targetNodeId: 'node-3',
    });

    const result = await service.instantiateTemplate(
      'tmpl-auto-1',
      'ws-123',
      {
        projectName: 'New Apex Motors Dealership',
        customSettings: {
          currency: { code: 'INR', symbol: '₹' },
        },
      },
      'user-admin'
    );

    expect(result.project.id).toBe('proj-123');
    expect(result.nodesCount).toBe(2); // 2 top-level nodes in graph
    expect(result.edgesCount).toBe(1);
    expect(mockPrisma.project.create).toHaveBeenCalled();
    expect(mockPrisma.auditLog.create).toHaveBeenCalled();
  });

  describe('Template Versioning and Workspace Isolation', () => {
    it('increments version when a template is updated', async () => {
      mockPrisma.template.findUnique.mockResolvedValue({
        id: 'tmpl-1',
        workspaceId: 'ws-123',
        name: 'Initial Name',
        version: 1,
      });

      mockPrisma.template.update.mockResolvedValue({
        id: 'tmpl-1',
        name: 'Updated Name',
        version: 2,
      });

      const updated = await service.updateTemplate(
        'tmpl-1',
        { name: 'Updated Name' },
        'ws-123'
      );

      expect(mockPrisma.template.update).toHaveBeenCalledWith({
        where: { id: 'tmpl-1' },
        data: expect.objectContaining({
          name: 'Updated Name',
          version: { increment: 1 },
        }),
      });
      expect(updated.version).toBe(2);
    });

    it('blocks updating a template belonging to another workspace', async () => {
      mockPrisma.template.findUnique.mockResolvedValue({
        id: 'tmpl-foreign',
        workspaceId: 'ws-tenant-b',
        name: 'Private Blueprint',
      });

      await expect(
        service.updateTemplate('tmpl-foreign', { name: 'Hack' }, 'ws-tenant-a')
      ).rejects.toThrow('Cannot edit a template belonging to another workspace');
    });

    it('blocks deleting a template belonging to another workspace', async () => {
      mockPrisma.template.findUnique.mockResolvedValue({
        id: 'tmpl-foreign',
        workspaceId: 'ws-tenant-b',
        name: 'Private Blueprint',
      });

      await expect(
        service.deleteTemplate('tmpl-foreign', 'ws-tenant-a')
      ).rejects.toThrow('Cannot delete a template belonging to another workspace');
    });
  });
});

