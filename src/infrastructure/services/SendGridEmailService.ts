import { IEmailService } from './IEmailService';
import sgMail from '@sendgrid/mail';
import { logger } from '../../common/logger';
import { config } from '../../config';

/**
 * SendGrid implementation of Email Service
 */
export class SendGridEmailService implements IEmailService {
  constructor() {
    if (config.email.sendgridApiKey) {
      sgMail.setApiKey(config.email.sendgridApiKey);
    }
  }

  async sendPin(to: string, pin: string, purpose: 'signup' | 'login'): Promise<void> {
    const subject = purpose === 'signup' ? 'Welcome to SUZAA - Your PIN' : 'SUZAA Login PIN';
    const text = purpose === 'signup'
      ? `Welcome to SUZAA!\n\nYour verification PIN is: ${pin}\n\nThis PIN will expire in ${config.pin.expiryMinutes} minutes.\n\nIf you didn't request this, please ignore this email.`
      : `Your SUZAA login PIN is: ${pin}\n\nThis PIN will expire in ${config.pin.expiryMinutes} minutes.\n\nIf you didn't request this, please contact support immediately.`;

    const html = purpose === 'signup'
      ? `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">Welcome to SUZAA!</h2>
          <p>Your verification PIN is:</p>
          <div style="background-color: #f4f4f4; padding: 20px; text-align: center; font-size: 32px; font-weight: bold; letter-spacing: 5px; margin: 20px 0;">
            ${pin}
          </div>
          <p>This PIN will expire in ${config.pin.expiryMinutes} minutes.</p>
          <p style="color: #666; font-size: 14px;">If you didn't request this, please ignore this email.</p>
        </div>
      `
      : `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">SUZAA Login PIN</h2>
          <p>Your login PIN is:</p>
          <div style="background-color: #f4f4f4; padding: 20px; text-align: center; font-size: 32px; font-weight: bold; letter-spacing: 5px; margin: 20px 0;">
            ${pin}
          </div>
          <p>This PIN will expire in ${config.pin.expiryMinutes} minutes.</p>
          <p style="color: #666; font-size: 14px;">If you didn't request this, please contact support immediately.</p>
        </div>
      `;

    await this.send(to, subject, text, html);
  }

  async sendPaymentNotification(to: string, paymentDetails: {
    amount: number;
    currency: string;
    paymentUrl: string;
  }): Promise<void> {
    const subject = 'New Payment Request Created';
    const text = `A new payment request has been created.\n\nAmount: ${paymentDetails.amount} ${paymentDetails.currency}\nPayment URL: ${paymentDetails.paymentUrl}`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">New Payment Request</h2>
        <p>A new payment request has been created:</p>
        <ul style="list-style: none; padding: 0;">
          <li style="padding: 10px; background-color: #f4f4f4; margin: 5px 0;"><strong>Amount:</strong> ${paymentDetails.amount} ${paymentDetails.currency}</li>
          <li style="padding: 10px; background-color: #f4f4f4; margin: 5px 0;"><strong>Payment URL:</strong> <a href="${paymentDetails.paymentUrl}">${paymentDetails.paymentUrl}</a></li>
        </ul>
      </div>
    `;

    await this.send(to, subject, text, html);
  }

  async sendWebhookFailureNotification(to: string, details: {
    url: string;
    attempts: number;
    lastError: string;
  }): Promise<void> {
    const subject = 'SUZAA: Webhook Delivery Failed';
    const text = `Webhook delivery has failed after ${details.attempts} attempts.\n\nURL: ${details.url}\nLast Error: ${details.lastError}`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #d32f2f;">Webhook Delivery Failed</h2>
        <p>Webhook delivery has failed after <strong>${details.attempts}</strong> attempts:</p>
        <ul style="list-style: none; padding: 0;">
          <li style="padding: 10px; background-color: #ffebee; margin: 5px 0;"><strong>URL:</strong> ${details.url}</li>
          <li style="padding: 10px; background-color: #ffebee; margin: 5px 0;"><strong>Last Error:</strong> ${details.lastError}</li>
        </ul>
        <p>Please check your webhook endpoint configuration.</p>
      </div>
    `;

    await this.send(to, subject, text, html);
  }

  /**
   * Internal send method
   */
  private async send(to: string, subject: string, text: string, html: string): Promise<void> {
    // If SendGrid is not configured, log instead
    if (!config.email.sendgridApiKey) {
      logger.warn('SendGrid not configured, logging email instead', {
        to,
        subject,
        text,
      });
      console.log(`\n📧 EMAIL [${subject}] to ${to}:\n${text}\n`);
      return;
    }

    try {
      await sgMail.send({
        to,
        from: config.email.fromAddress,
        subject,
        text,
        html,
      });

      logger.info('Email sent successfully', { to, subject });
    } catch (error: any) {
      logger.error('Failed to send email', {
        to,
        subject,
        error: error.message,
        stack: error.stack,
      });
      throw error;
    }
  }
}
