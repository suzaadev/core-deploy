import { prisma } from '../../infrastructure/database/client';
import { isPinExpired } from '../../domain/utils/auth';
import jwt from 'jsonwebtoken';
import { config } from '../../config';

interface VerifySuperAdminPinInput {
  email: string;
  pin: string;
}

interface VerifySuperAdminPinOutput {
  success: boolean;
  token?: string;
  admin?: {
    id: string;
    email: string;
    name: string;
  };
  message: string;
}

export async function verifySuperAdminPin(input: VerifySuperAdminPinInput): Promise<VerifySuperAdminPinOutput> {
  const { email, pin } = input;

  const admin = await prisma.superAdmin.findUnique({
    where: { email: email.toLowerCase() },
  });

  if (!admin) {
    return { success: false, message: 'Invalid email or PIN' };
  }

  if (admin.suspendedAt) {
    return { success: false, message: 'Account suspended.' };
  }

  if (!admin.currentPin || !admin.pinExpiresAt) {
    return { success: false, message: 'No active PIN. Please request a new one.' };
  }

  if (isPinExpired(admin.pinExpiresAt)) {
    await prisma.superAdmin.update({
      where: { id: admin.id },
      data: { currentPin: null, pinExpiresAt: null, pinAttempts: 0 },
    });
    return { success: false, message: 'PIN expired. Please request a new one.' };
  }

  if (admin.pinAttempts >= 5) {
    await prisma.superAdmin.update({
      where: { id: admin.id },
      data: { currentPin: null, pinExpiresAt: null, pinAttempts: 0 },
    });
    return { success: false, message: 'Too many failed attempts. Please request a new PIN.' };
  }

  if (admin.currentPin !== pin) {
    await prisma.superAdmin.update({
      where: { id: admin.id },
      data: { pinAttempts: admin.pinAttempts + 1 },
    });
    return { success: false, message: 'Invalid email or PIN' };
  }

  await prisma.superAdmin.update({
    where: { id: admin.id },
    data: { currentPin: null, pinExpiresAt: null, pinAttempts: 0, emailVerified: true, lastLoginAt: new Date() },
  });

  const token = jwt.sign(
    { adminId: admin.id, email: admin.email, role: 'super_admin' },
    config.security.jwtSecret,
    { expiresIn: '7d' }
  );

  return {
    success: true,
    token,
    admin: { id: admin.id, email: admin.email, name: admin.name },
    message: 'Login successful',
  };
}
