import { Controller, Get, Post, Patch, Param, Body, Query, UseGuards, Request } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { NotificationsService } from './notifications.service';
import { NotificationPreferencesDto } from '@flowtrack/shared';

@Controller('notifications')
@UseGuards(AuthGuard('jwt'))
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  async getNotifications(
    @Request() req: any,
    @Query('read') read?: string,
    @Query('type') type?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string
  ) {
    const isRead = read !== undefined ? read === 'true' : undefined;
    const parsedLimit = limit ? parseInt(limit, 10) : 50;
    const parsedOffset = offset ? parseInt(offset, 10) : 0;

    return this.notificationsService.getUserNotifications(req.user.id, {
      read: isRead,
      type: type as any,
      limit: parsedLimit,
      offset: parsedOffset,
    });
  }

  @Patch(':id/read')
  async markAsRead(@Request() req: any, @Param('id') id: string) {
    return this.notificationsService.markAsRead(req.user.id, id);
  }

  @Post('mark-all-read')
  async markAllAsRead(@Request() req: any) {
    return this.notificationsService.markAllAsRead(req.user.id);
  }

  @Get('preferences')
  async getPreferences(@Request() req: any) {
    return this.notificationsService.getUserPreferences(req.user.id);
  }

  @Patch('preferences')
  async updatePreferences(@Request() req: any, @Body() prefs: NotificationPreferencesDto) {
    return this.notificationsService.updateUserPreferences(req.user.id, prefs);
  }
}
