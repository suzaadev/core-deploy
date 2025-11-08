import { IMerchantRepository } from '../../../domain/repositories/IMerchantRepository';
import { Email } from '../../../domain/value-objects/Email';
import { UnauthorizedError, ForbiddenError } from '../../../common/errors/AppError';
import { config } from '../../../config';
import jwt from 'jsonwebtoken';

export interface VerifyMerchantPinInput {
  email: string;
  pin: string;
}

export interface VerifyMerchantPinOutput {
  token: string;
  merchant: {
    id: string;
    slug: string;
    email: string;
    businessName: string;
  };
}

/**
 * Verify Merchant PIN Use Case
 * Verifies PIN and generates JWT token
 */
export class VerifyMerchantPinUseCase {
  constructor(private merchantRepository: IMerchantRepository) {}

  async execute(input: VerifyMerchantPinInput): Promise<VerifyMerchantPinOutput> {
    const email = Email.create(input.email);

    // Find merchant
    const merchant = await this.merchantRepository.findByEmail(email);
    if (!merchant) {
      throw new UnauthorizedError('Invalid email or PIN');
    }

    // Check if suspended
    if (merchant.isSuspended()) {
      throw new ForbiddenError('Account has been suspended');
    }

    // Check if PIN locked
    if (merchant.isPinLocked()) {
      throw new ForbiddenError('Account is locked. Please contact support.');
    }

    // Check if PIN exists and is not expired
    if (!merchant.isPinValid()) {
      throw new UnauthorizedError('PIN has expired. Please request a new login PIN.');
    }

    // Verify PIN
    const currentPin = merchant.getCurrentPin();
    if (!currentPin) {
      throw new UnauthorizedError('No active PIN found');
    }

    const isValid = await currentPin.verify(input.pin);

    if (!isValid) {
      // Increment failed attempts
      merchant.incrementPinAttempts();
      await this.merchantRepository.save(merchant);

      const remainingAttempts = config.pin.maxAttempts - merchant.getPinAttempts();
      if (remainingAttempts <= 0) {
        throw new ForbiddenError('Account locked due to too many failed attempts');
      }

      throw new UnauthorizedError(`Invalid PIN. ${remainingAttempts} attempts remaining.`);
    }

    // PIN verified successfully
    merchant.resetPinAttempts();
    merchant.verifyEmail(); // Verify email on first successful login
    await this.merchantRepository.save(merchant);

    // Generate JWT token
    const token = jwt.sign(
      {
        merchantId: merchant.getId(),
        slug: merchant.getSlug(),
        email: merchant.getEmail().getValue(),
      },
      config.security.jwtSecret,
      { expiresIn: config.security.jwtExpiresIn } as jwt.SignOptions,
    );

    return {
      token,
      merchant: {
        id: merchant.getId(),
        slug: merchant.getSlug(),
        email: merchant.getEmail().getValue(),
        businessName: merchant.getBusinessName(),
      },
    };
  }
}
