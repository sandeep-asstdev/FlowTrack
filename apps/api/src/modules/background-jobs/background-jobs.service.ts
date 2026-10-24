import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface BackgroundJob {
  id: string;
  name: string;
  data: any;
  createdAt: Date;
  handler: () => Promise<void>;
}

@Injectable()
export class BackgroundJobsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BackgroundJobsService.name);
  private queue: BackgroundJob[] = [];
  private isProcessing = false;
  private intervalTimer: NodeJS.Timeout | null = null;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    this.logger.log('BackgroundJobsService initialized with non-blocking async queue.');
    // Start periodic background scanner for deadline checks and maintenance
    this.intervalTimer = setInterval(() => {
      this.runPeriodicDeadlineCheck().catch((err) => {
        this.logger.error(`Periodic deadline scan error: ${err.message}`, err.stack);
      });
    }, 60 * 1000); // Runs every 60 seconds
  }

  onModuleDestroy() {
    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
      this.intervalTimer = null;
    }
  }

  /**
   * Enqueues an asynchronous task to run in the background without blocking the caller request.
   */
  enqueue(name: string, data: any, handler: () => Promise<void>): string {
    const jobId = `job_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const job: BackgroundJob = {
      id: jobId,
      name,
      data,
      createdAt: new Date(),
      handler,
    };
    this.queue.push(job);
    this.processQueue();
    return jobId;
  }

  private async processQueue() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    while (this.queue.length > 0) {
      const job = this.queue.shift();
      if (!job) break;

      try {
        await job.handler();
      } catch (err: any) {
        this.logger.error(`Job [${job.name}] failed (ID: ${job.id}): ${err.message}`, err.stack);
      }
    }

    this.isProcessing = false;
  }

  /**
   * Periodic scanner for tasks approaching deadline or overdue.
   */
  async runPeriodicDeadlineCheck() {
    try {
      const now = new Date();
      const in48Hours = new Date(now.getTime() + 48 * 60 * 60 * 1000);

      // Find tasks that are not done and have a due date in the past or within 48h
      const urgentNodes = await this.prisma.node.findMany({
        where: {
          deletedAt: null,
          dueDate: { lte: in48Hours },
          ownerId: { not: null },
          status: {
            category: { notIn: ['done', 'cancelled'] },
          },
        },
        select: {
          id: true,
          title: true,
          dueDate: true,
          ownerId: true,
          workspaceId: true,
          projectId: true,
        },
        take: 100,
      });

      const todayBucket = now.toISOString().split('T')[0];

      for (const node of urgentNodes) {
        if (!node.ownerId || !node.dueDate) continue;

        const isOverdue = node.dueDate < now;
        const dedupKey = `deadline:${node.id}:${isOverdue ? 'overdue' : 'approaching'}:${todayBucket}`;

        // Enqueue deduplicated notification
        this.enqueue(`deadline_notification_${node.id}`, { nodeId: node.id }, async () => {
          // Check if already notified for this dedupKey today
          const existing = await this.prisma.notification.findUnique({
            where: {
              userId_dedupKey: {
                userId: node.ownerId!,
                dedupKey,
              },
            },
          });

          if (!existing) {
            await this.prisma.notification.create({
              data: {
                workspaceId: node.workspaceId,
                projectId: node.projectId,
                userId: node.ownerId!,
                type: 'DEADLINE_REMINDER',
                title: isOverdue ? `🚨 Task Overdue: ${node.title}` : `⏳ Deadline Approaching: ${node.title}`,
                body: isOverdue
                  ? `Task "${node.title}" exceeded its deadline on ${node.dueDate.toLocaleDateString()}. Please update progress or submit evidence.`
                  : `Task "${node.title}" is due soon on ${node.dueDate.toLocaleDateString()}.`,
                entityType: 'node',
                entityId: node.id,
                dedupKey,
              },
            });
          }
        });
      }
    } catch (e: any) {
      this.logger.warn(`Could not run periodic deadline check: ${e.message}`);
    }
  }
}
