import { prisma } from '../../infrastructure/database/client';
import {
  generateSlug,
  generatePin,
  getPinExpiryTime,
  isValidEmail,
  normalizeEmail,
  sendPinToEmail,
  hashPin,
} from '../../domain/utils/auth';
import { ConflictError, BadRequestError, InternalServerError } from '../../common/errors/AppError';
import { logger } from '../../common/logger';

interface RegisterMerchantInput {
  email: string;
  businessName: string;
  defaultCurrency?: string;
}

interface RegisterMerchantOutput {
  success: boolean;
  merchantId: string;
  slug: string;
  message: string;
}

/**
 * Register a new merchant account
 * - Validates input
 * - Generates unique slug
 * - Creates merchant with hashed PIN
 * - Sends PIN via email
 * - Creates audit log
 *
 * IMPROVEMENTS:
 * - PIN is now hashed with bcrypt before storage
 * - Uses transaction for data consistency
 * - Proper error handling with custom error classes
 * - Structured logging
 * - Email normalization
 */
export async function registerMerchant(
  input: RegisterMerchantInput
): Promise<RegisterMerchantOutput> {
  const { email, businessName, defaultCurrency = 'USD' } = input;

  logger.info('Merchant registration started', { email, businessName });

  // Normalize and validate email
  const normalizedEmail = normalizeEmail(email);

  if (!isValidEmail(normalizedEmail)) {
    throw new BadRequestError('Invalid email format');
  }

  // Validate business name
  if (!businessName || businessName.trim().length < 2) {
    throw new BadRequestError('Business name must be at least 2 characters');
  }

  if (businessName.trim().length > 100) {
    throw new BadRequestError('Business name cannot exceed 100 characters');
  }

  // Check if email already exists
  const existingMerchant = await prisma.merchant.findUnique({
    where: { email: normalizedEmail },
  });

  if (existingMerchant) {
    logger.warn('Attempted registration with existing email', { email: normalizedEmail });
    throw new ConflictError('Email already registered');
  }

  // Generate unique slug with retries
  let slug = generateSlug();
  let attempts = 0;
  const maxAttempts = 10;

  while (attempts < maxAttempts) {
    const slugExists = await prisma.merchant.findUnique({
      where: { slug },
    });

    if (!slugExists) break;

    slug = generateSlug();
    attempts++;
  }

  if (attempts === maxAttempts) {
    logger.error('Failed to generate unique slug after max attempts', { attempts });
    throw new InternalServerError('Failed to generate unique identifier. Please try again.');
  }

  // Generate and hash PIN
  const pin = generatePin();
  const hashedPin = await hashPin(pin);
  const pinExpiresAt = getPinExpiryTime();

  try {
    // Use transaction to ensure data consistency
    const merchant = await prisma.$transaction(async (tx: any) => {
      // Create merchant with hashed PIN
      const newMerchant = await tx.merchant.create({
        data: {
          email: normalizedEmail,
          businessName: businessName.trim(),
          defaultCurrency,
          slug,
          currentPin: hashedPin, // FIXED: Store hashed PIN
          pinExpiresAt,
          pinAttempts: 0,
          emailVerified: false,
          allowUnsolicitedPayments: false,
        },
      });

      // Create audit log
      await tx.auditLog.create({
        data: {
          merchantId: newMerchant.id,
          action: 'MERCHANT_REGISTERED',
          resourceId: newMerchant.id,
          payload: {
            email: normalizedEmail,
            businessName: businessName.trim(),
            slug,
          },
        },
      });

      return newMerchant;
    });

    // Send PIN via email (outside transaction)
    sendPinToEmail(normalizedEmail, pin, 'signup');

    logger.info('Merchant registered successfully', {
      merchantId: merchant.id,
      email: normalizedEmail,
      slug: merchant.slug,
    });

    return {
      success: true,
      merchantId: merchant.id,
      slug: merchant.slug,
      message: 'Registration successful. Please check your email for the verification PIN.',
    };
  } catch (error) {
    logger.error('Merchant registration failed', {
      email: normalizedEmail,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw error;
  }
}
