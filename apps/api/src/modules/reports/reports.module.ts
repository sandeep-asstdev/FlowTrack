import { Global, Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { ReportsService } from './reports.service';
import { StatsService } from './stats.service';
import { ReportsController } from './reports.controller';
import { AuthModule } from '../auth/auth.module';

@Global()
@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [ReportsController],
  providers: [ReportsService, StatsService],
  exports: [ReportsService, StatsService],
})
export class ReportsModule {}
