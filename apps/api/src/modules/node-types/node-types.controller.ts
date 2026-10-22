import { Controller, Get, Post, Body, Param, UseGuards, Req, Headers, BadRequestException } from '@nestjs/common';
import { NodeTypesService } from './node-types.service';
import { CreateNodeTypeDto, FieldDefinitionDto } from '@flowtrack/shared';
import { AuthGuard } from '@nestjs/passport';

@UseGuards(AuthGuard('jwt'))
@Controller('node-types')
export class NodeTypesController {
  constructor(private readonly nodeTypesService: NodeTypesService) {}

  @Get()
  list(@Req() req: any, @Headers('x-workspace-id') headerWsId?: string) {
    const wsId = headerWsId || req.user.activeWorkspaceId;
    if (!wsId) {
      throw new BadRequestException('Workspace ID required');
    }
    return this.nodeTypesService.listWorkspaceNodeTypes(wsId);
  }

  @Post()
  create(
    @Req() req: any,
    @Body() dto: CreateNodeTypeDto,
    @Headers('x-workspace-id') headerWsId?: string
  ) {
    const wsId = headerWsId || req.user.activeWorkspaceId;
    return this.nodeTypesService.createNodeType(wsId, dto);
  }

  @Post(':id/fields')
  addField(@Param('id') id: string, @Body() dto: FieldDefinitionDto) {
    return this.nodeTypesService.addField(id, dto);
  }
}
