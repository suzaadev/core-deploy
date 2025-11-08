import { ISuperAdminRepository } from '../../../domain/repositories/ISuperAdminRepository';
import { IEmailService } from '../../../infrastructure/services/IEmailService';
import { SuperAdmin, SuperAdminProps } from '../../../domain/entities/SuperAdmin';
import { Email } from '../../../domain/value-objects/Email';
import { PIN } from '../../../domain/value-objects/PIN';
import { ConflictError } from '../../../common/errors/AppError';
import { config } from '../../../config';
import crypto from 'crypto';

export interface RegisterSuperAdminInput {
  email: string;
  name: string;
}

export interface RegisterSuperAdminOutput {
  adminId: string;
  email: string;
  name: string;
}

/**
 * Register Super Admin Use Case
 * FIXED: Now properly hashes admin PINs
 */
export class RegisterSuperAdminUseCase {
  constructor(
    private superAdminRepository: ISuperAdminRepository,
    private emailService: IEmailService,
  ) {}

  async execute(input: RegisterSuperAdminInput): Promise<RegisterSuperAdminOutput> {
    const email = Email.create(input.email);

    // Check if any admin already exists
    const adminCount = await this.superAdminRepository.count();
    if (adminCount > 0) {
      throw new ConflictError('Super admin already registered. Contact system administrator.');
    }

    // Generate PIN - CRITICAL FIX: Now using PIN value object which hashes automatically
    const { pin, plaintext: plaintextPin } = await PIN.generate(config.pin.length);
    const pinExpiresAt = new Date(Date.now() + config.pin.expiryMinutes * 60 * 1000);

    // Create admin entity
    const adminProps: SuperAdminProps = {
      id: crypto.randomUUID(),
      email,
      name: input.name.trim(),
      currentPin: pin, // ✅ FIXED: Storing hashed PIN
      pinExpiresAt,
      pinAttempts: 0,
      emailVerified: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const admin = SuperAdmin.create(adminProps);

    // Save admin
    await this.superAdminRepository.save(admin);

    // Send PIN via email
    await this.emailService.sendPin(email.getValue(), plaintextPin, 'signup');

    return {
      adminId: admin.getId(),
      email: admin.getEmail().getValue(),
      name: admin.getName(),
    };
  }
}
