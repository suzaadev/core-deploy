import { prisma } from '../../infrastructure/database/client';
import {
  generatePin,
  getPinExpiryTime,
  isValidEmail,
  normalizeEmail,
  sendPinToEmail,
  hashPin,
} from '../../domain/utils/auth';
import { BadRequestError, ForbiddenError } from '../../common/errors/AppError';
import { logger } from '../../common/logger';

interface LoginMerchantInput {
  email: string;
}

interface LoginMerchantOutput {
  success: boolean;
  message: string;
}

/**
 * Request login PIN for merchant
 * - Validates email
 * - Generates and hashes new PIN
 * - Sends PIN via email
 * - Creates audit log
 *
 * IMPROVEMENTS:
 * - PIN is now hashed with bcrypt before storage
 * - Proper error handling
 * - Structured logging
 * - Email normalization
 * - Security: Returns same message regardless of account existence
 */
export async function loginMerchant(
  input: LoginMerchantInput
): Promise<LoginMerchantOutput> {
  const { email } = input;

  logger.info('Login PIN requested', { email });

  // Normalize and validate email
  const normalizedEmail = normalizeEmail(email);

  if (!isValidEmail(normalizedEmail)) {
    throw new BadRequestError('Invalid email format');
  }

  // Find merchant
  const merchant = await prisma.merchant.findUnique({
    where: { email: normalizedEmail },
    select: {
      id: true,
      email: true,
      businessName: true,
      suspendedAt: true,
      suspendedBy: true,
      suspensionReason: true,
    },
  });

  // Security: Don't reveal if email exists or not
  const successMessage = 'If an account exists with this email, a PIN has been sent.';

  if (!merchant) {
    logger.info('Login attempt with non-existent email', { email: normalizedEmail });
    // Return success to avoid email enumeration
    return {
      success: true,
      message: successMessage,
    };
  }

  // Check if merchant is suspended
  if (merchant.suspendedAt) {
    logger.warn('Login attempt by suspended merchant', {
      merchantId: merchant.id,
      email: normalizedEmail,
      suspendedAt: merchant.suspendedAt,
      suspendedBy: merchant.suspendedBy,
    });
    throw new ForbiddenError(
      'Account has been suspended. Please contact support for assistance.'
    );
  }

  try {
    // Generate and hash new PIN
    const pin = generatePin();
    const hashedPin = await hashPin(pin);
    const pinExpiresAt = getPinExpiryTime();

    // Update merchant with new hashed PIN using transaction
    await prisma.$transaction(async (tx: any) => {
      await tx.merchant.update({
        where: { id: merchant.id },
        data: {
          currentPin: hashedPin, // FIXED: Store hashed PIN
          pinExpiresAt,
          pinAttempts: 0, // Reset attempts
        },
      });

      // Create audit log
      await tx.auditLog.create({
        data: {
          merchantId: merchant.id,
          action: 'LOGIN_PIN_REQUESTED',
          resourceId: merchant.id,
          payload: { email: normalizedEmail },
        },
      });
    });

    // Send PIN via email (outside transaction)
    sendPinToEmail(normalizedEmail, pin, 'login');

    logger.info('Login PIN sent successfully', {
      merchantId: merchant.id,
      email: normalizedEmail,
    });

    return {
      success: true,
      message: successMessage,
    };
  } catch (error) {
    logger.error('Login PIN generation failed', {
      merchantId: merchant.id,
      email: normalizedEmail,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw error;
  }
}
