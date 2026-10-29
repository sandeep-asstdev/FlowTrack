import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  BadRequestException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApprovalsService, CreateApprovalPolicyDto, CreateApprovalRequestDto, SubmitDecisionDto } from './approvals.service';

@Controller('approvals')
@UseGuards(AuthGuard('jwt'))
export class ApprovalsController {
  constructor(private readonly approvalsService: ApprovalsService) {}

  @Post('policies')
  async createPolicy(
    @Request() req: any,
    @Body() dto: CreateApprovalPolicyDto,
    @Query('workspaceId') workspaceIdQuery?: string
  ) {
    const workspaceId = workspaceIdQuery || req.headers?.['x-workspace-id'] || req.user?.activeWorkspaceId || req.user?.workspaceId || req.user?.memberships?.[0]?.workspaceId;
    if (!workspaceId) throw new BadRequestException('workspaceId is required');
    return this.approvalsService.createPolicy(workspaceId, req.user.id, dto);
  }

  @Put('policies/:id')
  async updatePolicy(
    @Param('id') id: string,
    @Request() req: any,
    @Body() dto: CreateApprovalPolicyDto,
    @Query('workspaceId') workspaceIdQuery?: string
  ) {
    const workspaceId = workspaceIdQuery || req.headers?.['x-workspace-id'] || req.user?.activeWorkspaceId || req.user?.workspaceId || req.user?.memberships?.[0]?.workspaceId;
    if (!workspaceId) throw new BadRequestException('workspaceId is required');
    return this.approvalsService.updatePolicy(id, workspaceId, req.user.id, dto);
  }

  @Get('policies/:id')
  async getPolicy(
    @Param('id') id: string,
    @Request() req: any,
    @Query('workspaceId') workspaceIdQuery?: string
  ) {
    const workspaceId = workspaceIdQuery || req.headers?.['x-workspace-id'] || req.user?.activeWorkspaceId || req.user?.workspaceId || req.user?.memberships?.[0]?.workspaceId;
    if (!workspaceId) throw new BadRequestException('workspaceId is required');
    return this.approvalsService.getPolicy(id, workspaceId);
  }

  @Get('policies')
  async listPolicies(
    @Request() req: any,
    @Query('workspaceId') workspaceIdQuery?: string,
    @Query('operationType') operationType?: string
  ) {
    const workspaceId = workspaceIdQuery || req.headers?.['x-workspace-id'] || req.user?.activeWorkspaceId || req.user?.workspaceId || req.user?.memberships?.[0]?.workspaceId;
    if (!workspaceId) throw new BadRequestException('workspaceId is required');
    return this.approvalsService.listPolicies(workspaceId, operationType);
  }

  @Post('requests')
  async createApprovalRequest(
    @Request() req: any,
    @Body() dto: CreateApprovalRequestDto,
    @Query('workspaceId') workspaceIdQuery?: string
  ) {
    const workspaceId = workspaceIdQuery || req.headers?.['x-workspace-id'] || req.user?.activeWorkspaceId || req.user?.workspaceId || req.user?.memberships?.[0]?.workspaceId;
    if (!workspaceId) throw new BadRequestException('workspaceId is required');
    return this.approvalsService.createApprovalRequest(workspaceId, req.user.id, dto);
  }

  @Get('requests/:id')
  async getApprovalRequest(
    @Param('id') id: string,
    @Request() req: any,
    @Query('workspaceId') workspaceIdQuery?: string
  ) {
    const workspaceId = workspaceIdQuery || req.headers?.['x-workspace-id'] || req.user?.activeWorkspaceId || req.user?.workspaceId || req.user?.memberships?.[0]?.workspaceId;
    if (!workspaceId) throw new BadRequestException('workspaceId is required');
    return this.approvalsService.getApprovalRequest(id, workspaceId);
  }

  @Get('requests')
  async listApprovalRequests(
    @Request() req: any,
    @Query('workspaceId') workspaceIdQuery?: string,
    @Query('status') status?: string,
    @Query('nodeId') nodeId?: string,
    @Query('projectId') projectId?: string
  ) {
    const workspaceId = workspaceIdQuery || req.headers?.['x-workspace-id'] || req.user?.activeWorkspaceId || req.user?.workspaceId || req.user?.memberships?.[0]?.workspaceId;
    if (!workspaceId) throw new BadRequestException('workspaceId is required');
    return this.approvalsService.listApprovalRequests(workspaceId, { status, nodeId, projectId });
  }

  @Post('decide')
  async decide(
    @Request() req: any,
    @Body() body: { taskId?: string; requestId?: string; decision: string; reason?: string; comment?: string; feedback?: string },
    @Query('workspaceId') workspaceIdQuery?: string
  ) {
    const workspaceId = workspaceIdQuery || req.headers?.['x-workspace-id'] || req.user?.activeWorkspaceId || req.user?.workspaceId || req.user?.memberships?.[0]?.workspaceId;
    let targetRequestId = body.requestId;
    if (!targetRequestId && body.taskId) {
      const activeReq = await this.approvalsService.findActiveRequestForTask(body.taskId, workspaceId);
      if (activeReq) {
        targetRequestId = activeReq.id;
      }
    }
    const comment = body.reason || body.comment || body.feedback || '';
    if (!targetRequestId) {
      if (body.taskId) {
        return this.approvalsService.submitTaskDirectDecision(body.taskId, workspaceId, req.user.id, {
          decision: body.decision as any,
          comment,
        });
      }
      throw new BadRequestException('Either requestId or taskId is required');
    }
    return this.approvalsService.submitDecision(targetRequestId, workspaceId, req.user.id, {
      decision: body.decision as any,
      comment,
    });
  }

  @Post('requests/:id/decide')
  async submitDecision(
    @Param('id') id: string,
    @Request() req: any,
    @Body() dto: SubmitDecisionDto,
    @Query('workspaceId') workspaceIdQuery?: string
  ) {
    const workspaceId = workspaceIdQuery || req.headers?.['x-workspace-id'] || req.user?.activeWorkspaceId || req.user?.workspaceId || req.user?.memberships?.[0]?.workspaceId;
    if (!workspaceId) throw new BadRequestException('workspaceId is required');
    return this.approvalsService.submitDecision(id, workspaceId, req.user.id, dto);
  }

  @Post('requests/:id/delegate')
  async delegateApproval(
    @Param('id') id: string,
    @Request() req: any,
    @Body() body: { delegateUserId: string; reason?: string },
    @Query('workspaceId') workspaceIdQuery?: string
  ) {
    const workspaceId = workspaceIdQuery || req.headers?.['x-workspace-id'] || req.user?.activeWorkspaceId || req.user?.workspaceId || req.user?.memberships?.[0]?.workspaceId;
    if (!workspaceId) throw new BadRequestException('workspaceId is required');
    if (!body.delegateUserId) throw new BadRequestException('delegateUserId is required');
    return this.approvalsService.delegateApproval(id, workspaceId, req.user.id, body.delegateUserId, body.reason);
  }
}

