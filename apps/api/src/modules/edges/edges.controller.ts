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
import { EdgesService } from './edges.service';
import { CreateEdgeDto, UpdateEdgeDto } from '@flowtrack/shared';
import { AuthGuard } from '@nestjs/passport';

@UseGuards(AuthGuard('jwt'))
@Controller('edges')
export class EdgesController {
  constructor(private readonly edgesService: EdgesService) {}

  @Get()
  list(@Query('projectId') projectId: string) {
    if (!projectId) {
      throw new BadRequestException('projectId query parameter is required');
    }
    return this.edgesService.listProjectEdges(projectId);
  }

  @Post()
  create(
    @Req() req: any,
    @Body() dto: CreateEdgeDto,
    @Headers('x-workspace-id') headerWsId?: string
  ) {
    const wsId = headerWsId || req.user.activeWorkspaceId;
    return this.edgesService.createEdge(wsId, dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateEdgeDto) {
    return this.edgesService.updateEdge(id, dto);
  }

  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.edgesService.deleteEdge(id);
  }
}
