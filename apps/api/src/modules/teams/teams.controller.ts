import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  Req,
  Headers,
  BadRequestException,
} from '@nestjs/common';
import { TeamsService } from './teams.service';
import { CreateTeamDto, UpdateTeamDto, AddTeamMemberDto } from '@flowtrack/shared';
import { AuthGuard } from '@nestjs/passport';

@UseGuards(AuthGuard('jwt'))
@Controller('teams')
export class TeamsController {
  constructor(private readonly teamsService: TeamsService) {}

  private getWorkspaceId(req: any, headerWorkspaceId?: string): string {
    const wsId = headerWorkspaceId || req.user.activeWorkspaceId;
    if (!wsId) {
      throw new BadRequestException('Workspace ID is required in X-Workspace-Id header');
    }
    return wsId;
  }

  @Get()
  list(@Req() req: any, @Headers('x-workspace-id') headerWsId?: string) {
    const wsId = this.getWorkspaceId(req, headerWsId);
    return this.teamsService.listTeams(wsId);
  }

  @Get(':id')
  get(@Req() req: any, @Param('id') id: string, @Headers('x-workspace-id') headerWsId?: string) {
    const wsId = this.getWorkspaceId(req, headerWsId);
    return this.teamsService.getTeam(id, wsId);
  }

  @Post()
  create(
    @Req() req: any,
    @Body() dto: CreateTeamDto,
    @Headers('x-workspace-id') headerWsId?: string
  ) {
    const wsId = this.getWorkspaceId(req, headerWsId);
    return this.teamsService.createTeam(wsId, req.user.id, dto);
  }

  @Patch(':id')
  update(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateTeamDto,
    @Headers('x-workspace-id') headerWsId?: string
  ) {
    const wsId = this.getWorkspaceId(req, headerWsId);
    return this.teamsService.updateTeam(id, wsId, req.user.id, dto);
  }

  @Delete(':id')
  delete(
    @Req() req: any,
    @Param('id') id: string,
    @Headers('x-workspace-id') headerWsId?: string
  ) {
    const wsId = this.getWorkspaceId(req, headerWsId);
    return this.teamsService.deleteTeam(id, wsId, req.user.id);
  }

  @Post(':id/members')
  addMember(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: AddTeamMemberDto,
    @Headers('x-workspace-id') headerWsId?: string
  ) {
    const wsId = this.getWorkspaceId(req, headerWsId);
    return this.teamsService.addOrUpdateMember(id, wsId, req.user.id, dto);
  }

  @Delete(':id/members/:userId')
  removeMember(
    @Req() req: any,
    @Param('id') id: string,
    @Param('userId') userId: string,
    @Headers('x-workspace-id') headerWsId?: string
  ) {
    const wsId = this.getWorkspaceId(req, headerWsId);
    return this.teamsService.removeMember(id, wsId, req.user.id, userId);
  }
}
