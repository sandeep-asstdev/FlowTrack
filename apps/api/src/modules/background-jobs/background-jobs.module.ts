import { Module, Global } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { BackgroundJobsService } from './background-jobs.service';

@Global()
@Module({
  providers: [BackgroundJobsService, PrismaService],
  exports: [BackgroundJobsService],
})
export class BackgroundJobsModule {}
