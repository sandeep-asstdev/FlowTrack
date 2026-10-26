import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Response } from 'express';

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async checkHealth(@Res() res: Response) {
    const startTime = Date.now();
    let dbStatus = 'disconnected';
    let dbLatencyMs = -1;

    try {
      await this.prisma.$queryRaw`SELECT 1`;
      dbStatus = 'connected';
      dbLatencyMs = Date.now() - startTime;
    } catch (err: any) {
      dbStatus = `error: ${err.message}`;
    }

    const memoryUsage = process.memoryUsage();
    const isHealthy = dbStatus === 'connected';

    const payload = {
      status: isHealthy ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.round(process.uptime()),
      version: '1.0.0',
      database: {
        status: dbStatus,
        latencyMs: dbLatencyMs,
      },
      memory: {
        rssMb: Math.round(memoryUsage.rss / (1024 * 1024)),
        heapUsedMb: Math.round(memoryUsage.heapUsed / (1024 * 1024)),
        heapTotalMb: Math.round(memoryUsage.heapTotal / (1024 * 1024)),
      },
      environment: process.env.NODE_ENV || 'development',
    };

    return res.status(isHealthy ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE).json(payload);
  }
}
