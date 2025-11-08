import { IMerchantRepository } from '../../../domain/repositories/IMerchantRepository';
import { IEmailService } from '../../../infrastructure/services/IEmailService';
import { Email } from '../../../domain/value-objects/Email';
import { PIN } from '../../../domain/value-objects/PIN';
import { NotFoundError, ForbiddenError } from '../../../common/errors/AppError';
import { config } from '../../../config';

export interface LoginMerchantInput {
  email: string;
}

export interface LoginMerchantOutput {
  message: string;
  emailSent: boolean;
}

/**
 * Login Merchant Use Case
 * Generates and sends login PIN
 */
export class LoginMerchantUseCase {
  constructor(
    private merchantRepository: IMerchantRepository,
    private emailService: IEmailService,
  ) {}

  async execute(input: LoginMerchantInput): Promise<LoginMerchantOutput> {
    const email = Email.create(input.email);

    // Find merchant
    const merchant = await this.merchantRepository.findByEmail(email);
    if (!merchant) {
      throw new NotFoundError('Merchant not found');
    }

    // Check if suspended
    if (merchant.isSuspended()) {
      throw new ForbiddenError('Account has been suspended');
    }

    // Check if PIN locked
    if (merchant.isPinLocked()) {
      throw new ForbiddenError('Account is locked due to too many failed attempts. Please contact support.');
    }

    // Generate new PIN
    const { pin, plaintext: plaintextPin } = await PIN.generate(config.pin.length);
    const pinExpiresAt = new Date(Date.now() + config.pin.expiryMinutes * 60 * 1000);

    // Set PIN on merchant
    merchant.setPin(pin, pinExpiresAt);

    // Save merchant
    await this.merchantRepository.save(merchant);

    // Send PIN via email
    await this.emailService.sendPin(email.getValue(), plaintextPin, 'login');

    return {
      message: `Login PIN sent to ${email.getValue()}`,
      emailSent: true,
    };
  }
}
