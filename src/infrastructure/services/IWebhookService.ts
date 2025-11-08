/**
 * Webhook Service Interface
 * Handles webhook delivery with retry logic
 */
export interface IWebhookService {
  /**
   * Queue a webhook for delivery
   */
  queueWebhook(payload: {
    merchantId: string;
    webhookUrl: string;
    event: string;
    data: any;
    signature: string;
  }): Promise<void>;

  /**
   * Get webhook delivery status
   */
  getDeliveryStatus(webhookId: string): Promise<{
    status: 'pending' | 'delivered' | 'failed';
    attempts: number;
    lastAttemptAt?: Date;
    lastError?: string;
  } | null>;
}
