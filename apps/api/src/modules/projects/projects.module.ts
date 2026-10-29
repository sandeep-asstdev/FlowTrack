import { Module } from '@nestjs/common';
import { ProjectsService } from './projects.service';
import { ProjectsController } from './projects.controller';
import { CpmService } from './cpm.service';
import { AuthModule } from '../auth/auth.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [AuthModule, AuditModule],
  controllers: [ProjectsController],
  providers: [ProjectsService, CpmService],
  exports: [ProjectsService, CpmService],
})
export class ProjectsModule {}
