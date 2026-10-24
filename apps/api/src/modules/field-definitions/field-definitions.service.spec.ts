import { describe, it, expect, beforeEach, vi } from 'vitest';
import { FieldDefinitionsService } from './field-definitions.service';
import { ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';

describe('FieldDefinitionsService', () => {
  let service: FieldDefinitionsService;
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      fieldDefinition: {
        findMany: vi.fn(),
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
        aggregate: vi.fn().mockResolvedValue({ _max: { displayOrder: 0 } }),
      },
      auditLog: {
        create: vi.fn().mockResolvedValue({ id: 'audit-1' }),
      },
    };

    service = new FieldDefinitionsService(mockPrisma);
  });

  it('lists active field definitions for workspace by default', async () => {
    const mockFields = [
      { id: 'f-1', fieldKey: 'contractor', label: 'Contractor', isActive: true },
    ];
    mockPrisma.fieldDefinition.findMany.mockResolvedValue(mockFields);

    const result = await service.list('ws-1', { targetType: 'task' });
    expect(result).toEqual(mockFields);
    expect(mockPrisma.fieldDefinition.findMany).toHaveBeenCalledWith({
      where: { workspaceId: 'ws-1', isActive: true, targetType: 'task' },
      orderBy: [{ groupName: 'asc' }, { displayOrder: 'asc' }, { createdAt: 'asc' }],
      include: {
        nodeType: {
          select: { id: true, name: true, key: true, isGroup: true },
        },
      },
    });
  });

  it('prevents creating duplicate fieldKey within the same workspace and target', async () => {
    mockPrisma.fieldDefinition.findFirst.mockResolvedValue({ id: 'existing-id' });

    await expect(
      service.create('ws-1', {
        fieldKey: 'contractor',
        label: 'Contractor Name',
        type: 'text',
        targetType: 'task',
        required: true,
      })
    ).rejects.toThrow(ConflictException);
  });

  it('validates fieldKey format to prevent invalid or unsafe characters', async () => {
    await expect(
      service.create('ws-1', {
        fieldKey: 'contractor-name-invalid-hyphen!',
        label: 'Contractor',
        type: 'text',
        targetType: 'task',
        required: true,
      })
    ).rejects.toThrow(BadRequestException);
  });

  it('creates field definition and records an audit log entry', async () => {
    mockPrisma.fieldDefinition.findFirst.mockResolvedValue(null);
    const createdField = {
      id: 'field-new',
      workspaceId: 'ws-1',
      fieldKey: 'site_engineer',
      label: 'Site Engineer',
      type: 'user',
      targetType: 'task',
      version: 1,
      isActive: true,
    };
    mockPrisma.fieldDefinition.create.mockResolvedValue(createdField);

    const result = await service.create(
      'ws-1',
      {
        fieldKey: 'site_engineer',
        label: 'Site Engineer',
        type: 'user',
        targetType: 'task',
        required: false,
      },
      'admin-user-id'
    );

    expect(result).toEqual(createdField);
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        workspaceId: 'ws-1',
        entityName: 'FieldDefinition',
        entityId: 'field-new',
        actorId: 'admin-user-id',
        action: 'CREATE',
      }),
    });
  });

  it('increments version on update and records previous and new values', async () => {
    const existing = {
      id: 'field-1',
      workspaceId: 'ws-1',
      fieldKey: 'budget_allocation',
      label: 'Budget Allocation',
      required: false,
      version: 1,
      isActive: true,
    };
    mockPrisma.fieldDefinition.findUnique.mockResolvedValue(existing);
    mockPrisma.fieldDefinition.update.mockResolvedValue({
      ...existing,
      label: 'Total Approved Budget',
      required: true,
      version: 2,
    });

    const updated = await service.update(
      'field-1',
      {
        label: 'Total Approved Budget',
        required: true,
      },
      'manager-user-id'
    );

    expect(updated.version).toBe(2);
    expect(updated.label).toBe('Total Approved Budget');
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'UPDATE',
        entityId: 'field-1',
        actorId: 'manager-user-id',
      }),
    });
  });

  it('soft-retires a field instead of deleting to prevent record corruption', async () => {
    const existing = {
      id: 'field-old',
      workspaceId: 'ws-1',
      fieldKey: 'legacy_code',
      label: 'Legacy Code',
      isActive: true,
      version: 2,
    };
    mockPrisma.fieldDefinition.findUnique.mockResolvedValue(existing);
    mockPrisma.fieldDefinition.update.mockResolvedValue({
      ...existing,
      isActive: false,
      version: 3,
    });

    const retired = await service.delete('field-old', false, 'admin-1');
    expect(retired.isActive).toBe(false);
    expect(mockPrisma.fieldDefinition.update).toHaveBeenCalledWith({
      where: { id: 'field-old' },
      data: {
        isActive: false,
        version: { increment: 1 },
      },
    });
    expect(mockPrisma.fieldDefinition.delete).not.toHaveBeenCalled();
  });

  it('retrieves applicable active fields for stages vs tasks', async () => {
    mockPrisma.fieldDefinition.findMany.mockResolvedValue([]);

    await service.getFieldDefinitionsForNode('ws-1', 'nt-123', true);
    expect(mockPrisma.fieldDefinition.findMany).toHaveBeenCalledWith({
      where: {
        workspaceId: 'ws-1',
        isActive: true,
        OR: [
          { nodeTypeId: 'nt-123' },
          { nodeTypeId: null, targetType: 'stage' },
          { nodeTypeId: null, targetType: 'node' },
        ],
      },
      orderBy: [{ groupName: 'asc' }, { displayOrder: 'asc' }, { createdAt: 'asc' }],
    });
  });
});
