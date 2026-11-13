import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TemplatesService } from './templates.service';

describe('TemplatesService', () => {
  let service: TemplatesService;
  let mockPrisma: any;
  let mockProjectsService: any;
  let mockNodesService: any;
  let mockEdgesService: any;
  let mockApprovalsService: any;
  let mockAuditService: any;
  let mockAuthService: any;
  let mockCpmService: any;

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
        findMany: vi.fn().mockResolvedValue([
          { id: 'nt-stage', key: 'stage' },
          { id: 'nt-task', key: 'task' },
          { id: 'nt-milestone', key: 'milestone' },
          { id: 'nt-approval', key: 'approval' },
        ]),
        findFirst: vi.fn().mockImplementation((args: any) =>
          Promise.resolve({ id: 'nt-' + (args?.where?.key || 'task'), key: args?.where?.key || 'task' })
        ),
        create: vi.fn().mockImplementation((args: any) =>
          Promise.resolve({ id: 'nt-' + (args?.data?.key || 'task'), key: args?.data?.key || 'task' })
        ),
      },
      approvalPolicy: {
        findMany: vi.fn().mockResolvedValue([]),
        create: vi.fn(),
      },
      project: {
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
      node: {
        create: vi.fn(),
        deleteMany: vi.fn(),
      },
      edge: {
        create: vi.fn(),
        deleteMany: vi.fn(),
      },
      auditLog: {
        create: vi.fn(),
      },
      auditEvent: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      $transaction: vi.fn((callback) => callback(mockPrisma)),
    };

    mockProjectsService = {
      createProject: vi.fn().mockResolvedValue({
        id: 'proj-123',
        workspaceId: 'ws-123',
        name: 'New Apex Motors Dealership',
        key: 'APEX-101',
        classification: 'CONFIDENTIAL',
        settings: {
          industry: 'automotive_dealerships',
          methodology: 'stage_gate',
          currency: { code: 'INR', symbol: '₹' },
        },
      }),
    };

    mockNodesService = {
      createNode: vi.fn(),
    };

    mockEdgesService = {
      createEdge: vi.fn().mockResolvedValue({
        id: 'edge-1',
        sourceNodeId: 'node-1',
        targetNodeId: 'node-2',
      }),
    };

    mockApprovalsService = {
      createPolicy: vi.fn().mockResolvedValue({ id: 'policy-1', name: 'Normal Approval Policy' }),
    };

    mockAuditService = {
      recordAuditEvent: vi.fn().mockResolvedValue({ id: 'audit-1' }),
    };

    mockAuthService = {
      enforce: vi.fn().mockResolvedValue(true),
    };

    mockCpmService = {
      calculateProjectCriticalPath: vi.fn().mockResolvedValue({
        totalDurationDays: 120,
        criticalPathIds: ['node-1', 'node-2'],
      }),
    };

    service = new TemplatesService(
      mockPrisma,
      mockProjectsService,
      mockNodesService,
      mockEdgesService,
      mockApprovalsService,
      mockAuditService,
      mockAuthService,
      mockCpmService
    );
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
            offsetDays: 0,
            durationDays: 14,
          },
          {
            key: 'ci_design',
            title: '2. OEM CI Showroom Design',
            nodeTypeKey: 'task',
            positionX: 450,
            positionY: 200,
            weight: 1.5,
            offsetDays: 14,
            durationDays: 21,
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

    let nodeCallIndex = 0;
    mockPrisma.node.create.mockImplementation((args: any) => {
      nodeCallIndex++;
      return Promise.resolve({
        id: `node-${nodeCallIndex}`,
        ...args.data,
      });
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
      'user-admin',
      'ADMIN'
    );

    expect(result.project.id).toBe('proj-123');
    expect(result.nodesCount).toBe(2);
    expect(mockProjectsService.createProject).toHaveBeenCalled();
    expect(mockEdgesService.createEdge).toHaveBeenCalled();
  });
});
