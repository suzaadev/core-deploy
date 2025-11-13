import { Router, Request, Response } from 'express';
import { prisma } from '../../infrastructure/database/client';
import { authenticateAdmin, AdminRequest } from '../middleware/adminAuth';
import { validateAdminSupabaseToken } from '../../infrastructure/supabase/adminClient';

const router = Router();

/**
 * POST /admin/bootstrap
 */
router.post('/bootstrap', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No authentication token' });
    }

    const token = authHeader.substring(7);
    const supabaseUser = await validateAdminSupabaseToken(token);

    if (!supabaseUser) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    const existingAdminCount = await prisma.superAdmin.count();
    if (existingAdminCount > 0) {
      return res.status(403).json({ 
        error: 'Admin account already exists. Contact system administrator.' 
      });
    }

    const { name } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Name is required' });
    }

    const existing = await prisma.superAdmin.findUnique({
      where: { authUserId: supabaseUser.id }
    });

    if (existing) {
      return res.status(400).json({ error: 'Admin profile already exists' });
    }

    const admin = await prisma.superAdmin.create({
      data: {
        authUserId: supabaseUser.id,
        email: supabaseUser.email!,
        name,
      }
    });

    return res.status(201).json({
      success: true,
      data: { admin }
    });
  } catch (error) {
    console.error('Admin bootstrap error:', error);
    return res.status(500).json({ error: 'Failed to create admin profile' });
  }
});

/**
 * GET /admin/me
 */
router.get('/me', authenticateAdmin, async (req: AdminRequest, res: Response) => {
  try {
    if (!req.admin) {
      return res.status(404).json({ error: 'Admin not found' });
    }
    return res.json({ success: true, data: req.admin });
  } catch (error) {
    console.error('Get admin profile error:', error);
    return res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

/**
 * GET /admin/merchants
 */
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

/**
 * PATCH /admin/merchants/:id
 * Update merchant details (tier, limits)
 */
router.patch('/merchants/:id', authenticateAdmin, async (req: AdminRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { tier, paymentLinkMonthlyLimit, walletLimit } = req.body;
    
    const updateData: any = {};
    if (tier) updateData.tier = tier;
    if (paymentLinkMonthlyLimit !== undefined) updateData.paymentLinkMonthlyLimit = parseInt(paymentLinkMonthlyLimit);
    if (walletLimit !== undefined) updateData.walletLimit = parseInt(walletLimit);

    const merchant = await prisma.merchant.update({
      where: { id },
      data: updateData,
    });
    
    return res.json({ success: true, data: merchant });
  } catch (error) {
    console.error('Update merchant error:', error);
    return res.status(500).json({ error: 'Failed to update merchant' });
  }
});

/**
 * POST /admin/merchants/:id/suspend
 */
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

/**
 * POST /admin/merchants/:id/unsuspend
 */
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

/**
 * DELETE /admin/merchants/:id
 * Delete a merchant
 */
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

/**
 * GET /admin/stats
 * Get dashboard statistics
 */
router.get("/stats", authenticateAdmin, async (req: AdminRequest, res: Response) => {
  try {
    const totalMerchants = await prisma.merchant.count();
    const activeMerchants = await prisma.merchant.count({ where: { suspendedAt: null } });
    const suspendedMerchants = await prisma.merchant.count({ where: { suspendedAt: { not: null } } });
    const totalPayments = await prisma.paymentRequest.count();

    return res.json({
      success: true,
      data: {
        totalMerchants,
        activeMerchants,
        suspendedMerchants,
        totalPayments
      }
    });
  } catch (error) {
    console.error("Get stats error:", error);
    return res.status(500).json({ error: "Failed to fetch stats" });
  }
});

export default router;
