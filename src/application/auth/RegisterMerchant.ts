import { prisma } from '../../infrastructure/database/client';
import { generateSlug, generatePin, getPinExpiryTime, isValidEmail, sendPinToEmail } from '../../domain/utils/auth';

interface RegisterMerchantInput {
  email: string;
  businessName: string;
  defaultCurrency?: string;
}

interface RegisterMerchantOutput {
  success: boolean;
  merchantId?: string;
  slug?: string;
  message: string;
}

export async function registerMerchant(input: RegisterMerchantInput): Promise<RegisterMerchantOutput> {
  const { email, businessName, defaultCurrency = 'USD' } = input;

  // Validate email
  if (!isValidEmail(email)) {
    return { success: false, message: 'Invalid email format' };
  }

  // Validate business name
  if (!businessName || businessName.trim().length < 2) {
    return { success: false, message: 'Business name must be at least 2 characters' };
  }

  // Check if email already exists
  const existingMerchant = await prisma.merchant.findUnique({
    where: { email: email.toLowerCase() },
  });

  if (existingMerchant) {
    return { success: false, message: 'Email already registered' };
  }

  // Generate unique slug
  let slug = generateSlug();
  let slugExists = await prisma.merchant.findUnique({ where: { slug } });
  
  // Retry up to 10 times if slug collision
  let attempts = 0;
  while (slugExists && attempts < 10) {
    slug = generateSlug();
    slugExists = await prisma.merchant.findUnique({ where: { slug } });
    attempts++;
  }

  if (slugExists) {
    return { success: false, message: 'Failed to generate unique slug, please try again' };
  }

  // Generate PIN
  const pin = generatePin();
  const pinExpiresAt = getPinExpiryTime();

  // Create merchant
  const merchant = await prisma.merchant.create({
    data: {
      email: email.toLowerCase(),
      businessName: businessName.trim(),
      defaultCurrency,
      slug,
      currentPin: pin,
      pinExpiresAt,
      emailVerified: false,
    },
  });

  // Send PIN via email (console for now)
  sendPinToEmail(email, pin, 'signup');

  // Audit log
  await prisma.auditLog.create({
    data: {
      merchantId: merchant.id,
      action: 'MERCHANT_REGISTERED',
      resourceId: merchant.id,
      payload: { email, businessName, slug },
    },
  });

  return {
    success: true,
    merchantId: merchant.id,
    slug: merchant.slug,
    message: 'Registration successful. Please check your email for the verification PIN.',
  };
}
