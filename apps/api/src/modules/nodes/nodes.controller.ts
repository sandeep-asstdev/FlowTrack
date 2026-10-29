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
import { TaskLifecycleService } from './task-lifecycle.service';
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
  constructor(
    private readonly nodesService: NodesService,
    private readonly lifecycleService: TaskLifecycleService
  ) {}

  @Get()
  list(
    @Req() req: any,
    @Query('projectId') projectId: string,
    @Query('parentNodeId') parentNodeId?: string,
    @Query('search') search?: string,
    @Query('customFieldKey') customFieldKey?: string,
    @Query('customFieldValue') customFieldValue?: string,
    @Query('ownerId') ownerId?: string,
    @Query('assignedById') assignedById?: string,
    @Query('assignedToMe') assignedToMe?: string,
    @Query('assignedByMe') assignedByMe?: string,
    @Query('teamId') teamId?: string,
    @Query('statusId') statusId?: string,
    @Query('approvalStatus') approvalStatus?: string,
    @Query('dueBefore') dueBefore?: string,
    @Query('dueAfter') dueAfter?: string,
  ) {
    if (!projectId) {
      throw new BadRequestException('projectId query parameter is required');
    }
    const effectiveOwnerId = assignedToMe === 'true' ? req.user?.id : ownerId;
    const effectiveAssignedById = assignedByMe === 'true' ? req.user?.id : assignedById;
    return this.nodesService.listProjectNodes(projectId, parentNodeId, {
      search,
      customFieldKey,
      customFieldValue,
      ownerId: effectiveOwnerId,
      assignedById: effectiveAssignedById,
      teamId,
      statusId,
      approvalStatus,
      dueBefore,
      dueAfter,
    });
  }

  @Get('review-queue')
  getReviewQueue(
    @Req() req: any,
    @Query('workspaceId') workspaceId?: string,
    @Query('projectId') projectId?: string,
  ) {
    return this.nodesService.getReviewQueue(req.user.id, workspaceId, projectId);
  }

  @Get(':id')
  get(@Req() req: any, @Param('id') id: string) {
    return this.nodesService.getNode(id, req.user?.id, req.user?.role);
  }

  @Get(':id/completion-readiness')
  getCompletionReadiness(@Req() req: any, @Param('id') id: string) {
    return this.lifecycleService.evaluateNodeCompletionReadiness(id, req.user?.id);
  }

  @Post()
  create(
    @Req() req: any,
    @Body() dto: CreateNodeDto,
    @Headers('x-workspace-id') headerWsId?: string
  ) {
    const wsId = headerWsId || req.user?.activeWorkspaceId || req.user?.workspaceId;
    return this.nodesService.createNode(wsId, dto, req.user?.id);
  }

  @Patch('batch-positions')
  batchPositions(@Body() dto: BatchUpdateNodePositionsDto) {
    return this.nodesService.batchUpdatePositions(dto);
  }

  @Patch(':id')
  update(@Req() req: any, @Param('id') id: string, @Body() dto: UpdateNodeDto) {
    return this.nodesService.updateNode(id, dto, req.user?.id);
  }

  @Post(':id/transition')
  transition(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: {
      toState: string;
      version?: number;
      reason?: string;
      feedback?: string;
      isEmergencyOverride?: boolean;
      emergencyJustification?: string;
    }
  ) {
    if (!body.toState) {
      throw new BadRequestException('toState is required');
    }
    return this.lifecycleService.transitionNode(id, req.user?.id, body.toState, body);
  }

  @Post(':id/submissions')
  createSubmission(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: { summary?: string; deliverables?: string; customData?: any; metadata?: any }
  ) {
    return this.lifecycleService.createSubmission(id, req.user?.id, body);
  }

  @Get(':id/submissions')
  listSubmissions(@Param('id') id: string) {
    return this.lifecycleService.listSubmissions(id);
  }

  @Post(':id/work-updates')
  createWorkUpdate(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: any
  ) {
    return this.lifecycleService.createWorkUpdate(id, req.user?.id, body);
  }

  @Get(':id/work-updates')
  listWorkUpdates(@Param('id') id: string) {
    return this.lifecycleService.listWorkUpdates(id);
  }

  @Post(':id/evidence')
  attachEvidence(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: any
  ) {
    return this.lifecycleService.attachEvidence(id, req.user?.id, body);
  }

  @Get(':id/evidence')
  listEvidence(
    @Req() req: any,
    @Param('id') id: string
  ) {
    return this.lifecycleService.listEvidence(id, req.user?.id);
  }

  @Get(':id/evidence/:evidenceId/download')
  getEvidenceForDownload(
    @Req() req: any,
    @Param('evidenceId') evidenceId: string
  ) {
    return this.lifecycleService.getEvidenceForDownload(evidenceId, req.user?.id);
  }

  @Post(':id/approve')
  approve(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: ApproveTaskDto
  ) {
    return this.nodesService.approveTask(id, req.user.id, dto);
  }

  @Post(':id/submit')
  submit(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: { notes?: string }
  ) {
    return this.nodesService.submitTask(id, req.user.id, body?.notes);
  }

  @Get(':id/approvals')
  getApprovals(@Param('id') id: string) {
    return this.nodesService.getTaskApprovals(id);
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
