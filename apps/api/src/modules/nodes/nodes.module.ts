import { Module } from '@nestjs/common';
import { NodesService } from './nodes.service';
import { TaskLifecycleService } from './task-lifecycle.service';
import { NodesController } from './nodes.controller';
import { AuthModule } from '../auth/auth.module';
import { AuditModule } from '../audit/audit.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [AuthModule, AuditModule, NotificationsModule],
  controllers: [NodesController],
  providers: [NodesService, TaskLifecycleService],
  exports: [NodesService, TaskLifecycleService],
})
export class NodesModule {}
