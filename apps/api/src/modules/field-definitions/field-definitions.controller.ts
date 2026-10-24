import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Req,
  Headers,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Role } from '@prisma/client';
import { FieldDefinitionsService } from './field-definitions.service';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import {
  CreateFieldDefinitionDto,
  UpdateFieldDefinitionDto,
} from '@flowtrack/shared';

@UseGuards(AuthGuard('jwt'))
@Controller('field-definitions')
export class FieldDefinitionsController {
  constructor(private readonly service: FieldDefinitionsService) {}

  @Get()
  async list(
    @Req() req: any,
    @Headers('x-workspace-id') headerWsId?: string,
    @Query('targetType') targetType?: string,
    @Query('nodeTypeId') nodeTypeId?: string,
    @Query('includeInactive') includeInactive?: string,
    @Query('groupName') groupName?: string
  ) {
    const wsId = headerWsId || req.user?.activeWorkspaceId;
    if (!wsId) {
      throw new BadRequestException('Workspace ID required');
    }

    return this.service.list(wsId, {
      targetType,
      nodeTypeId,
      includeInactive: includeInactive === 'true',
      groupName,
    });
  }

  @Get(':id')
  async getById(@Param('id') id: string) {
    return this.service.getById(id);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  async create(
    @Req() req: any,
    @Body() dto: CreateFieldDefinitionDto,
    @Headers('x-workspace-id') headerWsId?: string
  ) {
    const wsId = headerWsId || req.user?.activeWorkspaceId;
    if (!wsId) {
      throw new BadRequestException('Workspace ID required');
    }

    return this.service.create(wsId, dto, req.user?.id);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  async update(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateFieldDefinitionDto
  ) {
    return this.service.update(id, dto, req.user?.id);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  async delete(
    @Req() req: any,
    @Param('id') id: string,
    @Query('permanent') permanent?: string
  ) {
    return this.service.delete(id, permanent === 'true', req.user?.id);
  }
}
