/**
 * Email Service Interface
 * Abstracts email sending functionality
 */
export interface IEmailService {
  /**
   * Send PIN via email
   */
  sendPin(to: string, pin: string, purpose: 'signup' | 'login'): Promise<void>;

  /**
   * Send payment notification
   */
  sendPaymentNotification(to: string, paymentDetails: {
    amount: number;
    currency: string;
    paymentUrl: string;
  }): Promise<void>;

  /**
   * Send webhook failure notification
   */
  sendWebhookFailureNotification(to: string, details: {
    url: string;
    attempts: number;
    lastError: string;
  }): Promise<void>;
}
