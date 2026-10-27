import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards, Req } from '@nestjs/common';
import { WorkspacesService } from './workspaces.service';
import { CreateWorkspaceDto, UpdateWorkspaceDto, InviteMemberDto } from '@flowtrack/shared';
import { AuthGuard } from '@nestjs/passport';
import { Role } from '@prisma/client';

@UseGuards(AuthGuard('jwt'))
@Controller('workspaces')
export class WorkspacesController {
  constructor(private readonly workspacesService: WorkspacesService) {}

  @Get()
  list(@Req() req: any) {
    return this.workspacesService.listUserWorkspaces(req.user.id);
  }

  @Post()
  create(@Req() req: any, @Body() dto: CreateWorkspaceDto) {
    return this.workspacesService.createWorkspace(req.user.id, dto);
  }

  @Get(':id')
  get(@Req() req: any, @Param('id') id: string) {
    return this.workspacesService.getWorkspace(id, req.user.id);
  }

  @Patch(':id')
  update(@Req() req: any, @Param('id') id: string, @Body() dto: UpdateWorkspaceDto) {
    return this.workspacesService.updateWorkspace(id, req.user.id, dto);
  }

  @Get(':id/members')
  listMembers(@Req() req: any, @Param('id') id: string) {
    return this.workspacesService.listMembers(id, req.user?.id);
  }

  @Post(':id/members/invite')
  invite(@Req() req: any, @Param('id') id: string, @Body() dto: InviteMemberDto) {
    return this.workspacesService.inviteMember(id, req.user.id, dto);
  }

  @Patch(':id/members/:userId/role')
  updateRole(
    @Req() req: any,
    @Param('id') id: string,
    @Param('userId') userId: string,
    @Body() body: { role: Role }
  ) {
    return this.workspacesService.updateMemberRole(id, req.user.id, userId, body.role);
  }

  @Patch(':id/members/:userId/status')
  updateStatus(
    @Req() req: any,
    @Param('id') id: string,
    @Param('userId') userId: string,
    @Body() body: { isActive?: boolean; active?: boolean }
  ) {
    const isActive = body.isActive !== undefined ? body.isActive : (body.active ?? true);
    return this.workspacesService.updateUserStatus(id, req.user.id, userId, isActive);
  }

  @Delete(':id/members/:userId')
  removeMember(
    @Req() req: any,
    @Param('id') id: string,
    @Param('userId') userId: string
  ) {
    return this.workspacesService.removeMember(id, req.user.id, userId);
  }
}
