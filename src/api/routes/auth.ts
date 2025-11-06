import { Router, Request, Response } from 'express';
import { registerMerchant } from '../../application/auth/RegisterMerchant';
import { loginMerchant } from '../../application/auth/LoginMerchant';
import { verifyPin } from '../../application/auth/VerifyPin';
import { authenticate, AuthRequest } from '../middleware/auth';
import { prisma } from '../../infrastructure/database/client';

const router = Router();

/**
 * POST /auth/register
 * Register a new merchant
 */
router.post('/register', async (req: Request, res: Response) => {
  try {
    const { email, businessName, defaultCurrency } = req.body;

    if (!email || !businessName) {
      return res.status(400).json({ 
        error: 'Email and business name are required' 
      });
    }

    const result = await registerMerchant({
      email,
      businessName,
      defaultCurrency,
    });

    if (!result.success) {
      return res.status(400).json({ error: result.message });
    }

    return res.status(201).json({
      success: true,
      message: result.message,
      data: {
        merchantId: result.merchantId,
        slug: result.slug,
      },
    });
  } catch (error) {
    console.error('Register error:', error);
    return res.status(500).json({ error: 'Registration failed' });
  }
});

/**
 * POST /auth/login
 * Request PIN for login
 */
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const result = await loginMerchant({ email });

    return res.status(200).json({
      success: true,
      message: result.message,
    });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ error: 'Login failed' });
  }
});

/**
 * POST /auth/verify
 * Verify PIN and get JWT token
 */
router.post('/verify', async (req: Request, res: Response) => {
  try {
    const { email, pin } = req.body;

    if (!email || !pin) {
      return res.status(400).json({ 
        error: 'Email and PIN are required' 
      });
    }

    const result = await verifyPin({ email, pin });

    if (!result.success) {
      return res.status(401).json({ error: result.message });
    }

    return res.status(200).json({
      success: true,
      message: result.message,
      data: {
        token: result.token,
        merchant: result.merchant,
      },
    });
  } catch (error) {
    console.error('Verify error:', error);
    return res.status(500).json({ error: 'Verification failed' });
  }
});

/**
 * GET /auth/me
 * Get current merchant info (protected)
 */
router.get('/me', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const merchant = await prisma.merchant.findUnique({
      where: { id: req.merchant!.id },
      select: {
        id: true,
        slug: true,
        email: true,
        businessName: true,
        defaultCurrency: true,
        settleTolerancePct: true,
        emailVerified: true,
        createdAt: true,
        lastLoginAt: true,
      },
    });

    if (!merchant) {
      return res.status(404).json({ error: 'Merchant not found' });
    }

    return res.status(200).json({
      success: true,
      data: merchant,
    });
  } catch (error) {
    console.error('Get merchant error:', error);
    return res.status(500).json({ error: 'Failed to fetch merchant info' });
  }
});

export default router;
