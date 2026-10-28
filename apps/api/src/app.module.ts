import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { WorkspacesModule } from './modules/workspaces/workspaces.module';
import { ProjectsModule } from './modules/projects/projects.module';
import { NodesModule } from './modules/nodes/nodes.module';
import { EdgesModule } from './modules/edges/edges.module';
import { NodeTypesModule } from './modules/node-types/node-types.module';
import { TemplatesModule } from './modules/templates/templates.module';
import { FieldDefinitionsModule } from './modules/field-definitions/field-definitions.module';
import { AuditModule } from './modules/audit/audit.module';
import { CollaborationModule } from './modules/collaboration/collaboration.module';
import { BackgroundJobsModule } from './modules/background-jobs/background-jobs.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { DocumentsModule } from './modules/documents/documents.module';
import { ReportsModule } from './modules/reports/reports.module';
import { HealthModule } from './modules/health/health.module';
import { TeamsModule } from './modules/teams/teams.module';
import { OrganizationModule } from './modules/organization/organization.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    OrganizationModule,
    WorkspacesModule,
    ProjectsModule,
    TeamsModule,
    NodesModule,
    EdgesModule,
    NodeTypesModule,
    TemplatesModule,
    FieldDefinitionsModule,
    AuditModule,
    CollaborationModule,
    BackgroundJobsModule,
    NotificationsModule,
    DocumentsModule,
    ReportsModule,
    HealthModule,
  ],
})
export class AppModule {}
