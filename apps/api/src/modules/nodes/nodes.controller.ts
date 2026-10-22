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
import { CreateNodeDto, UpdateNodeDto, BatchUpdateNodePositionsDto } from '@flowtrack/shared';
import { AuthGuard } from '@nestjs/passport';

@UseGuards(AuthGuard('jwt'))
@Controller('nodes')
export class NodesController {
  constructor(private readonly nodesService: NodesService) {}

  @Get()
  list(
    @Query('projectId') projectId: string,
    @Query('parentNodeId') parentNodeId?: string
  ) {
    if (!projectId) {
      throw new BadRequestException('projectId query parameter is required');
    }
    return this.nodesService.listProjectNodes(projectId, parentNodeId);
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

  @Post(':id/remarks')
  addRemark(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: { body: string; voiceUrl?: string; photoUrl?: string }
  ) {
    return this.nodesService.addRemark(id, req.user.id, body.body, body.voiceUrl, body.photoUrl);
  }

  @Get(':id/documents')
  getDocuments(@Param('id') id: string) {
    return this.nodesService.getNodeDocuments(id);
  }

  @Post(':id/documents')
  addDocument(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: { name: string; mimeType: string; fileSize: number; storageKey?: string }
  ) {
    return this.nodesService.addDocument(id, req.user.id, body);
  }

  @Delete('documents/:docId')
  deleteDocument(@Param('docId') docId: string) {
    return this.nodesService.deleteDocument(docId);
  }

  @Get(':id/history')
  getHistory(@Param('id') id: string) {
    return this.nodesService.getNodeHistory(id);
  }

  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.nodesService.deleteNode(id);
  }
}
