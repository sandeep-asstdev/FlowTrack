import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
  Headers,
  BadRequestException,
} from '@nestjs/common';
import { OrganizationService } from './organization.service';
import { AuthGuard } from '@nestjs/passport';
import { RoleScopeType } from '@prisma/client';

@UseGuards(AuthGuard('jwt'))
@Controller('organization')
export class OrganizationController {
  constructor(private readonly orgService: OrganizationService) {}

  private getWorkspaceId(req: any, headerWorkspaceId?: string): string {
    const wsId = headerWorkspaceId || req.user.activeWorkspaceId;
    if (!wsId) {
      throw new BadRequestException('Workspace ID is required in X-Workspace-Id header');
    }
    return wsId;
  }

  // ==========================================
  // DEPARTMENTS
  // ==========================================

  @Get('departments')
  listDepartments(@Req() req: any, @Headers('x-workspace-id') headerWsId?: string) {
    const wsId = this.getWorkspaceId(req, headerWsId);
    return this.orgService.listDepartments(wsId);
  }

  @Post('departments')
  createDepartment(
    @Req() req: any,
    @Body() dto: { name: string; code?: string; parentId?: string; leaderId?: string },
    @Headers('x-workspace-id') headerWsId?: string
  ) {
    const wsId = this.getWorkspaceId(req, headerWsId);
    const actorId = req.user?.id || req.user?.sub;
    return this.orgService.createDepartment(wsId, actorId, dto);
  }

  @Patch('departments/:id')
  updateDepartment(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: { name?: string; code?: string; parentId?: string | null; leaderId?: string | null },
    @Headers('x-workspace-id') headerWsId?: string
  ) {
    const wsId = this.getWorkspaceId(req, headerWsId);
    const actorId = req.user?.id || req.user?.sub;
    return this.orgService.updateDepartment(wsId, id, actorId, dto);
  }

  @Delete('departments/:id')
  deleteDepartment(
    @Req() req: any,
    @Param('id') id: string,
    @Headers('x-workspace-id') headerWsId?: string
  ) {
    const wsId = this.getWorkspaceId(req, headerWsId);
    const actorId = req.user?.id || req.user?.sub;
    return this.orgService.deleteDepartment(wsId, id, actorId);
  }

  // ==========================================
  // POSITIONS
  // ==========================================

  @Get('positions')
  listPositions(
    @Req() req: any,
    @Query('departmentId') departmentId?: string,
    @Headers('x-workspace-id') headerWsId?: string
  ) {
    const wsId = this.getWorkspaceId(req, headerWsId);
    return this.orgService.listPositions(wsId, departmentId);
  }

  @Post('positions')
  createPosition(
    @Req() req: any,
    @Body() dto: { title: string; departmentId: string; reportsToPositionId?: string },
    @Headers('x-workspace-id') headerWsId?: string
  ) {
    const wsId = this.getWorkspaceId(req, headerWsId);
    const actorId = req.user?.id || req.user?.sub;
    return this.orgService.createPosition(wsId, actorId, dto);
  }

  @Patch('positions/:id')
  updatePosition(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: { title?: string; departmentId?: string; reportsToPositionId?: string | null },
    @Headers('x-workspace-id') headerWsId?: string
  ) {
    const wsId = this.getWorkspaceId(req, headerWsId);
    const actorId = req.user?.id || req.user?.sub;
    return this.orgService.updatePosition(wsId, id, actorId, dto);
  }

  // ==========================================
  // SCOPED ROLES
  // ==========================================

  @Get('scoped-roles')
  listScopedRoles(
    @Req() req: any,
    @Query('userId') userId?: string,
    @Query('scopeId') scopeId?: string,
    @Headers('x-workspace-id') headerWsId?: string
  ) {
    const wsId = this.getWorkspaceId(req, headerWsId);
    return this.orgService.listScopedRoles(wsId, userId, scopeId);
  }

  @Post('scoped-roles')
  assignScopedRole(
    @Req() req: any,
    @Body()
    dto: {
      userId: string;
      roleScope: RoleScopeType;
      scopeId: string;
      roleName: string;
      permissions?: string[];
    },
    @Headers('x-workspace-id') headerWsId?: string
  ) {
    const wsId = this.getWorkspaceId(req, headerWsId);
    const actorId = req.user?.id || req.user?.sub;
    return this.orgService.assignScopedRole(wsId, actorId, dto);
  }

  @Delete('scoped-roles/:id')
  revokeScopedRole(
    @Req() req: any,
    @Param('id') id: string,
    @Headers('x-workspace-id') headerWsId?: string
  ) {
    const wsId = this.getWorkspaceId(req, headerWsId);
    const actorId = req.user?.id || req.user?.sub;
    return this.orgService.revokeScopedRole(wsId, id, actorId);
  }

  // ==========================================
  // ACCESS GRANTS
  // ==========================================

  @Get('access-grants')
  listAccessGrants(
    @Req() req: any,
    @Query('resourceType') resourceType?: string,
    @Query('resourceId') resourceId?: string,
    @Headers('x-workspace-id') headerWsId?: string
  ) {
    const wsId = this.getWorkspaceId(req, headerWsId);
    return this.orgService.listAccessGrants(wsId, resourceType, resourceId);
  }

  @Post('access-grants')
  createAccessGrant(
    @Req() req: any,
    @Body()
    dto: {
      resourceType: string;
      resourceId: string;
      granteeType: string;
      granteeId: string;
      expiresAt?: string;
    },
    @Headers('x-workspace-id') headerWsId?: string
  ) {
    const wsId = this.getWorkspaceId(req, headerWsId);
    const actorId = req.user?.id || req.user?.sub;
    return this.orgService.createAccessGrant(wsId, actorId, dto);
  }

  @Delete('access-grants/:id')
  revokeAccessGrant(
    @Req() req: any,
    @Param('id') id: string,
    @Headers('x-workspace-id') headerWsId?: string
  ) {
    const wsId = this.getWorkspaceId(req, headerWsId);
    const actorId = req.user?.id || req.user?.sub;
    return this.orgService.revokeAccessGrant(wsId, id, actorId);
  }

  // ==========================================
  // BACKUP APPROVER & REASSIGNMENT
  // ==========================================

  @Post('members/:userId/backup-reviewer')
  setBackupReviewer(
    @Req() req: any,
    @Param('userId') userId: string,
    @Body() body: { backupReviewerId: string | null },
    @Headers('x-workspace-id') headerWsId?: string
  ) {
    const wsId = this.getWorkspaceId(req, headerWsId);
    const actorId = req.user?.id || req.user?.sub;
    return this.orgService.setBackupReviewer(wsId, userId, body.backupReviewerId, actorId);
  }

  @Post('members/:userId/reassign')
  reassignWork(
    @Req() req: any,
    @Param('userId') userId: string,
    @Body() body: { targetUserId: string },
    @Headers('x-workspace-id') headerWsId?: string
  ) {
    const wsId = this.getWorkspaceId(req, headerWsId);
    const actorId = req.user?.id || req.user?.sub;
    return this.orgService.reassignUserWork(wsId, userId, body.targetUserId, actorId);
  }
}
