import {
  Controller,
  Get,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
  Req,
  ForbiddenException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AdminService } from './admin.service';

@UseGuards(AuthGuard('jwt'))
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  private assertAdmin(req: any) {
    const userRole = req.user?.role;
    const isPlatformAdminEmail = req.user?.email === 'admin@flowtrack.dev';
    const hasAdminMembership = req.user?.memberships?.some((m: any) => m.role === 'ADMIN');

    if (userRole !== 'ADMIN' && !isPlatformAdminEmail && !hasAdminMembership) {
      throw new ForbiddenException('Access denied: Platform Administrator privilege required.');
    }
  }

  @Get('users')
  async getPlatformUsers(
    @Req() req: any,
    @Query('search') search?: string,
    @Query('role') role?: string,
    @Query('status') status?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string
  ) {
    this.assertAdmin(req);
    return this.adminService.getPlatformUsers({
      search,
      role,
      status,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
  }

  @Get('audits')
  async getPlatformAudits(
    @Req() req: any,
    @Query('action') action?: string,
    @Query('actorId') actorId?: string,
    @Query('outcome') outcome?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string
  ) {
    this.assertAdmin(req);
    return this.adminService.getPlatformAudits({
      action,
      actorId,
      outcome,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
  }

  @Get('stats')
  async getPlatformStats(@Req() req: any) {
    this.assertAdmin(req);
    return this.adminService.getPlatformStats();
  }

  @Patch('users/:id/status')
  async updateUserStatus(
    @Req() req: any,
    @Param('id') targetUserId: string,
    @Body('isActive') isActive: boolean
  ) {
    this.assertAdmin(req);
    return this.adminService.updateUserStatus(targetUserId, Boolean(isActive), req.user.id);
  }
}

