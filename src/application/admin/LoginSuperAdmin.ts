import { prisma } from '../../infrastructure/database/client';
import { generatePin, getPinExpiryTime, isValidEmail, sendPinToEmail } from '../../domain/utils/auth';

interface LoginSuperAdminInput {
  email: string;
}

interface LoginSuperAdminOutput {
  success: boolean;
  message: string;
}

export async function loginSuperAdmin(input: LoginSuperAdminInput): Promise<LoginSuperAdminOutput> {
  const { email } = input;

  if (!isValidEmail(email)) {
    return { success: false, message: 'Invalid email format' };
  }

  const admin = await prisma.superAdmin.findUnique({
    where: { email: email.toLowerCase() },
  });

  if (!admin) {
    return { success: true, message: 'If a super admin account exists with this email, a PIN has been sent.' };
  }

  if (admin.suspendedAt) {
    return { success: false, message: 'Account suspended.' };
  }

  const pin = generatePin();
  const pinExpiresAt = getPinExpiryTime();

  await prisma.superAdmin.update({
    where: { id: admin.id },
    data: { currentPin: pin, pinExpiresAt, pinAttempts: 0 },
  });

  sendPinToEmail(email, pin, 'login');

  return { success: true, message: 'If a super admin account exists with this email, a PIN has been sent.' };
}
