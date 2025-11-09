import { Router, Request, Response } from 'express';
import { registerSuperAdmin } from '../../application/admin/RegisterSuperAdmin';
import { loginSuperAdmin } from '../../application/admin/LoginSuperAdmin';
import { verifySuperAdminPin } from '../../application/admin/VerifySuperAdminPin';
import { prisma } from '../../infrastructure/database/client';
import { authenticateAdmin, AdminRequest } from '../middleware/adminAuth';

const router = Router();

// POST /admin/register
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

// POST /admin/login
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

// POST /admin/verify
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

// GET /admin/merchants
router.get('/merchants', authenticateAdmin, async (req: AdminRequest, res: Response) => {
  try {
    const merchants = await prisma.merchant.findMany({
      select: {
        id: true,
        email: true,
        businessName: true,
        slug: true,
        suspendedAt: true,
        emailVerified: true,
        createdAt: true,
        paymentLinkMonthlyLimit: true,
        tier: true,
        walletLimit: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return res.json({ success: true, data: merchants });
  } catch (error) {
    console.error('Get merchants error:', error);
    return res.status(500).json({ error: 'Failed to fetch merchants' });
  }
});

// POST /admin/merchants/:id/suspend
router.post('/merchants/:id/suspend', authenticateAdmin, async (req: AdminRequest, res: Response) => {
  try {
    const { id } = req.params;

    const merchant = await prisma.merchant.update({
      where: { id },
      data: { suspendedAt: new Date() },
    });

    return res.json({ success: true, data: merchant });
  } catch (error) {
    console.error('Suspend merchant error:', error);
    return res.status(500).json({ error: 'Failed to suspend merchant' });
  }
});

// POST /admin/merchants/:id/unsuspend
router.post('/merchants/:id/unsuspend', authenticateAdmin, async (req: AdminRequest, res: Response) => {
  try {
    const { id } = req.params;

    const merchant = await prisma.merchant.update({
      where: { id },
      data: { suspendedAt: null },
    });

    return res.json({ success: true, data: merchant });
  } catch (error) {
    console.error('Unsuspend merchant error:', error);
    return res.status(500).json({ error: 'Failed to unsuspend merchant' });
  }
});

// DELETE /admin/merchants/:id
router.delete('/merchants/:id', authenticateAdmin, async (req: AdminRequest, res: Response) => {
  try {
    const { id } = req.params;

    await prisma.merchant.delete({
      where: { id },
    });

    return res.json({ success: true, message: 'Merchant deleted' });
  } catch (error) {
    console.error('Delete merchant error:', error);
    return res.status(500).json({ error: 'Failed to delete merchant' });
  }
});

// PATCH /admin/merchants/:id - update tier or monthly link limit
router.patch('/merchants/:id', authenticateAdmin, async (req: AdminRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { paymentLinkMonthlyLimit, tier, walletLimit } = req.body;

    const updateData: any = {};

    if (paymentLinkMonthlyLimit !== undefined) {
      if (!Number.isInteger(paymentLinkMonthlyLimit) || paymentLinkMonthlyLimit < 0) {
        return res.status(400).json({ error: 'paymentLinkMonthlyLimit must be a non-negative integer' });
      }
      updateData.paymentLinkMonthlyLimit = paymentLinkMonthlyLimit;
    }

    if (tier !== undefined) {
      const allowedTiers = ['TIER_1', 'TIER_2', 'TIER_3', 'TIER_4', 'TIER_5'];
      if (!allowedTiers.includes(tier)) {
        return res.status(400).json({ error: 'Invalid tier value' });
      }
      updateData.tier = tier;
    }

    if (walletLimit !== undefined) {
      if (!Number.isInteger(walletLimit) || walletLimit < 0) {
        return res.status(400).json({ error: 'walletLimit must be a non-negative integer' });
      }
      updateData.walletLimit = walletLimit;
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ error: 'No valid fields provided for update' });
    }

    const merchant = await prisma.merchant.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        email: true,
        businessName: true,
        slug: true,
        suspendedAt: true,
        emailVerified: true,
        createdAt: true,
        paymentLinkMonthlyLimit: true,
        tier: true,
        walletLimit: true,
      },
    });

    return res.json({ success: true, data: merchant });
  } catch (error) {
    console.error('Update merchant tier/limit error:', error);
    return res.status(500).json({ error: 'Failed to update merchant' });
  }
});

// GET /admin/stats
router.get('/stats', authenticateAdmin, async (req: AdminRequest, res: Response) => {
  try {
    const [merchants, payments] = await Promise.all([
      prisma.merchant.findMany({
        select: { id: true, suspendedAt: true }
      }),
      prisma.paymentRequest.findMany({
        select: { amountFiat: true }
      })
    ]);

    const stats = {
      totalMerchants: merchants.length,
      activeMerchants: merchants.filter((m: any) => m.suspendedAt === null).length,
      suspendedMerchants: merchants.filter((m: any) => m.suspendedAt !== null).length,
      totalPayments: payments.length,
      totalVolume: payments.reduce((sum: number, p: any) => sum + parseFloat(p.amountFiat.toString()), 0)
    };

    return res.json({ success: true, data: stats });
  } catch (error) {
    console.error('Get admin stats error:', error);
    return res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

export default router;
