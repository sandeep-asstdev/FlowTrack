import { Module } from '@nestjs/common';
import { TemplatesController } from './templates.controller';
import { TemplatesService } from './templates.service';
import { ProjectsModule } from '../projects/projects.module';
import { NodesModule } from '../nodes/nodes.module';
import { EdgesModule } from '../edges/edges.module';
import { ApprovalsModule } from '../approvals/approvals.module';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    ProjectsModule,
    NodesModule,
    EdgesModule,
    ApprovalsModule,
    AuditModule,
    AuthModule,
  ],
  controllers: [TemplatesController],
  providers: [TemplatesService],
  exports: [TemplatesService],
})
export class TemplatesModule {}
