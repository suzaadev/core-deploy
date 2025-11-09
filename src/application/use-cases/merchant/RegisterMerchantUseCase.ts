import { IMerchantRepository } from '../../../domain/repositories/IMerchantRepository';
import { IEmailService } from '../../../infrastructure/services/IEmailService';
import { Merchant, MerchantProps, MerchantTier } from '../../../domain/entities/Merchant';
import { Email } from '../../../domain/value-objects/Email';
import { PIN } from '../../../domain/value-objects/PIN';
import { ConflictError, ValidationError } from '../../../common/errors/AppError';
import { config } from '../../../config';
import crypto from 'crypto';

export interface RegisterMerchantInput {
  email: string;
  businessName: string;
}

export interface RegisterMerchantOutput {
  merchantId: string;
  slug: string;
  email: string;
  businessName: string;
}

/**
 * Register Merchant Use Case
 * Handles merchant registration with PIN generation and email sending
 */
export class RegisterMerchantUseCase {
  constructor(
    private merchantRepository: IMerchantRepository,
    private emailService: IEmailService,
  ) {}

  async execute(input: RegisterMerchantInput): Promise<RegisterMerchantOutput> {
    // Create value objects
    const email = Email.create(input.email);

    // Validate business name
    if (!input.businessName || input.businessName.trim().length < 2) {
      throw new ValidationError('Business name must be at least 2 characters');
    }

    // Check if merchant already exists
    const existingMerchant = await this.merchantRepository.findByEmail(email);
    if (existingMerchant) {
      throw new ConflictError('Merchant with this email already exists');
    }

    // Generate unique slug
    const slug = await this.generateUniqueSlug();

    // Generate PIN
    const { pin, plaintext: plaintextPin } = await PIN.generate(config.pin.length);
    const pinExpiresAt = new Date(Date.now() + config.pin.expiryMinutes * 60 * 1000);

    // Create merchant entity
    const merchantProps: MerchantProps = {
      id: crypto.randomUUID(),
      slug,
      email,
      businessName: input.businessName.trim(),
      defaultCurrency: 'USD',
      timezone: 'UTC',
      maxBuyerOrdersPerHour: 1,
      settleTolerancePct: 2.0,
      allowUnsolicitedPayments: true,
      paymentLinkMonthlyLimit: 100,
      tier: 'TIER_1' as MerchantTier,
      walletLimit: 10,
      defaultPaymentExpiryMinutes: 60,
      currentPin: pin,
      pinExpiresAt,
      pinAttempts: 0,
      webhookSecret: crypto.randomUUID(),
      emailVerified: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const merchant = Merchant.create(merchantProps);

    // Save merchant
    await this.merchantRepository.save(merchant);

    // Send PIN via email
    await this.emailService.sendPin(email.getValue(), plaintextPin, 'signup');

    return {
      merchantId: merchant.getId(),
      slug: merchant.getSlug(),
      email: merchant.getEmail().getValue(),
      businessName: merchant.getBusinessName(),
    };
  }

  /**
   * Generate unique 6-character alphanumeric slug
   */
  private async generateUniqueSlug(): Promise<string> {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let attempts = 0;
    const maxAttempts = 10;

    while (attempts < maxAttempts) {
      let slug = '';
      for (let i = 0; i < 6; i++) {
        slug += chars[Math.floor(Math.random() * chars.length)];
      }

      const existing = await this.merchantRepository.findBySlug(slug);
      if (!existing) {
        return slug;
      }

      attempts++;
    }

    throw new Error('Failed to generate unique slug after maximum attempts');
  }
}
