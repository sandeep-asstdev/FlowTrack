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
import { NodesService } from './nodes.service';
import {
  CreateNodeDto,
  UpdateNodeDto,
  BatchUpdateNodePositionsDto,
  ApproveTaskDto,
  ReportBlockerDto,
  RequestDeadlineExtensionDto,
} from '@flowtrack/shared';
import { AuthGuard } from '@nestjs/passport';

@UseGuards(AuthGuard('jwt'))
@Controller('nodes')
export class NodesController {
  constructor(private readonly nodesService: NodesService) {}

  @Get()
  list(
    @Query('projectId') projectId: string,
    @Query('parentNodeId') parentNodeId?: string,
    @Query('search') search?: string,
    @Query('customFieldKey') customFieldKey?: string,
    @Query('customFieldValue') customFieldValue?: string
  ) {
    if (!projectId) {
      throw new BadRequestException('projectId query parameter is required');
    }
    return this.nodesService.listProjectNodes(projectId, parentNodeId, {
      search,
      customFieldKey,
      customFieldValue,
    });
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.nodesService.getNode(id);
  }

  @Post()
  create(
    @Req() req: any,
    @Body() dto: CreateNodeDto,
    @Headers('x-workspace-id') headerWsId?: string
  ) {
    const wsId = headerWsId || req.user.activeWorkspaceId;
    return this.nodesService.createNode(wsId, dto);
  }

  @Patch('batch-positions')
  batchPositions(@Body() dto: BatchUpdateNodePositionsDto) {
    return this.nodesService.batchUpdatePositions(dto);
  }

  @Patch(':id')
  update(@Req() req: any, @Param('id') id: string, @Body() dto: UpdateNodeDto) {
    return this.nodesService.updateNode(id, dto, req.user?.id);
  }

  @Post(':id/approve')
  approve(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: ApproveTaskDto
  ) {
    return this.nodesService.approveTask(id, req.user.id, dto);
  }

  @Post(':id/blocker')
  reportBlocker(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: ReportBlockerDto
  ) {
    return this.nodesService.reportBlocker(id, req.user.id, dto);
  }

  @Post(':id/deadline-extension')
  requestDeadlineExtension(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: RequestDeadlineExtensionDto
  ) {
    return this.nodesService.requestDeadlineExtension(id, req.user.id, dto);
  }

  @Post(':id/remarks')
  addRemark(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: { body: string; voiceUrl?: string; photoUrl?: string }
  ) {
    return this.nodesService.addRemark(id, req.user.id, body.body, body.voiceUrl, body.photoUrl);
  }

  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.nodesService.deleteNode(id);
  }
}
