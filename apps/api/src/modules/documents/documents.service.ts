import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CollaborationGateway } from '../collaboration/collaboration.gateway';
import {
  CreateDocumentDto,
  EvidenceReviewDto,
  MAX_DOCUMENT_SIZE_BYTES,
  BLOCKED_EXTENSIONS,
} from '@flowtrack/shared';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name);
  private readonly vaultPath: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly notificationsService: NotificationsService,
    private readonly gateway: CollaborationGateway
  ) {
    this.vaultPath = path.resolve(process.cwd(), 'vault_storage');
    if (!fs.existsSync(this.vaultPath)) {
      try {
        fs.mkdirSync(this.vaultPath, { recursive: true });
      } catch (err: any) {
        this.logger.warn(`Could not create vault storage directory: ${err.message}`);
      }
    }
  }

  /**
   * Validates document filename and size against security constraints.
   */
  private validateFileSecurity(name: string, fileSize: number) {
    const ext = path.extname(name).toLowerCase();
    if (BLOCKED_EXTENSIONS.includes(ext)) {
      throw new BadRequestException(`Uploading executable or script files (${ext}) is strictly prohibited.`);
    }

    if (fileSize > MAX_DOCUMENT_SIZE_BYTES) {
      throw new BadRequestException(`File size (${Math.round(fileSize / (1024 * 1024))}MB) exceeds maximum limit of 25MB.`);
    }
  }

  /**
   * Attaches a document or progress evidence to a node with versioning and security checks.
   */
  async addDocument(nodeId: string, userId: string, dto: CreateDocumentDto, fileBuffer?: Buffer) {
    const node = await this.prisma.node.findUnique({
      where: { id: nodeId },
      include: { project: true },
    });
    if (!node || node.deletedAt) {
      throw new NotFoundException('Task / Node not found');
    }

    // Verify user membership in workspace
    const member = await this.prisma.membership.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId: node.workspaceId,
          userId,
        },
      },
    });

    if (!member) {
      throw new ForbiddenException('You do not have access to upload documents in this workspace.');
    }

    this.validateFileSecurity(dto.name, dto.fileSize);

    // Document Versioning: Check if a document with this name already exists on this node
    const existingDoc = await this.prisma.document.findFirst({
      where: {
        nodeId,
        name: dto.name,
        deletedAt: null,
      },
      orderBy: { version: 'desc' },
    });

    const nextVersion = existingDoc ? existingDoc.version + 1 : 1;
    let storageKey = dto.storageKey || `vault://${Date.now()}-${dto.name}`;

    // If actual binary buffer provided, store safely in protected vault
    if (fileBuffer) {
      const secureFileName = `doc_${Date.now()}_${Math.random().toString(36).substring(2, 9)}${path.extname(dto.name)}`;
      const filePath = path.join(this.vaultPath, secureFileName);
      try {
        fs.writeFileSync(filePath, fileBuffer);
        storageKey = `vault://${secureFileName}`;
      } catch (err: any) {
        this.logger.error(`Failed to write file to vault storage: ${err.message}`, err.stack);
      }
    }

    const document = await this.prisma.document.create({
      data: {
        workspaceId: node.workspaceId,
        nodeId,
        uploadedBy: userId,
        name: dto.name,
        mimeType: dto.mimeType,
        fileSize: BigInt(dto.fileSize),
        storageKey,
        category: dto.category || 'general',
        version: nextVersion,
        description: dto.description || null,
        metadata: {
          ...dto.metadata,
          previousVersionId: existingDoc?.id || null,
          uploadedAt: new Date().toISOString(),
        },
        scanStatus: 'CLEAN',
      },
      include: {
        uploader: { select: { id: true, fullName: true, avatarUrl: true, email: true } },
      },
    });

    // Record Audit Log event
    const isEvidence = dto.category === 'evidence' || dto.category === 'deliverable';
    await this.auditService.log({
      workspaceId: node.workspaceId,
      projectId: node.projectId,
      entityName: 'Document',
      entityId: document.id,
      actorId: userId,
      action: isEvidence ? 'EVIDENCE_SUBMISSION' : 'DOCUMENT_UPLOAD',
      newValues: {
        name: document.name,
        category: document.category,
        version: document.version,
        fileSize: Number(document.fileSize),
        nodeTitle: node.title,
      },
    });

    // If evidence submitted, alert reviewer or project manager
    if (isEvidence && node.reviewerId && node.reviewerId !== userId) {
      await this.notificationsService.sendNotification({
        workspaceId: node.workspaceId,
        projectId: node.projectId,
        userId: node.reviewerId,
        actorId: userId,
        type: 'APPROVAL_REQUEST',
        title: `📑 Progress Evidence Uploaded: ${node.title}`,
        body: `${document.uploader?.fullName || 'A team member'} uploaded evidence "${document.name}" (v${document.version}) for verification on task "${node.title}".`,
        entityType: 'document',
        entityId: document.id,
        dedupKey: `evidence:${node.id}:${document.id}`,
      });
    }

    // Broadcast real-time WebSocket event
    const serializedDoc = {
      ...document,
      fileSize: Number(document.fileSize),
    };
    this.gateway.broadcastToProject(node.projectId, 'node:document_added', {
      nodeId,
      document: serializedDoc,
    });

    return serializedDoc;
  }

  /**
   * Retrieves all documents for a node.
   */
  async getNodeDocuments(nodeId: string, userId: string) {
    const node = await this.prisma.node.findUnique({ where: { id: nodeId } });
    if (!node || node.deletedAt) {
      throw new NotFoundException('Node not found');
    }

    const docs = await this.prisma.document.findMany({
      where: { nodeId, deletedAt: null },
      include: {
        uploader: { select: { id: true, fullName: true, avatarUrl: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return docs.map((d) => ({
      ...d,
      fileSize: Number(d.fileSize),
    }));
  }

  /**
   * Safely retrieves a document file stream / buffer for authorized download.
   */
  async getDocumentForDownload(documentId: string, userId: string) {
    const doc = await this.prisma.document.findUnique({
      where: { id: documentId },
      include: {
        node: true,
        workspace: true,
      },
    });

    if (!doc || doc.deletedAt) {
      throw new NotFoundException('Document not found');
    }

    // Verify workspace membership
    const membership = await this.prisma.membership.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId: doc.workspaceId,
          userId,
        },
      },
    });

    if (!membership) {
      throw new ForbiddenException('Access denied: You are not a member of this workspace.');
    }

    // Handle vault file vs data url
    if (doc.storageKey.startsWith('vault://')) {
      const fileName = doc.storageKey.replace('vault://', '');
      const filePath = path.join(this.vaultPath, fileName);

      if (fs.existsSync(filePath)) {
        return {
          stream: fs.createReadStream(filePath),
          name: doc.name,
          mimeType: doc.mimeType,
          fileSize: Number(doc.fileSize),
        };
      }
    }

    // Fallback if stored inline or mock data URL
    return {
      dataUrl: doc.storageKey,
      name: doc.name,
      mimeType: doc.mimeType,
      fileSize: Number(doc.fileSize),
    };
  }

  /**
   * Reviewer verification for submitted progress evidence.
   */
  async verifyEvidence(documentId: string, reviewerId: string, reviewDto: EvidenceReviewDto) {
    const doc = await this.prisma.document.findUnique({
      where: { id: documentId },
      include: { node: true },
    });

    if (!doc || doc.deletedAt) {
      throw new NotFoundException('Document not found');
    }

    // Verify reviewer is manager or designated reviewer
    const reviewerMembership = await this.prisma.membership.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId: doc.workspaceId,
          userId: reviewerId,
        },
      },
    });

    if (!reviewerMembership || !['ADMIN', 'MANAGER'].includes(reviewerMembership.role)) {
      if (doc.node.reviewerId !== reviewerId) {
        throw new ForbiddenException('Only workspace managers or designated task reviewers can verify evidence.');
      }
    }

    const currentMeta = (doc.metadata as any) || {};
    const updatedMeta = {
      ...currentMeta,
      evidenceVerification: {
        status: reviewDto.decision,
        feedback: reviewDto.feedback,
        verifiedBy: reviewerId,
        verifiedAt: new Date().toISOString(),
      },
    };

    const updated = await this.prisma.document.update({
      where: { id: documentId },
      data: {
        metadata: updatedMeta,
      },
      include: {
        uploader: { select: { id: true, fullName: true, avatarUrl: true } },
      },
    });

    // Audit log evidence verification
    await this.auditService.log({
      workspaceId: doc.workspaceId,
      projectId: doc.node.projectId,
      entityName: 'Document',
      entityId: doc.id,
      actorId: reviewerId,
      action: reviewDto.decision === 'APPROVED' ? 'EVIDENCE_APPROVED' : 'EVIDENCE_REWORK_REQUESTED',
      newValues: {
        decision: reviewDto.decision,
        feedback: reviewDto.feedback,
        documentName: doc.name,
        nodeTitle: doc.node.title,
      },
    });

    // Notify document uploader of decision
    await this.notificationsService.sendNotification({
      workspaceId: doc.workspaceId,
      projectId: doc.node.projectId,
      userId: doc.uploadedBy,
      actorId: reviewerId,
      type: 'APPROVAL_DECISION',
      title: reviewDto.decision === 'APPROVED' ? `✅ Evidence Approved: ${doc.name}` : `⚠️ Rework Requested: ${doc.name}`,
      body: `Reviewer feedback on evidence "${doc.name}": "${reviewDto.feedback}"`,
      entityType: 'document',
      entityId: doc.id,
    });

    return {
      ...updated,
      fileSize: Number(updated.fileSize),
    };
  }

  /**
   * Soft-deletes a document.
   */
  async deleteDocument(documentId: string, userId: string) {
    const doc = await this.prisma.document.findUnique({
      where: { id: documentId },
      include: { node: true },
    });

    if (!doc || doc.deletedAt) {
      throw new NotFoundException('Document not found');
    }

    const deleted = await this.prisma.document.update({
      where: { id: documentId },
      data: { deletedAt: new Date() },
    });

    await this.auditService.log({
      workspaceId: doc.workspaceId,
      projectId: doc.node.projectId,
      entityName: 'Document',
      entityId: doc.id,
      actorId: userId,
      action: 'DOCUMENT_DELETE',
      oldValues: { name: doc.name, version: doc.version },
    });

    return { success: true, id: documentId };
  }
}
