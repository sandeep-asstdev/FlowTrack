import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  Req,
  Headers,
  BadRequestException,
} from '@nestjs/common';
import { ProjectsService } from './projects.service';
import { CreateProjectDto, UpdateProjectDto } from '@flowtrack/shared';
import { AuthGuard } from '@nestjs/passport';
import { CpmService } from './cpm.service';

@UseGuards(AuthGuard('jwt'))
@Controller('projects')
export class ProjectsController {
  constructor(
    private readonly projectsService: ProjectsService,
    private readonly cpmService: CpmService
  ) {}

  private getWorkspaceId(req: any, headerWorkspaceId?: string): string {
    const wsId = headerWorkspaceId || req.user?.activeWorkspaceId || req.user?.workspaceId;
    if (!wsId) {
      throw new BadRequestException('Workspace ID is required in X-Workspace-Id header');
    }
    return wsId;
  }

  @Get()
  list(@Req() req: any, @Headers('x-workspace-id') headerWsId?: string) {
    const wsId = this.getWorkspaceId(req, headerWsId);
    return this.projectsService.listWorkspaceProjects(wsId, req.user);
  }

  @Get('trash')
  listTrash(@Req() req: any, @Headers('x-workspace-id') headerWsId?: string) {
    const wsId = this.getWorkspaceId(req, headerWsId);
    return this.projectsService.listTrashProjects(wsId, req.user);
  }

  @Post()
  create(
    @Req() req: any,
    @Body() dto: CreateProjectDto,
    @Headers('x-workspace-id') headerWsId?: string
  ) {
    const wsId = this.getWorkspaceId(req, headerWsId);
    const actorId = req.user?.id || req.user?.sub;
    return this.projectsService.createProject(wsId, dto, actorId, req.user?.role);
  }

  @Get(':id')
  get(
    @Req() req: any,
    @Param('id') id: string,
    @Headers('x-workspace-id') headerWsId?: string
  ) {
    const wsId = this.getWorkspaceId(req, headerWsId);
    return this.projectsService.getProject(id, wsId, req.user);
  }

  @Get(':id/critical-path')
  getCriticalPath(
    @Req() req: any,
    @Param('id') id: string,
    @Headers('x-workspace-id') headerWsId?: string
  ) {
    const wsId = this.getWorkspaceId(req, headerWsId);
    return this.cpmService.calculateProjectCriticalPath(id, wsId);
  }

  @Patch(':id')
  update(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateProjectDto,
    @Headers('x-workspace-id') headerWsId?: string
  ) {
    const wsId = this.getWorkspaceId(req, headerWsId);
    const actorId = req.user?.id || req.user?.sub;
    return this.projectsService.updateProject(id, wsId, dto, actorId, req.user?.role);
  }

  @Get(':id/deletion-impact')
  getDeletionImpact(
    @Req() req: any,
    @Param('id') id: string,
    @Headers('x-workspace-id') headerWsId?: string
  ) {
    const wsId = this.getWorkspaceId(req, headerWsId);
    const actorId = req.user?.id || req.user?.sub;
    return this.projectsService.getProjectDeletionImpact(id, wsId, actorId, req.user?.role);
  }

  @Delete(':id')
  delete(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto?: any,
    @Headers('x-workspace-id') headerWsId?: string
  ) {
    const wsId = this.getWorkspaceId(req, headerWsId);
    const actorId = req.user?.id || req.user?.sub;
    return this.projectsService.deleteProject(id, wsId, actorId, req.user?.role, dto);
  }

  @Post(':id/delete')
  deleteWithPost(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto?: any,
    @Headers('x-workspace-id') headerWsId?: string
  ) {
    const wsId = this.getWorkspaceId(req, headerWsId);
    const actorId = req.user?.id || req.user?.sub;
    return this.projectsService.deleteProject(id, wsId, actorId, req.user?.role, dto);
  }

  @Post(':id/restore')
  restore(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto?: any,
    @Headers('x-workspace-id') headerWsId?: string
  ) {
    const wsId = this.getWorkspaceId(req, headerWsId);
    const actorId = req.user?.id || req.user?.sub;
    return this.projectsService.restoreProject(id, wsId, actorId, req.user?.role, dto);
  }

  @Post(':id/archive')
  archive(
    @Req() req: any,
    @Param('id') id: string,
    @Headers('x-workspace-id') headerWsId?: string
  ) {
    const wsId = this.getWorkspaceId(req, headerWsId);
    const actorId = req.user?.id || req.user?.sub;
    return this.projectsService.archiveProject(id, wsId, actorId, req.user?.role);
  }

  @Post(':id/unarchive')
  unarchive(
    @Req() req: any,
    @Param('id') id: string,
    @Headers('x-workspace-id') headerWsId?: string
  ) {
    const wsId = this.getWorkspaceId(req, headerWsId);
    const actorId = req.user?.id || req.user?.sub;
    return this.projectsService.unarchiveProject(id, wsId, actorId, req.user?.role);
  }

  @Post(':id/purge')
  purge(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto?: any,
    @Headers('x-workspace-id') headerWsId?: string
  ) {
    const wsId = this.getWorkspaceId(req, headerWsId);
    const actorId = req.user?.id || req.user?.sub;
    return this.projectsService.purgeProject(id, wsId, actorId, req.user?.role, dto);
  }

  @Post(':id/clone')
  clone(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: any,
    @Headers('x-workspace-id') headerWsId?: string
  ) {
    const wsId = this.getWorkspaceId(req, headerWsId);
    const actorId = req.user?.id || req.user?.sub;
    return this.projectsService.cloneProject(id, wsId, actorId, dto);
  }

  @Post(':id/save-as-template')
  saveAsTemplate(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: any,
    @Headers('x-workspace-id') headerWsId?: string
  ) {
    const wsId = this.getWorkspaceId(req, headerWsId);
    const actorId = req.user?.id || req.user?.sub;
    return this.projectsService.saveAsTemplate(id, wsId, actorId, dto);
  }

  @Get(':id/members')
  getMembers(
    @Req() req: any,
    @Param('id') id: string,
    @Headers('x-workspace-id') headerWsId?: string
  ) {
    const wsId = this.getWorkspaceId(req, headerWsId);
    return this.projectsService.listProjectMembers(id, wsId);
  }

  @Post(':id/members')
  addMember(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: any,
    @Headers('x-workspace-id') headerWsId?: string
  ) {
    const wsId = this.getWorkspaceId(req, headerWsId);
    const actorId = req.user?.id || req.user?.sub;
    return this.projectsService.addOrUpdateProjectMember(id, wsId, actorId, dto);
  }

  @Delete(':id/members/:userId')
  removeMember(
    @Req() req: any,
    @Param('id') id: string,
    @Param('userId') userId: string,
    @Headers('x-workspace-id') headerWsId?: string
  ) {
    const wsId = this.getWorkspaceId(req, headerWsId);
    const actorId = req.user?.id || req.user?.sub;
    return this.projectsService.removeProjectMember(id, wsId, actorId, userId);
  }
}

