import { IPaymentRequestRepository } from '../../../domain/repositories/IPaymentRequestRepository';
import { IMerchantRepository } from '../../../domain/repositories/IMerchantRepository';
import { IEmailService } from '../../../infrastructure/services/IEmailService';
import { PaymentRequest, PaymentRequestProps, PaymentStatus, SettlementStatus } from '../../../domain/entities/PaymentRequest';
import { Money } from '../../../domain/value-objects/Money';
import { NotFoundError, ForbiddenError, ValidationError } from '../../../common/errors/AppError';
import { config } from '../../../config';
import crypto from 'crypto';

export interface CreatePaymentRequestInput {
  merchantId: string;
  amount: number;
  currency?: string;
  description?: string;
  expiryMinutes?: number;
}

export interface CreatePaymentRequestOutput {
  paymentRequestId: string;
  linkId: string;
  paymentUrl: string;
  amount: number;
  currency: string;
  expiresAt: Date;
}

/**
 * Create Payment Request Use Case
 */
export class CreatePaymentRequestUseCase {
  constructor(
    private paymentRequestRepository: IPaymentRequestRepository,
    private merchantRepository: IMerchantRepository,
    private emailService: IEmailService,
  ) {}

  async execute(input: CreatePaymentRequestInput): Promise<CreatePaymentRequestOutput> {
    // Find merchant
    const merchant = await this.merchantRepository.findById(input.merchantId);
    if (!merchant) {
      throw new NotFoundError('Merchant not found');
    }

    // Check if merchant can accept payments
    if (!merchant.canAcceptPayments()) {
      throw new ForbiddenError('Merchant cannot accept payments. Account may be suspended or email not verified.');
    }

    // Validate amount
    if (!input.amount || input.amount <= 0) {
      throw new ValidationError('Amount must be greater than zero');
    }

    // Validate expiry
    const expiryMinutes = input.expiryMinutes || config.payment.defaultExpiryMinutes;
    if (expiryMinutes < config.payment.minExpiryMinutes || expiryMinutes > config.payment.maxExpiryMinutes) {
      throw new ValidationError(
        `Expiry must be between ${config.payment.minExpiryMinutes} and ${config.payment.maxExpiryMinutes} minutes`,
      );
    }

    // Create Money value object
    const currency = input.currency || merchant.getDefaultCurrency();
    const money = Money.create(input.amount, currency);

    // Generate order details
    const { orderDate, orderNumber, linkId } = await this.generateOrderDetails(merchant.getId(), merchant.getSlug(), merchant.getTimezone());

    // Calculate expiry
    const expiresAt = new Date(Date.now() + expiryMinutes * 60 * 1000);

    // Create payment request entity
    const props: PaymentRequestProps = {
      id: crypto.randomUUID(),
      merchantId: merchant.getId(),
      orderDate,
      orderNumber,
      linkId,
      amount: money,
      description: input.description,
      status: PaymentStatus.PENDING,
      settlementStatus: SettlementStatus.PENDING,
      createdBy: 'merchant', // or pass in actual user ID
      expiresAt,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const paymentRequest = PaymentRequest.create(props);

    // Save payment request
    await this.paymentRequestRepository.save(paymentRequest);

    // Generate payment URL
    const paymentUrl = `${config.baseUrl}/${linkId}`;

    // Send email notification (optional)
    try {
      await this.emailService.sendPaymentNotification(merchant.getEmail().getValue(), {
        amount: input.amount,
        currency,
        paymentUrl,
      });
    } catch (error) {
      // Log but don't fail the request
      console.error('Failed to send payment notification email:', error);
    }

    return {
      paymentRequestId: paymentRequest.getId(),
      linkId: paymentRequest.getLinkId(),
      paymentUrl,
      amount: money.toNumber(),
      currency: money.getCurrency(),
      expiresAt: paymentRequest.getExpiresAt(),
    };
  }

  /**
   * Generate order details (date, number, linkId)
   */
  private async generateOrderDetails(merchantId: string, slug: string, timezone: string): Promise<{
    orderDate: string;
    orderNumber: number;
    linkId: string;
  }> {
    // Get current date in merchant's timezone (simplified - using UTC for now)
    const now = new Date();
    const orderDate = now.toISOString().split('T')[0].replace(/-/g, ''); // YYYYMMDD

    // Find last order for this merchant on this date
    const lastPayment = await this.paymentRequestRepository.findLastForMerchantOnDate(merchantId, orderDate);

    const orderNumber = lastPayment ? lastPayment.getOrderNumber() + 1 : 1;

    if (orderNumber > 99999) {
      throw new ValidationError('Daily order limit reached (99999)');
    }

    // Generate linkId: slug/YYYYMMDD/NNNN
    const paddedNumber = orderNumber.toString().padStart(4, '0');
    const linkId = `${slug}/${orderDate}/${paddedNumber}`;

    return {
      orderDate,
      orderNumber,
      linkId,
    };
  }
}
