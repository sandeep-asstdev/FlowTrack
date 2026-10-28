import { Module } from '@nestjs/common';
import { ProjectsService } from './projects.service';
import { ProjectsController } from './projects.controller';
import { CpmService } from './cpm.service';

@Module({
  controllers: [ProjectsController],
  providers: [ProjectsService, CpmService],
  exports: [ProjectsService, CpmService],
})
export class ProjectsModule {}
