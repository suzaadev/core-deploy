import { prisma } from '../../infrastructure/database/client';
import { isPinExpired } from '../../domain/utils/auth';
import jwt from 'jsonwebtoken';
import { config } from '../../config';

interface VerifyPinInput {
  email: string;
  pin: string;
}

interface VerifyPinOutput {
  success: boolean;
  token?: string;
  merchant?: {
    id: string;
    slug: string;
    email: string;
    businessName: string;
  };
  message: string;
}

export async function verifyPin(input: VerifyPinInput): Promise<VerifyPinOutput> {
  const { email, pin } = input;

  // Find merchant
  const merchant = await prisma.merchant.findUnique({
    where: { email: email.toLowerCase() },
  });

  if (!merchant) {
    return { success: false, message: 'Invalid email or PIN' };
  }

  // Check if merchant is suspended
  if (merchant.suspendedAt) {
    return { success: false, message: 'Account suspended. Please contact support.' };
  }

  // Check if PIN exists
  if (!merchant.currentPin || !merchant.pinExpiresAt) {
    return { success: false, message: 'No active PIN. Please request a new one.' };
  }

  // Check if PIN expired
  if (isPinExpired(merchant.pinExpiresAt)) {
    await prisma.merchant.update({
      where: { id: merchant.id },
      data: { currentPin: null, pinExpiresAt: null, pinAttempts: 0 },
    });
    return { success: false, message: 'PIN expired. Please request a new one.' };
  }

  // Check PIN attempts (max 5)
  if (merchant.pinAttempts >= 5) {
    await prisma.merchant.update({
      where: { id: merchant.id },
      data: { currentPin: null, pinExpiresAt: null, pinAttempts: 0 },
    });
    return { success: false, message: 'Too many failed attempts. Please request a new PIN.' };
  }

  // Verify PIN
  if (merchant.currentPin !== pin) {
    await prisma.merchant.update({
      where: { id: merchant.id },
      data: { pinAttempts: merchant.pinAttempts + 1 },
    });
    return { success: false, message: 'Invalid email or PIN' };
  }

  // PIN is correct - clear PIN and mark as verified
  await prisma.merchant.update({
    where: { id: merchant.id },
    data: {
      currentPin: null,
      pinExpiresAt: null,
      pinAttempts: 0,
      emailVerified: true,
      lastLoginAt: new Date(),
    },
  });

  // Generate JWT token
  const token = jwt.sign(
    {
      merchantId: merchant.id,
      slug: merchant.slug,
      email: merchant.email,
    },
    config.security.jwtSecret,
    { expiresIn: '7d' }
  );

  // Audit log
  await prisma.auditLog.create({
    data: {
      merchantId: merchant.id,
      action: 'LOGIN_SUCCESS',
      resourceId: merchant.id,
      payload: { method: 'PIN' },
    },
  });

  return {
    success: true,
    token,
    merchant: {
      id: merchant.id,
      slug: merchant.slug,
      email: merchant.email,
      businessName: merchant.businessName,
    },
    message: 'Login successful',
  };
}
