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

@UseGuards(AuthGuard('jwt'))
@Controller('projects')
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  private getWorkspaceId(req: any, headerWorkspaceId?: string): string {
    const wsId = headerWorkspaceId || req.user.activeWorkspaceId;
    if (!wsId) {
      throw new BadRequestException('Workspace ID is required in X-Workspace-Id header');
    }
    return wsId;
  }

  @Get()
  list(@Req() req: any, @Headers('x-workspace-id') headerWsId?: string) {
    const wsId = this.getWorkspaceId(req, headerWsId);
    return this.projectsService.listWorkspaceProjects(wsId);
  }

  @Post()
  create(
    @Req() req: any,
    @Body() dto: CreateProjectDto,
    @Headers('x-workspace-id') headerWsId?: string
  ) {
    const wsId = this.getWorkspaceId(req, headerWsId);
    const actorId = req.user?.id || req.user?.sub;
    return this.projectsService.createProject(wsId, dto, actorId);
  }

  @Get(':id')
  get(
    @Req() req: any,
    @Param('id') id: string,
    @Headers('x-workspace-id') headerWsId?: string
  ) {
    const wsId = this.getWorkspaceId(req, headerWsId);
    return this.projectsService.getProject(id, wsId);
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
    return this.projectsService.updateProject(id, wsId, dto, actorId);
  }

  @Delete(':id')
  delete(
    @Req() req: any,
    @Param('id') id: string,
    @Headers('x-workspace-id') headerWsId?: string
  ) {
    const wsId = this.getWorkspaceId(req, headerWsId);
    return this.projectsService.deleteProject(id, wsId);
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
}

