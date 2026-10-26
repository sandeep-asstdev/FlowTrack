import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
  Request,
  Header,
  Res,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ReportsService } from './reports.service';
import { ReportFilterOptions } from '@flowtrack/shared';
import { Response } from 'express';

@Controller('workspaces/:workspaceId/reports')
@UseGuards(AuthGuard('jwt'))
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('project/:projectId')
  async getProjectDashboard(
    @Param('workspaceId') workspaceId: string,
    @Param('projectId') projectId: string,
    @Request() req: any,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('assigneeId') assigneeId?: string,
    @Query('stageId') stageId?: string,
    @Query('statusCategory') statusCategory?: string,
    @Query('priority') priority?: string
  ) {
    const filters: ReportFilterOptions = {
      dateFrom,
      dateTo,
      assigneeId,
      stageId,
      statusCategory,
      priority,
    };

    return this.reportsService.getProjectDashboard(
      workspaceId,
      projectId,
      req.user.id,
      filters
    );
  }

  @Get('workspace')
  async getWorkspaceDashboard(
    @Param('workspaceId') workspaceId: string,
    @Request() req: any
  ) {
    return this.reportsService.getWorkspaceDashboard(workspaceId, req.user.id);
  }

  @Get('role-dashboard')
  async getRoleScopedDashboard(
    @Param('workspaceId') workspaceId: string,
    @Request() req: any
  ) {
    return this.reportsService.getRoleScopedDashboard(workspaceId, req.user.id);
  }

  @Get('export/:projectId')
  async exportProjectReport(
    @Param('workspaceId') workspaceId: string,
    @Param('projectId') projectId: string,
    @Query('type') type: 'tasks' | 'milestones' | 'financials' | 'workload' = 'tasks',
    @Request() req: any,
    @Res() res: Response
  ) {
    const { filename, csv } = await this.reportsService.exportProjectCsv(
      workspaceId,
      projectId,
      req.user.id,
      type
    );

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(csv);
  }
}
