import { IWebhookService } from './IWebhookService';
import { Queue, Worker, Job } from 'bullmq';
import { redis } from '../cache/redis';
import { logger } from '../../common/logger';
import axios from 'axios';
import { IEmailService } from './IEmailService';

interface WebhookPayload {
  merchantId: string;
  webhookUrl: string;
  event: string;
  data: any;
  signature: string;
  merchantEmail?: string;
}

/**
 * BullMQ implementation of Webhook Service
 * Uses Redis-backed queue with automatic retries
 */
export class BullWebhookService implements IWebhookService {
  private queue: Queue<WebhookPayload>;
  private worker: Worker<WebhookPayload>;

  constructor(private emailService: IEmailService) {
    // Create queue
    this.queue = new Queue<WebhookPayload>('webhooks', {
      connection: redis,
      defaultJobOptions: {
        attempts: 5,
        backoff: {
          type: 'exponential',
          delay: 2000, // Start with 2 seconds
        },
        removeOnComplete: {
          count: 1000, // Keep last 1000 completed jobs
          age: 86400, // Remove after 24 hours
        },
        removeOnFail: {
          count: 5000, // Keep last 5000 failed jobs for debugging
        },
      },
    });

    // Create worker to process webhooks
    this.worker = new Worker<WebhookPayload>(
      'webhooks',
      async (job: Job<WebhookPayload>) => {
        return this.deliverWebhook(job);
      },
      {
        connection: redis,
        concurrency: 10, // Process 10 webhooks concurrently
      },
    );

    this.worker.on('completed', (job) => {
      logger.info('Webhook delivered successfully', {
        jobId: job.id,
        merchantId: job.data.merchantId,
        event: job.data.event,
        attempts: job.attemptsMade,
      });
    });

    this.worker.on('failed', async (job, error) => {
      logger.error('Webhook delivery failed', {
        jobId: job?.id,
        merchantId: job?.data.merchantId,
        event: job?.data.event,
        attempts: job?.attemptsMade,
        error: error.message,
      });

      // Send email notification after final failure
      if (job && job.attemptsMade >= 5 && job.data.merchantEmail) {
        try {
          await this.emailService.sendWebhookFailureNotification(
            job.data.merchantEmail,
            {
              url: job.data.webhookUrl,
              attempts: job.attemptsMade,
              lastError: error.message,
            },
          );
        } catch (emailError) {
          logger.error('Failed to send webhook failure notification', { error: emailError });
        }
      }
    });

    logger.info('Webhook service initialized with BullMQ');
  }

  async queueWebhook(payload: {
    merchantId: string;
    webhookUrl: string;
    event: string;
    data: any;
    signature: string;
    merchantEmail?: string;
  }): Promise<void> {
    await this.queue.add('deliver', payload, {
      jobId: `webhook-${payload.merchantId}-${Date.now()}`,
    });

    logger.info('Webhook queued for delivery', {
      merchantId: payload.merchantId,
      event: payload.event,
      url: payload.webhookUrl,
    });
  }

  async getDeliveryStatus(webhookId: string): Promise<{
    status: 'pending' | 'delivered' | 'failed';
    attempts: number;
    lastAttemptAt?: Date;
    lastError?: string;
  } | null> {
    const job = await this.queue.getJob(webhookId);

    if (!job) {
      return null;
    }

    const state = await job.getState();
    let status: 'pending' | 'delivered' | 'failed';

    if (state === 'completed') {
      status = 'delivered';
    } else if (state === 'failed') {
      status = 'failed';
    } else {
      status = 'pending';
    }

    return {
      status,
      attempts: job.attemptsMade,
      lastAttemptAt: job.processedOn ? new Date(job.processedOn) : undefined,
      lastError: job.failedReason,
    };
  }

  /**
   * Deliver webhook to merchant endpoint
   */
  private async deliverWebhook(job: Job<WebhookPayload>): Promise<void> {
    const { webhookUrl, event, data, signature } = job.data;

    try {
      const response = await axios.post(
        webhookUrl,
        {
          event,
          data,
          timestamp: new Date().toISOString(),
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'X-SUZAA-Signature': signature,
            'X-SUZAA-Event': event,
            'User-Agent': 'SUZAA-Webhook/1.0',
          },
          timeout: 10000, // 10 second timeout
          validateStatus: (status) => status >= 200 && status < 300,
        },
      );

      logger.info('Webhook delivery successful', {
        jobId: job.id,
        statusCode: response.status,
        url: webhookUrl,
      });
    } catch (error: any) {
      logger.warn('Webhook delivery attempt failed', {
        jobId: job.id,
        attempt: job.attemptsMade + 1,
        error: error.message,
        url: webhookUrl,
      });

      throw error; // Let BullMQ handle retries
    }
  }

  /**
   * Gracefully shutdown the webhook service
   */
  async shutdown(): Promise<void> {
    logger.info('Shutting down webhook service');
    await this.worker.close();
    await this.queue.close();
  }
}
