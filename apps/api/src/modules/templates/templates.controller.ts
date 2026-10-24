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
    return this.templatesService.createTemplate(dto, wsId);
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
    return this.templatesService.updateTemplate(id, dto, wsId);
  }

  @Delete(':id')
  @Roles(Role.ADMIN, Role.MANAGER)
  delete(
    @Req() req: any,
    @Param('id') id: string,
    @Headers('x-workspace-id') headerWsId?: string
  ) {
    const wsId = this.getWorkspaceId(req, headerWsId);
    return this.templatesService.deleteTemplate(id, wsId);
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
    return this.templatesService.instantiateTemplate(id, wsId, dto, actorId);
  }
}
