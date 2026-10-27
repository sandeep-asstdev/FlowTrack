import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit() {
    try {
      await this.$connect();
      this.logger.log('Connected to PostgreSQL successfully.');
    } catch (err: any) {
      this.logger.warn(`Database initial connection failed: ${err.message}. Retrying in background...`);
      // Retry in background so the NestJS server can still bind to the port immediately
      const retryConnect = async (attempt = 1) => {
        try {
          await this.$connect();
          this.logger.log('Connected to PostgreSQL on background retry.');
        } catch (retryErr: any) {
          if (attempt < 10) {
            setTimeout(() => retryConnect(attempt + 1), 3000);
          } else {
            this.logger.error(`Database retry connection gave up: ${retryErr.message}`);
          }
        }
      };
      setTimeout(() => retryConnect(1), 3000);
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
