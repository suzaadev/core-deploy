import { prisma } from '../../infrastructure/database/client';
import { generatePin, getPinExpiryTime, isValidEmail, sendPinToEmail } from '../../domain/utils/auth';

interface LoginMerchantInput {
  email: string;
}

interface LoginMerchantOutput {
  success: boolean;
  message: string;
}

export async function loginMerchant(input: LoginMerchantInput): Promise<LoginMerchantOutput> {
  const { email } = input;

  // Validate email
  if (!isValidEmail(email)) {
    return { success: false, message: 'Invalid email format' };
  }

  // Find merchant
  const merchant = await prisma.merchant.findUnique({
    where: { email: email.toLowerCase() },
  });

  if (!merchant) {
    // Don't reveal if email exists or not (security)
    return { 
      success: true, 
      message: 'If an account exists with this email, a PIN has been sent.' 
    };
  }

  // Check if merchant is suspended
  if (merchant.suspendedAt) {
    return { success: false, message: 'Account suspended. Please contact support.' };
  }

  // Generate new PIN
  const pin = generatePin();
  const pinExpiresAt = getPinExpiryTime();

  // Update merchant with new PIN
  await prisma.merchant.update({
    where: { id: merchant.id },
    data: {
      currentPin: pin,
      pinExpiresAt,
      pinAttempts: 0, // Reset attempts
    },
  });

  // Send PIN via email (console for now)
  sendPinToEmail(email, pin, 'login');

  // Audit log
  await prisma.auditLog.create({
    data: {
      merchantId: merchant.id,
      action: 'LOGIN_PIN_REQUESTED',
      resourceId: merchant.id,
      payload: { email },
    },
  });

  return {
    success: true,
    message: 'If an account exists with this email, a PIN has been sent.',
  };
}
