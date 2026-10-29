import { Controller, Get, Param, Query, UseGuards, Request, Response, BadRequestException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AuditService } from './audit.service';
import type { Response as ExpressResponse } from 'express';

@Controller()
@UseGuards(AuthGuard('jwt'))
export class AuditController {
  constructor(private readonly auditService: AuditService) { }

  @Get('audit/events')
  async searchAuditEvents(
    @Request() req: any,
    @Query('workspaceId') workspaceId: string,
    @Query('actorId') actorId?: string,
    @Query('action') action?: string,
    @Query('targetType') targetType?: string,
    @Query('targetId') targetId?: string,
    @Query('outcome') outcome?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string
  ) {
    const wsId = workspaceId || req.headers?.['x-workspace-id'] || req.user?.activeWorkspaceId || req.user?.workspaceId || req.user?.memberships?.[0]?.workspaceId;
    if (!wsId) {
      throw new BadRequestException('workspaceId is required');
    }

    return this.auditService.searchAuditEvents(wsId, req.user.id, {
      actorId,
      action,
      targetType,
      targetId,
      outcome,
      startDate,
      endDate,
      limit: limit ? parseInt(limit, 10) : 50,
      offset: offset ? parseInt(offset, 10) : 0,
    });
  }

  @Get('audit/events/export')
  async exportAuditEvents(
    @Request() req: any,
    @Response() res: ExpressResponse,
    @Query('workspaceId') workspaceId: string,
    @Query('format') format?: 'csv' | 'json',
    @Query('action') action?: string,
    @Query('targetType') targetType?: string,
    @Query('outcome') outcome?: string
  ) {
    const wsId = workspaceId || req.headers?.['x-workspace-id'] || req.user?.activeWorkspaceId || req.user?.workspaceId || req.user?.memberships?.[0]?.workspaceId;
    if (!wsId) {
      throw new BadRequestException('workspaceId is required');
    }

    const exportResult = await this.auditService.exportAuditEvents(
      wsId,
      req.user.id,
      format === 'csv' ? 'csv' : 'json',
      { action, targetType, outcome }
    );

    res.setHeader('Content-Type', exportResult.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${exportResult.filename}"`);
    return res.send(exportResult.data);
  }

  @Get('nodes/:nodeId/history')
  async getNodeHistory(@Param('nodeId') nodeId: string, @Query('limit') limit?: string) {
    const parsedLimit = limit ? parseInt(limit, 10) : 50;
    return this.auditService.getNodeHistory(nodeId, parsedLimit);
  }

  @Get('projects/:projectId/history')
  async getProjectHistory(
    @Param('projectId') projectId: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('action') action?: string
  ) {
    return this.auditService.getProjectHistory(projectId, {
      limit: limit ? parseInt(limit, 10) : 50,
      offset: offset ? parseInt(offset, 10) : 0,
      action,
    });
  }

  @Get('workspaces/:workspaceId/history')
  async getWorkspaceHistory(
    @Param('workspaceId') workspaceId: string,
    @Request() req: any,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('entityName') entityName?: string,
    @Query('action') action?: string
  ) {
    return this.auditService.getWorkspaceHistory(workspaceId, req.user?.id, {
      limit: limit ? parseInt(limit, 10) : 50,
      offset: offset ? parseInt(offset, 10) : 0,
      entityName,
      action,
    });
  }
}
