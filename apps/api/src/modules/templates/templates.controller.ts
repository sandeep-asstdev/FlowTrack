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
import { TemplatesService } from './templates.service';
import {
  CreateTemplateDto,
  InstantiateTemplateDto,
  UpdateTemplateDto,
} from '@flowtrack/shared';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { Role } from '@prisma/client';

@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('templates')
export class TemplatesController {
  constructor(private readonly templatesService: TemplatesService) {}

  private getWorkspaceId(req: any, headerWorkspaceId?: string): string {
    const wsId = headerWorkspaceId || req.user.activeWorkspaceId;
    if (!wsId) {
      throw new BadRequestException('Workspace ID is required in X-Workspace-Id header');
    }
    return wsId;
  }

  @Get()
  list(
    @Req() req: any,
    @Headers('x-workspace-id') headerWsId?: string,
    @Query('industry') industry?: string,
    @Query('category') category?: string
  ) {
    const wsId = headerWsId || req.user?.activeWorkspaceId;
    return this.templatesService.listTemplates(wsId, industry, category);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.templatesService.getTemplate(id);
  }

  @Post()
  @Roles(Role.ADMIN, Role.MANAGER)
  create(
    @Req() req: any,
    @Body() dto: CreateTemplateDto,
    @Headers('x-workspace-id') headerWsId?: string
  ) {
    const wsId = this.getWorkspaceId(req, headerWsId);
    const actorId = req.user?.id || req.user?.sub;
    return this.templatesService.createTemplate(dto, wsId, actorId);
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.MANAGER)
  update(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateTemplateDto,
    @Headers('x-workspace-id') headerWsId?: string
  ) {
    const wsId = this.getWorkspaceId(req, headerWsId);
    const actorId = req.user?.id || req.user?.sub;
    return this.templatesService.updateTemplate(id, dto, wsId, actorId);
  }

  @Delete(':id')
  @Roles(Role.ADMIN, Role.MANAGER)
  delete(
    @Req() req: any,
    @Param('id') id: string,
    @Headers('x-workspace-id') headerWsId?: string
  ) {
    const wsId = this.getWorkspaceId(req, headerWsId);
    const actorId = req.user?.id || req.user?.sub;
    return this.templatesService.deleteTemplate(id, wsId, actorId);
  }

  @Post(':id/duplicate')
  @Roles(Role.ADMIN, Role.MANAGER)
  async duplicate(
    @Req() req: any,
    @Param('id') id: string,
    @Headers('x-workspace-id') headerWsId?: string
  ) {
    const wsId = this.getWorkspaceId(req, headerWsId);
    const actorId = req.user?.id || req.user?.sub;
    const original = await this.templatesService.getTemplate(id);
    return this.templatesService.createTemplate(
      {
        name: `${original.name} (Copy)`,
        description: original.description || undefined,
        category: original.category,
        industry: original.industry as any,
        methodology: original.methodology as any,
        icon: original.icon,
        tags: (original.tags as any) || [],
        isPublic: false,
        defaultSettings: original.defaultSettings as any,
        nodeTypes: (original.nodeTypes as any) || [],
        statusSets: (original.statusSets as any) || [],
        graphJson: original.graphJson as any,
      },
      wsId,
      actorId
    );
  }

  @Post(':id/instantiate')
  instantiate(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: InstantiateTemplateDto,
    @Headers('x-workspace-id') headerWsId?: string
  ) {
    const wsId = this.getWorkspaceId(req, headerWsId);
    const actorId = req.user?.id || req.user?.sub;
    const userRole = req.user?.role;
    return this.templatesService.instantiateTemplate(id, wsId, dto, actorId, userRole);
  }
}
