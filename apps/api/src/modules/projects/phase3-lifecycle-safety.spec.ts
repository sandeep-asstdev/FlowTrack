import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProjectsService } from './projects.service';
import { NotificationsService } from '../notifications/notifications.service';
import { GRANULAR_PERMISSIONS, CONFIDENTIALITY_LEVELS } from '@flowtrack/shared';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';

describe('PHASE 3 - LIFECYCLE SAFETY, EXPERIENCE AND VERIFICATION (Master Spec Suite)', () => {
  let projectsService: ProjectsService;
  let notificationsService: NotificationsService;
  let mockPrisma: any;
  let mockAuthService: any;
  let mockAuditService: any;
  let mockGateway: any;
  let mockBackgroundJobs: any;

  beforeEach(() => {
    mockPrisma = {
      project: {
        findFirst: vi.fn(),
        findUnique: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn().mockResolvedValue({ id: 'prj-deleted' }),
        count: vi.fn(),
      },
      node: {
        findFirst: vi.fn(),
        findUnique: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
        count: vi.fn(),
      },
      edge: {
        findMany: vi.fn(),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      document: {
        count: vi.fn(),
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      evidenceItem: {
        count: vi.fn().mockResolvedValue(0),
      },
      projectMember: {
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      approvalPolicy: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      approvalRequest: {
        findFirst: vi.fn(),
      },
      approvalStageInstance: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      notification: {
        findUnique: vi.fn(),
        create: vi.fn(),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        count: vi.fn().mockResolvedValue(0),
      },
      user: {
        findUnique: vi.fn(),
      },
      fieldDefinition: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      $transaction: vi.fn((cb) => cb(mockPrisma)),
    };

    mockAuthService = {
      can: vi.fn().mockResolvedValue(true),
      enforce: vi.fn().mockResolvedValue(undefined),
      evaluate: vi.fn().mockResolvedValue({ allowed: true, statusCode: 200 }),
      getProjectVisibilityFilter: vi.fn().mockReturnValue({ workspaceId: 'ws-1', deletedAt: null }),
    };

    mockAuditService = {
      recordAuditEvent: vi.fn().mockResolvedValue({ id: 'audit-1' }),
      log: vi.fn().mockResolvedValue({ id: 'log-1' }),
    };

    mockGateway = {
      sendToUser: vi.fn(),
      broadcastToProject: vi.fn(),
    };

    mockBackgroundJobs = {
      enqueue: vi.fn((_name, _payload, jobFn) => jobFn()),
    };

    projectsService = new ProjectsService(
      mockPrisma as any,
      mockAuthService as any,
      mockAuditService as any
    );

    notificationsService = new NotificationsService(
      mockPrisma as any,
      mockGateway as any,
      mockBackgroundJobs as any,
      mockAuthService as any,
      mockAuditService as any
    );
  });

  // =========================================================================
  // SCENARIO 2: PROJECT DELETION FLOW & IMPACT ANALYSIS
  // =========================================================================
  describe('Scenario 2: Project Deletion Flow & Trash Visibility', () => {
    it('calculates comprehensive deletion impact (tasks, subtasks, documents, external dependencies)', async () => {
      mockPrisma.project.findFirst.mockResolvedValue({
        id: 'prj-alpha',
        workspaceId: 'ws-1',
        name: 'Project Alpha',
        classification: 'INTERNAL',
        settings: {},
      });
      mockPrisma.fieldDefinition.findMany.mockResolvedValue([]);
      mockPrisma.node.count
        .mockResolvedValueOnce(5) // root tasks
        .mockResolvedValueOnce(8); // subtasks
      mockPrisma.document.count.mockResolvedValue(3);
      mockPrisma.evidenceItem.count.mockResolvedValue(4);
      mockPrisma.edge.findMany.mockResolvedValue([
        {
          sourceNode: { projectId: 'prj-alpha' },
          targetNode: { projectId: 'prj-beta', project: { id: 'prj-beta', name: 'Project Beta' } },
        },
      ]);
      mockPrisma.approvalPolicy.findMany.mockResolvedValue([]);

      const impact = await projectsService.getProjectDeletionImpact('prj-alpha', 'ws-1', 'user-1', 'ADMIN');

      expect(impact.projectName).toBe('Project Alpha');
      expect(impact.taskCount).toBe(5);
      expect(impact.subtaskCount).toBe(8);
      expect(impact.totalNodesCount).toBe(13);
      expect(impact.documentCount).toBe(3);
      expect(impact.evidenceCount).toBe(4);
      expect(impact.crossProjectDependenciesCount).toBe(1);
      expect(impact.dependentProjects).toEqual([{ id: 'prj-beta', name: 'Project Beta', taskCount: 1 }]);
      expect(impact.requiresApproval).toBe(true); // Total nodes > 10 qualifies as high impact
    });

    it('rejects deletion when mandatory reason is missing or empty', async () => {
      mockPrisma.project.findFirst.mockResolvedValue({
        id: 'prj-alpha',
        workspaceId: 'ws-1',
        name: 'Project Alpha',
      });
      mockPrisma.edge.findMany.mockResolvedValue([]);

      await expect(
        projectsService.deleteProject('prj-alpha', 'ws-1', 'user-1', 'ADMIN', { reason: '   ' })
      ).rejects.toThrow(BadRequestException);
    });

    it('soft-deletes project and its child tasks, recording append-only audit event', async () => {
      mockPrisma.project.findFirst.mockResolvedValue({
        id: 'prj-alpha',
        workspaceId: 'ws-1',
        name: 'Project Alpha',
        status: 'ACTIVE',
        deletedAt: null,
      });
      mockPrisma.edge.findMany.mockResolvedValue([]);
      mockPrisma.project.update.mockResolvedValue({
        id: 'prj-alpha',
        status: 'DELETED',
        deletedAt: new Date(),
      });

      const result = await projectsService.deleteProject('prj-alpha', 'ws-1', 'user-1', 'ADMIN', {
        reason: 'Client cancelled contract',
      });

      expect(result.status).toBe('DELETED');
      expect(mockPrisma.node.updateMany).toHaveBeenCalledWith({
        where: { projectId: 'prj-alpha', deletedAt: null },
        data: expect.objectContaining({ deletedAt: expect.any(Date) }),
      });
      expect(mockAuditService.recordAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'PROJECT_SOFT_DELETED',
          targetId: 'prj-alpha',
          reason: 'Client cancelled contract',
        })
      );
    });

    it('trash list is accessible to authorized users and hides deleted projects from regular members', async () => {
      mockAuthService.can.mockResolvedValue(false); // Regular member lacks restore & delete

      await expect(
        projectsService.listTrashProjects('ws-1', { id: 'user-member', role: 'MEMBER' })
      ).rejects.toThrow(ForbiddenException);

      // Admin has permission
      mockAuthService.can.mockResolvedValue(true);
      mockPrisma.project.findMany.mockResolvedValue([
        { id: 'prj-deleted', name: 'Deleted Project', deletedAt: new Date() },
      ]);

      const trash = await projectsService.listTrashProjects('ws-1', { id: 'admin-user', role: 'ADMIN' });
      expect(trash).toHaveLength(1);
      expect(trash[0].id).toBe('prj-deleted');
    });
  });

  // =========================================================================
  // SCENARIO 6: ROLE-BASED PROJECT ARCHIVE & RESTORE
  // =========================================================================
  describe('Scenario 6: Independent Archive, Restore and Edit Permissions', () => {
    it('rejects archive if user possesses project.edit but lacks project.archive', async () => {
      mockPrisma.project.findFirst.mockResolvedValue({
        id: 'prj-1',
        workspaceId: 'ws-1',
        name: 'Project 1',
        classification: 'INTERNAL',
      });
      mockPrisma.fieldDefinition.findMany.mockResolvedValue([]);

      mockAuthService.enforce.mockImplementation((_user: any, perm: string) => {
        if (perm === GRANULAR_PERMISSIONS.PROJECT_ARCHIVE) {
          throw new ForbiddenException('User lacks project.archive permission');
        }
      });

      await expect(
        projectsService.archiveProject('prj-1', 'ws-1', 'user-editor', 'MANAGER')
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows user with project.archive to archive project and records audit event', async () => {
      mockPrisma.project.findFirst.mockResolvedValue({
        id: 'prj-1',
        workspaceId: 'ws-1',
        name: 'Project 1',
        status: 'ACTIVE',
        classification: 'INTERNAL',
      });
      mockPrisma.fieldDefinition.findMany.mockResolvedValue([]);
      mockAuthService.enforce.mockResolvedValue(undefined);
      mockPrisma.project.update.mockResolvedValue({
        id: 'prj-1',
        status: 'ARCHIVED',
      });

      const archived = await projectsService.archiveProject('prj-1', 'ws-1', 'archiver-user', 'ADMIN');
      expect(archived.status).toBe('ARCHIVED');
      expect(mockAuditService.recordAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'PROJECT_ARCHIVED',
          targetId: 'prj-1',
        })
      );
    });

    it('restores soft-deleted project and restores child tasks when authorized with project.restore', async () => {
      mockPrisma.project.findFirst.mockResolvedValue({
        id: 'prj-1',
        workspaceId: 'ws-1',
        name: 'Project 1',
        status: 'DELETED',
        deletedAt: new Date(Date.now() - 5000),
      });
      mockAuthService.enforce.mockResolvedValue(undefined);
      mockPrisma.project.update.mockResolvedValue({
        id: 'prj-1',
        status: 'ACTIVE',
        deletedAt: null,
      });

      const restored = await projectsService.restoreProject('prj-1', 'ws-1', 'restorer-user', 'ADMIN', {
        reason: 'Restoring project after mistaken deletion',
      });

      expect(restored.status).toBe('ACTIVE');
      expect(restored.deletedAt).toBeNull();
      expect(mockPrisma.node.updateMany).toHaveBeenCalledWith({
        where: { projectId: 'prj-1', deletedAt: { not: null } },
        data: { deletedAt: null },
      });
      expect(mockAuditService.recordAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'PROJECT_RESTORED',
          targetId: 'prj-1',
        })
      );
    });
  });

  // =========================================================================
  // SCENARIO 9: CROSS-PROJECT DEPENDENCY PROTECTION
  // =========================================================================
  describe('Scenario 9: Cross-Project Dependency Safety', () => {
    it('blocks project deletion without force when external projects depend on its tasks', async () => {
      mockPrisma.project.findFirst.mockResolvedValue({
        id: 'prj-source',
        workspaceId: 'ws-1',
        name: 'Upstream Initiative',
        deletedAt: null,
      });
      mockPrisma.edge.findMany.mockResolvedValue([
        {
          sourceNodeId: 'node-core',
          targetNodeId: 'node-downstream',
          targetNode: {
            id: 'node-downstream',
            title: 'Downstream Integration',
            project: { id: 'prj-dest', name: 'Downstream Mobile App' },
          },
        },
      ]);

      await expect(
        projectsService.deleteProject('prj-source', 'ws-1', 'user-1', 'ADMIN', {
          reason: 'Decommissioning',
          force: false,
        })
      ).rejects.toThrow(ConflictException);
    });

    it('allows soft-deletion with force: true and preserves cross-project dependencies in DB for audit trail', async () => {
      mockPrisma.project.findFirst.mockResolvedValue({
        id: 'prj-source',
        workspaceId: 'ws-1',
        name: 'Upstream Initiative',
        status: 'ACTIVE',
        deletedAt: null,
      });
      mockPrisma.edge.findMany.mockResolvedValue([
        {
          sourceNodeId: 'node-core',
          targetNodeId: 'node-downstream',
          targetNode: {
            id: 'node-downstream',
            title: 'Downstream Integration',
            project: { id: 'prj-dest', name: 'Downstream Mobile App' },
          },
        },
      ]);
      mockPrisma.project.update.mockResolvedValue({
        id: 'prj-source',
        status: 'DELETED',
        deletedAt: new Date(),
      });

      const result = await projectsService.deleteProject('prj-source', 'ws-1', 'user-1', 'ADMIN', {
        reason: 'Forced deprecation approved by executive steering committee',
        force: true,
      });

      expect(result.status).toBe('DELETED');
      // Cross project edges are NOT hard deleted during soft deletion
      expect(mockPrisma.edge.deleteMany).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // SCENARIO 12: PERMANENT PURGE & RETENTION SAFETY
  // =========================================================================
  describe('Scenario 12: Permanent Purge Privilege & Retention Enforcement', () => {
    it('rejects permanent purge attempt by non-admin users', async () => {
      mockPrisma.project.findFirst.mockResolvedValue({
        id: 'prj-trash',
        workspaceId: 'ws-1',
        name: 'Trashed Project',
        deletedAt: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000),
      });
      mockAuthService.can.mockResolvedValue(false);

      await expect(
        projectsService.purgeProject('prj-trash', 'ws-1', 'user-manager', 'MANAGER', {
          confirmationKey: 'Trashed Project',
          justification: 'Cleanup',
        })
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects permanent purge if project is not in trash state', async () => {
      mockPrisma.project.findFirst.mockResolvedValue({
        id: 'prj-active',
        workspaceId: 'ws-1',
        name: 'Active Project',
        deletedAt: null, // Still active
      });

      await expect(
        projectsService.purgeProject('prj-active', 'ws-1', 'admin-1', 'ADMIN', {
          confirmationKey: 'Active Project',
          justification: 'Immediate purge',
        })
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects purge if confirmation key does not match project name or key', async () => {
      mockPrisma.project.findFirst.mockResolvedValue({
        id: 'prj-trash',
        workspaceId: 'ws-1',
        name: 'Project Horizon',
        key: 'PRJ-HORIZON',
        deletedAt: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000),
      });

      await expect(
        projectsService.purgeProject('prj-trash', 'ws-1', 'admin-1', 'ADMIN', {
          confirmationKey: 'Wrong Key',
          justification: 'Legal requirement',
        })
      ).rejects.toThrow(BadRequestException);
    });

    it('enforces 30-day retention rule unless explicit administrator waiver is provided', async () => {
      mockPrisma.project.findFirst.mockResolvedValue({
        id: 'prj-recent',
        workspaceId: 'ws-1',
        name: 'Project Recent',
        deletedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000), // only 5 days in trash
      });

      await expect(
        projectsService.purgeProject('prj-recent', 'ws-1', 'admin-1', 'ADMIN', {
          confirmationKey: 'Project Recent',
          justification: 'Routine cleanup',
          forceRetentionWaiver: false,
        })
      ).rejects.toThrow(BadRequestException);
    });

    it('executes permanent purge with valid confirmation, justification, and retention waiver while preserving immutable audit logs', async () => {
      mockPrisma.project.findFirst.mockResolvedValue({
        id: 'prj-trash',
        workspaceId: 'ws-1',
        name: 'Project Horizon',
        key: 'PRJ-HORIZON',
        deletedAt: new Date(Date.now() - 35 * 24 * 60 * 60 * 1000), // 35 days in trash
      });
      mockPrisma.project.delete.mockResolvedValue({ id: 'prj-trash' });

      const result = await projectsService.purgeProject('prj-trash', 'ws-1', 'admin-1', 'ADMIN', {
        confirmationKey: 'Project Horizon',
        justification: 'GDPR right-to-be-forgotten compliance mandate',
      });

      expect(result.success).toBe(true);
      expect(mockPrisma.project.delete).toHaveBeenCalledWith({ where: { id: 'prj-trash' } });
      expect(mockAuditService.recordAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'PROJECT_PURGED',
          targetId: 'prj-trash',
          reason: 'GDPR right-to-be-forgotten compliance mandate',
          outcome: 'PERMANENTLY_PURGED',
        })
      );
    });
  });

  // =========================================================================
  // SCENARIO 14: CONFIDENTIALITY-AWARE EVENT-DRIVEN NOTIFICATIONS
  // =========================================================================
  describe('Scenario 14: Confidentiality Filter on Notifications', () => {
    it('masks notification title and body when recipient lacks clearance for a confidential project', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-unauthorized' });
      mockPrisma.notification.findUnique.mockResolvedValue(null); // No dedup collision
      mockPrisma.project.findUnique.mockResolvedValue({
        id: 'prj-secret',
        name: 'Project Manhattan M&A',
        classification: 'HIGHLY_CONFIDENTIAL',
        ownerId: 'owner-exec',
        responsibleManagerId: 'manager-exec',
      });
      mockAuthService.can.mockResolvedValue(false); // Unauthorized user!

      let createdData: any = null;
      mockPrisma.notification.create.mockImplementation((args: any) => {
        createdData = args.data;
        return { id: 'notif-1', ...args.data };
      });

      await notificationsService.sendNotification({
        workspaceId: 'ws-1',
        projectId: 'prj-secret',
        userId: 'user-unauthorized',
        type: 'ASSIGNMENT',
        title: 'Assigned to Project Manhattan M&A: Target Valuation',
        body: 'Please review the valuation dossier for Project Manhattan M&A.',
      });

      expect(createdData).not.toBeNull();
      // Must NOT leak the confidential project name!
      expect(createdData.title).toBe('[Confidential Initiative] Update');
      expect(createdData.title).not.toContain('Manhattan');
      expect(createdData.body).not.toContain('Manhattan');
      expect(createdData.data.isMaskedForConfidentiality).toBe(true);
    });

    it('preserves full title and body when recipient is authorized for the confidential project', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'owner-exec' });
      mockPrisma.notification.findUnique.mockResolvedValue(null);
      mockPrisma.project.findUnique.mockResolvedValue({
        id: 'prj-secret',
        name: 'Project Manhattan M&A',
        classification: 'HIGHLY_CONFIDENTIAL',
        ownerId: 'owner-exec',
        responsibleManagerId: 'manager-exec',
      });
      mockAuthService.can.mockResolvedValue(true); // Authorized!

      let createdData: any = null;
      mockPrisma.notification.create.mockImplementation((args: any) => {
        createdData = args.data;
        return { id: 'notif-2', ...args.data };
      });

      await notificationsService.sendNotification({
        workspaceId: 'ws-1',
        projectId: 'prj-secret',
        userId: 'owner-exec',
        type: 'ASSIGNMENT',
        title: 'Assigned to Project Manhattan M&A: Target Valuation',
        body: 'Please review the valuation dossier for Project Manhattan M&A.',
      });

      expect(createdData.title).toBe('Assigned to Project Manhattan M&A: Target Valuation');
      expect(createdData.data.isMaskedForConfidentiality).toBe(false);
    });
  });

  // =========================================================================
  // SCENARIO 15: APPROVAL ESCALATION & REMINDER SCHEDULER
  // =========================================================================
  describe('Scenario 15: Approval Escalation & Reminder Scheduler', () => {
    it('detects overdue pending approval stages, triggers escalation notification and logs audit event', async () => {
      const pastDate = new Date(Date.now() - 48 * 60 * 60 * 1000); // 48h ago
      mockPrisma.approvalStageInstance.findMany.mockResolvedValue([
        {
          id: 'stage-inst-1',
          name: 'Executive Sign-off',
          status: 'PENDING',
          dueDate: pastDate,
          escalateToUserId: 'vp-operations',
          assignedApproverId: 'cfo-user',
          approvalRequestId: 'req-400',
          approvalRequest: { workspaceId: 'ws-1', submitterId: 'submitter-1' },
        },
      ]);
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'vp-operations' });
      mockPrisma.notification.findUnique.mockResolvedValue(null);
      mockPrisma.notification.create.mockResolvedValue({ id: 'notif-esc' });

      const report = await notificationsService.processApprovalEscalations('ws-1');

      expect(report.escalatedCount).toBe(1);
      expect(mockPrisma.notification.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: 'vp-operations',
            type: 'APPROVAL_ESCALATION',
            title: expect.stringContaining('Approval Escalation'),
          }),
        })
      );
      expect(mockAuditService.recordAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'APPROVAL_ESCALATED',
          targetId: 'stage-inst-1',
        })
      );
    });

    it('sends reminders for stages due within 24 hours to the assigned approver', async () => {
      const soonDate = new Date(Date.now() + 12 * 60 * 60 * 1000); // 12h in future
      mockPrisma.approvalStageInstance.findMany.mockResolvedValue([
        {
          id: 'stage-inst-2',
          name: 'Legal Review',
          status: 'PENDING',
          dueDate: soonDate,
          assignedApproverId: 'legal-counsel',
          approvalRequestId: 'req-500',
          approvalRequest: { workspaceId: 'ws-1' },
        },
      ]);
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'legal-counsel' });
      mockPrisma.notification.findUnique.mockResolvedValue(null);
      mockPrisma.notification.create.mockResolvedValue({ id: 'notif-rem' });

      const report = await notificationsService.processApprovalEscalations('ws-1');

      expect(report.remindersSent).toBe(1);
      expect(mockPrisma.notification.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: 'legal-counsel',
            type: 'DEADLINE_REMINDER',
            title: expect.stringContaining('Approval Reminder'),
          }),
        })
      );
    });
  });

  // =========================================================================
  // SECURITY SWEEP: IDOR, MULTI-TENANT ISOLATION & SAFE ERRORS
  // =========================================================================
  describe('Security Sweep: IDOR, Tenant Isolation & Error Masking', () => {
    it('returns 404 on cross-organization / foreign-tenant project access to prevent IDOR enumeration', async () => {
      // Trying to access project belonging to ws-tenant-b from ws-tenant-a
      mockPrisma.project.findFirst.mockResolvedValue(null); // Scoped query where: { id, workspaceId: 'ws-tenant-a' } finds nothing!

      await expect(
        projectsService.getProject('prj-tenant-b', 'ws-tenant-a', { id: 'user-a' })
      ).rejects.toThrow(NotFoundException);
    });

    it('prevents mass assignment of system columns during update', async () => {
      mockPrisma.project.findFirst.mockResolvedValue({
        id: 'prj-1',
        workspaceId: 'ws-1',
        name: 'Original Name',
        version: 1,
        classification: 'INTERNAL',
      });
      mockPrisma.fieldDefinition.findMany.mockResolvedValue([]);
      mockAuthService.enforce.mockResolvedValue(undefined);

      let updateData: any = null;
      mockPrisma.project.update.mockImplementation((args: any) => {
        updateData = args.data;
        return { id: 'prj-1', ...args.data };
      });

      // Attacker attempts to modify deletedAt and workspaceId via project update
      await projectsService.updateProject(
        'prj-1',
        'ws-1',
        {
          name: 'Renamed Project',
          // Maliciously injected fields not in UpdateProjectDto
          ...({ deletedAt: new Date(), workspaceId: 'hacked-workspace' } as any),
        },
        'user-1',
        'MANAGER'
      );

      expect(updateData.name).toBe('Renamed Project');
      // Protected system fields must never be passed to update!
      expect(updateData.workspaceId).toBeUndefined();
      expect(updateData.deletedAt).toBeUndefined();
    });
  });
});
