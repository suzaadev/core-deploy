import { Router, Response } from 'express';
import crypto from 'crypto';
import { authenticate, AuthRequest } from '../middleware/auth';
import { prisma } from '../../infrastructure/database/client';
import { validate } from '../../common/validation/validator';
import { authSchemas } from '../../common/validation/schemas';
import { generateSlug, normalizeEmail } from '../../domain/utils/auth';
import { logger } from '../../common/logger';

const router = Router();

const merchantSelect = {
  id: true,
  slug: true,
  email: true,
  businessName: true,
  defaultCurrency: true,
  timezone: true,
  maxBuyerOrdersPerHour: true,
  allowUnsolicitedPayments: true,
  defaultPaymentExpiryMinutes: true,
  settleTolerancePct: true,
  emailVerified: true,
  createdAt: true,
  updatedAt: true,
  lastLoginAt: true,
};

async function generateUniqueSlug(): Promise<string> {
  const maxAttempts = 10;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const candidate = generateSlug().toLowerCase();
    const existing = await prisma.merchant.findUnique({
      where: { slug: candidate },
      select: { id: true },
    });

    if (!existing) {
      return candidate;
    }
  }

  throw new Error('Failed to generate unique merchant slug');
}

/**
 * POST /auth/bootstrap
 * Create or update merchant profile for authenticated Supabase user
 */
router.post(
  '/bootstrap',
  authenticate,
  validate(authSchemas.bootstrap, 'body'),
  async (req: AuthRequest, res: Response) => {
    try {
      if (!req.authUser?.id) {
        return res.status(401).json({ error: 'Supabase user session required' });
      }

      if (!req.authUser.email) {
        return res.status(400).json({ error: 'Supabase user email is missing' });
      }

      const { businessName, defaultCurrency, timezone } = req.body as {
        businessName: string;
        defaultCurrency?: string;
        timezone?: string;
      };

      const normalizedEmail = normalizeEmail(req.authUser.email);
      const currency = (defaultCurrency || 'USD').toUpperCase();
      const tz = timezone || 'UTC';

      const existingByAuth = await prisma.merchant.findUnique({
        where: { authUserId: req.authUser.id },
        select: merchantSelect,
      });

      if (existingByAuth) {
        const updated = await prisma.merchant.update({
          where: { id: existingByAuth.id },
          data: {
            businessName,
            defaultCurrency: currency,
            timezone: tz,
            email: normalizedEmail,
            lastLoginAt: new Date(),
            emailVerified: true,
          },
          select: merchantSelect,
        });

        return res.json({
          success: true,
          created: false,
          data: updated,
        });
      }

      const existingByEmail = await prisma.merchant.findUnique({
        where: { email: normalizedEmail },
        select: merchantSelect,
      });

      if (existingByEmail) {
        const updated = await prisma.merchant.update({
          where: { id: existingByEmail.id },
          data: {
            authUserId: req.authUser.id,
            businessName,
            defaultCurrency: currency,
            timezone: tz,
            email: normalizedEmail,
            lastLoginAt: new Date(),
            emailVerified: true,
          },
          select: merchantSelect,
        });

        return res.json({
          success: true,
          created: false,
          data: updated,
        });
      }

      const slug = await generateUniqueSlug();

      const created = await prisma.merchant.create({
        data: {
          id: crypto.randomUUID(),
          authUserId: req.authUser.id,
          slug,
          email: normalizedEmail,
          businessName,
          defaultCurrency: currency,
          timezone: tz,
          webhookSecret: crypto.randomUUID(),
          emailVerified: true,
          lastLoginAt: new Date(),
        },
        select: merchantSelect,
      });

      return res.status(201).json({
        success: true,
        created: true,
        data: created,
      });
    } catch (error) {
      logger.error('Bootstrap merchant profile failed', {
        error,
        authUserId: req.authUser?.id,
      });
      return res.status(500).json({ error: 'Failed to bootstrap merchant profile' });
    }
  },
);

/**
 * GET /auth/me
 * Get current merchant profile (protected)
 */
router.get('/me', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.authUser?.id) {
      return res.status(401).json({ error: 'Supabase user session required' });
    }

    if (!req.merchant) {
      return res.status(404).json({ error: 'Merchant profile not found' });
    }

    const merchant = await prisma.merchant.findUnique({
      where: { id: req.merchant.id },
      select: merchantSelect,
    });

    if (!merchant) {
      return res.status(404).json({ error: 'Merchant profile not found' });
    }

    return res.status(200).json({
      success: true,
      data: merchant,
    });
  } catch (error) {
    logger.error('Fetch merchant profile failed', {
      error,
      authUserId: req.authUser?.id,
    });
    return res.status(500).json({ error: 'Failed to fetch merchant profile' });
  }
});

export default router;
