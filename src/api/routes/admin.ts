import { Router, Request, Response } from 'express';
import { registerSuperAdmin } from '../../application/admin/RegisterSuperAdmin';
import { loginSuperAdmin } from '../../application/admin/LoginSuperAdmin';
import { verifySuperAdminPin } from '../../application/admin/VerifySuperAdminPin';
import { prisma } from '../../infrastructure/database/client';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();

/**
 * POST /admin/register
 * Register super admin (one-time only)
 */
router.post('/register', async (req: Request, res: Response) => {
  try {
    const { email, name } = req.body;

    if (!email || !name) {
      return res.status(400).json({ 
        error: 'Email and name are required' 
      });
    }

    const result = await registerSuperAdmin({ email, name });

    if (!result.success) {
      return res.status(400).json({ error: result.message });
    }

    return res.status(201).json({
      success: true,
      message: result.message,
      data: {
        adminId: result.adminId,
      },
    });
  } catch (error) {
    console.error('Super admin register error:', error);
    return res.status(500).json({ error: 'Registration failed' });
  }
});

/**
 * POST /admin/login
 * Request PIN for super admin login
 */
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const result = await loginSuperAdmin({ email });

    return res.status(200).json({
      success: true,
      message: result.message,
    });
  } catch (error) {
    console.error('Super admin login error:', error);
    return res.status(500).json({ error: 'Login failed' });
  }
});

/**
 * POST /admin/verify
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

    const result = await verifySuperAdminPin({ email, pin });

    if (!result.success) {
      return res.status(401).json({ error: result.message });
    }

    return res.status(200).json({
      success: true,
      message: result.message,
      data: {
        token: result.token,
        admin: result.admin,
      },
    });
  } catch (error) {
    console.error('Super admin verify error:', error);
    return res.status(500).json({ error: 'Verification failed' });
  }
});

export default router;

// Get admin stats
router.get('/stats', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const [merchants, payments] = await Promise.all([
      prisma.merchant.findMany({
        select: { id: true, status: true }
      }),
      prisma.paymentRequest.findMany({
        select: { amountFiat: true }
      })
    ]);

    const stats = {
      totalMerchants: merchants.length,
      activeMerchants: merchants.filter(m => m.status === 'active').length,
      suspendedMerchants: merchants.filter(m => m.status === 'suspended').length,
      totalPayments: payments.length,
      totalVolume: payments.reduce((sum, p) => sum + parseFloat(p.amountFiat.toString()), 0)
    };

    return res.json({ success: true, data: stats });
  } catch (error) {
    console.error('Get admin stats error:', error);
    return res.status(500).json({ error: 'Failed to fetch stats' });
  }
});
