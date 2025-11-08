import { prisma } from '../../infrastructure/database/client';
import { isPinExpired, normalizeEmail, verifyPin as verifyPinHash } from '../../domain/utils/auth';
import jwt from 'jsonwebtoken';
import { config } from '../../config';
import { BadRequestError, ForbiddenError, UnauthorizedError } from '../../common/errors/AppError';
import { logger } from '../../common/logger';

interface VerifyPinInput {
  email: string;
  pin: string;
}

interface VerifyPinOutput {
  success: boolean;
  token: string;
  merchant: {
    id: string;
    slug: string;
    email: string;
    businessName: string;
  };
  message: string;
}

/**
 * Verify PIN and issue JWT token
 * - Validates PIN against hashed value
 * - Enforces attempt limits
 * - Issues JWT on success
 * - Creates audit log
 *
 * IMPROVEMENTS:
 * - PIN is verified using bcrypt.compare (not plaintext)
 * - Proper error handling
 * - Structured logging with security events
 * - Transaction for atomic updates
 * - Better rate limiting (per email)
 */
export async function verifyPin(
  input: VerifyPinInput
): Promise<VerifyPinOutput> {
  const { email, pin } = input;

  logger.info('PIN verification attempted', { email });

  // Normalize email
  const normalizedEmail = normalizeEmail(email);

  // Validate PIN format
  if (!pin || pin.length !== config.pin.length) {
    throw new BadRequestError('Invalid PIN format');
  }

  // Find merchant
  const merchant = await prisma.merchant.findUnique({
    where: { email: normalizedEmail },
    select: {
      id: true,
      slug: true,
      email: true,
      businessName: true,
      currentPin: true,
      pinExpiresAt: true,
      pinAttempts: true,
      suspendedAt: true,
      suspendedBy: true,
    },
  });

  if (!merchant) {
    logger.warn('PIN verification for non-existent email', { email: normalizedEmail });
    throw new UnauthorizedError('Invalid email or PIN');
  }

  // Check if merchant is suspended
  if (merchant.suspendedAt) {
    logger.warn('PIN verification by suspended merchant', {
      merchantId: merchant.id,
      email: normalizedEmail,
      suspendedAt: merchant.suspendedAt,
    });
    throw new ForbiddenError('Account has been suspended. Please contact support.');
  }

  // Check if PIN exists
  if (!merchant.currentPin || !merchant.pinExpiresAt) {
    logger.warn('PIN verification without active PIN', {
      merchantId: merchant.id,
      email: normalizedEmail,
    });
    throw new BadRequestError('No active PIN. Please request a new one.');
  }

  // Check if PIN expired
  if (isPinExpired(merchant.pinExpiresAt)) {
    logger.warn('Expired PIN used', {
      merchantId: merchant.id,
      email: normalizedEmail,
      expiredAt: merchant.pinExpiresAt,
    });

    await prisma.merchant.update({
      where: { id: merchant.id },
      data: {
        currentPin: null,
        pinExpiresAt: null,
        pinAttempts: 0,
      },
    });

    throw new BadRequestError('PIN has expired. Please request a new one.');
  }

  // Check PIN attempts (max from config)
  if (merchant.pinAttempts >= config.pin.maxAttempts) {
    logger.warn('Max PIN attempts exceeded', {
      merchantId: merchant.id,
      email: normalizedEmail,
      attempts: merchant.pinAttempts,
    });

    await prisma.merchant.update({
      where: { id: merchant.id },
      data: {
        currentPin: null,
        pinExpiresAt: null,
        pinAttempts: 0,
      },
    });

    throw new UnauthorizedError(
      `Too many failed attempts. Please request a new PIN.`
    );
  }

  // CRITICAL FIX: Verify PIN using bcrypt.compare instead of plaintext comparison
  const isPinValid = await verifyPinHash(pin, merchant.currentPin);

  if (!isPinValid) {
    // Increment failed attempts
    const newAttempts = merchant.pinAttempts + 1;

    await prisma.$transaction(async (tx: any) => {
      await tx.merchant.update({
        where: { id: merchant.id },
        data: { pinAttempts: newAttempts },
      });

      // Log failed attempt
      await tx.auditLog.create({
        data: {
          merchantId: merchant.id,
          action: 'LOGIN_FAILED',
          resourceId: merchant.id,
          payload: {
            reason: 'Invalid PIN',
            attempt: newAttempts,
            remainingAttempts: config.pin.maxAttempts - newAttempts,
          },
        },
      });
    });

    logger.warn('Invalid PIN provided', {
      merchantId: merchant.id,
      email: normalizedEmail,
      attempt: newAttempts,
      remainingAttempts: config.pin.maxAttempts - newAttempts,
    });

    throw new UnauthorizedError(
      `Invalid PIN. ${config.pin.maxAttempts - newAttempts} attempts remaining.`
    );
  }

  // PIN is correct - issue token and clear PIN
  try {
    const result = await prisma.$transaction(async (tx: any) => {
      // Clear PIN and update merchant
      const updatedMerchant = await tx.merchant.update({
        where: { id: merchant.id },
        data: {
          currentPin: null,
          pinExpiresAt: null,
          pinAttempts: 0,
          emailVerified: true,
          lastLoginAt: new Date(),
        },
        select: {
          id: true,
          slug: true,
          email: true,
          businessName: true,
        },
      });

      // Create audit log
      await tx.auditLog.create({
        data: {
          merchantId: merchant.id,
          action: 'LOGIN_SUCCESS',
          resourceId: merchant.id,
          payload: {
            method: 'PIN',
            ipAddress: 'N/A', // Could be added from request context
          },
        },
      });

      return updatedMerchant;
    });

    // Generate JWT token
    const token = jwt.sign(
      {
        merchantId: result.id,
        slug: result.slug,
        email: result.email,
      },
      config.security.jwtSecret,
      { expiresIn: config.security.jwtExpiresIn } as jwt.SignOptions
    );

    logger.info('Merchant login successful', {
      merchantId: result.id,
      email: normalizedEmail,
    });

    return {
      success: true,
      token,
      merchant: {
        id: result.id,
        slug: result.slug,
        email: result.email,
        businessName: result.businessName,
      },
      message: 'Login successful',
    };
  } catch (error) {
    logger.error('Token generation failed', {
      merchantId: merchant.id,
      email: normalizedEmail,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw error;
  }
}
