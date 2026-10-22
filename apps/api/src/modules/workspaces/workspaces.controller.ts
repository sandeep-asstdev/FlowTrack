import { Controller, Get, Post, Patch, Body, Param, UseGuards, Req } from '@nestjs/common';
import { WorkspacesService } from './workspaces.service';
import { CreateWorkspaceDto, UpdateWorkspaceDto, InviteMemberDto } from '@flowtrack/shared';
import { AuthGuard } from '@nestjs/passport';

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
  listMembers(@Param('id') id: string) {
    return this.workspacesService.listMembers(id);
  }

  @Post(':id/members/invite')
  invite(@Req() req: any, @Param('id') id: string, @Body() dto: InviteMemberDto) {
    return this.workspacesService.inviteMember(id, req.user.id, dto);
  }
}
