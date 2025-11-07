import { authenticate, AuthRequest } from "../middleware/auth";
import { Router, Response } from 'express';
import { authenticateAdmin, AdminRequest } from '../middleware/adminAuth';
import { prisma } from '../../infrastructure/database/client';

const router = Router();

// Merchant self-service endpoints (authenticated as merchant)
router.get('/me', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const merchant = await prisma.merchant.findUnique({
      where: { id: req.merchant!.id },
      select: {
        id: true,
        slug: true,
        defaultCurrency: true,
        timezone: true,
        email: true,
        businessName: true,
        defaultCurrency: true,
        timezone: true,
        maxBuyerOrdersPerHour: true,
        allowUnsolicitedPayments: true,
        emailVerified: true,
        createdAt: true,
      },
    });

    if (!merchant) {
      return res.status(404).json({ error: 'Merchant not found' });
    }

    return res.json({
      success: true,
      data: merchant,
    });
  } catch (error) {
    console.error('Get merchant error:', error);
    return res.status(500).json({ error: 'Failed to fetch merchant info' });
  }
});

router.patch('/me', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { allowUnsolicitedPayments, maxBuyerOrdersPerHour, defaultCurrency, timezone } = req.body;

    const updates: any = {};
    
    if (typeof allowUnsolicitedPayments === 'boolean') {
      updates.allowUnsolicitedPayments = allowUnsolicitedPayments;
    }
    
    if (typeof maxBuyerOrdersPerHour === 'number' && maxBuyerOrdersPerHour >= 1 && maxBuyerOrdersPerHour <= 100) {
      updates.maxBuyerOrdersPerHour = maxBuyerOrdersPerHour;
    }
    
    if (defaultCurrency && ['USD', 'EUR', 'GBP'].includes(defaultCurrency)) {
      updates.defaultCurrency = defaultCurrency;
    }
    
    if (timezone && typeof timezone === 'string') {
      updates.timezone = timezone;
    }

    const merchant = await prisma.merchant.update({
      where: { id: req.merchant!.id },
      data: updates,
      select: {
        id: true,
        slug: true,
        defaultCurrency: true,
        timezone: true,
        email: true,
        businessName: true,
        maxBuyerOrdersPerHour: true,
        allowUnsolicitedPayments: true,
      },
    });

    return res.json({
      success: true,
      data: merchant,
    });
  } catch (error) {
    console.error('Update merchant error:', error);
    return res.status(500).json({ error: 'Failed to update settings' });
  }
});


/**
 * GET /merchants
 * List all merchants (admin only)
 */
router.get('/', authenticateAdmin, async (req: AdminRequest, res: Response) => {
  try {
    const merchants = await prisma.merchant.findMany({
      select: {
        id: true,
        slug: true,
        defaultCurrency: true,
        timezone: true,
        email: true,
        businessName: true,
        defaultCurrency: true,
        emailVerified: true,
        suspendedAt: true,
        suspendedReason: true,
        createdAt: true,
        lastLoginAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return res.status(200).json({
      success: true,
      data: merchants,
      total: merchants.length,
    });
  } catch (error) {
    console.error('List merchants error:', error);
    return res.status(500).json({ error: 'Failed to fetch merchants' });
  }
});

/**
 * GET /merchants/:merchantId
 * Get merchant details (admin only)
 */
router.get('/:merchantId', authenticateAdmin, async (req: AdminRequest, res: Response) => {
  try {
    const { merchantId } = req.params;

    const merchant = await prisma.merchant.findUnique({
      where: { id: merchantId },
      include: {
        _count: {
          select: {
            paymentRequests: true,
            paymentIntents: true,
            webhooks: true,
          },
        },
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
    return res.status(500).json({ error: 'Failed to fetch merchant' });
  }
});

/**
 * POST /merchants/:merchantId/suspend
 * Suspend a merchant (admin only)
 */
router.post('/:merchantId/suspend', authenticateAdmin, async (req: AdminRequest, res: Response) => {
  try {
    const { merchantId } = req.params;
    const { reason } = req.body;

    if (!reason) {
      return res.status(400).json({ error: 'Suspension reason is required' });
    }

    const merchant = await prisma.merchant.findUnique({
      where: { id: merchantId },
    });

    if (!merchant) {
      return res.status(404).json({ error: 'Merchant not found' });
    }

    if (merchant.suspendedAt) {
      return res.status(400).json({ error: 'Merchant already suspended' });
    }

    await prisma.merchant.update({
      where: { id: merchantId },
      data: {
        suspendedAt: new Date(),
        suspendedBy: req.admin!.id,
        suspendedReason: reason,
      },
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        merchantId,
        action: 'MERCHANT_SUSPENDED',
        resourceId: merchantId,
        payload: { 
          suspendedBy: req.admin!.email,
          reason 
        },
      },
    });

    return res.status(200).json({
      success: true,
      message: 'Merchant suspended successfully',
    });
  } catch (error) {
    console.error('Suspend merchant error:', error);
    return res.status(500).json({ error: 'Failed to suspend merchant' });
  }
});

/**
 * POST /merchants/:merchantId/unsuspend
 * Unsuspend a merchant (admin only)
 */
router.post('/:merchantId/unsuspend', authenticateAdmin, async (req: AdminRequest, res: Response) => {
  try {
    const { merchantId } = req.params;

    const merchant = await prisma.merchant.findUnique({
      where: { id: merchantId },
    });

    if (!merchant) {
      return res.status(404).json({ error: 'Merchant not found' });
    }

    if (!merchant.suspendedAt) {
      return res.status(400).json({ error: 'Merchant is not suspended' });
    }

    await prisma.merchant.update({
      where: { id: merchantId },
      data: {
        suspendedAt: null,
        suspendedBy: null,
        suspendedReason: null,
      },
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        merchantId,
        action: 'MERCHANT_UNSUSPENDED',
        resourceId: merchantId,
        payload: { 
          unsuspendedBy: req.admin!.email 
        },
      },
    });

    return res.status(200).json({
      success: true,
      message: 'Merchant unsuspended successfully',
    });
  } catch (error) {
    console.error('Unsuspend merchant error:', error);
    return res.status(500).json({ error: 'Failed to unsuspend merchant' });
  }
});

/**
 * DELETE /merchants/:merchantId
 * Delete a merchant (admin only) - DANGEROUS
 */
router.delete('/:merchantId', authenticateAdmin, async (req: AdminRequest, res: Response) => {
  try {
    const { merchantId } = req.params;
    const { confirmation } = req.body;

    if (confirmation !== 'DELETE_MERCHANT') {
      return res.status(400).json({ 
        error: 'Confirmation required. Send { "confirmation": "DELETE_MERCHANT" }' 
      });
    }

    const merchant = await prisma.merchant.findUnique({
      where: { id: merchantId },
    });

    if (!merchant) {
      return res.status(404).json({ error: 'Merchant not found' });
    }

    // Audit log before deletion
    await prisma.auditLog.create({
      data: {
        merchantId,
        action: 'MERCHANT_DELETED',
        resourceId: merchantId,
        payload: { 
          deletedBy: req.admin!.email,
          merchantData: {
            email: merchant.email,
            businessName: merchant.businessName,
            slug: merchant.slug,
          }
        },
      },
    });

    // Delete merchant (cascades to related records based on schema)
    await prisma.merchant.delete({
      where: { id: merchantId },
    });

    return res.status(200).json({
      success: true,
      message: 'Merchant deleted successfully',
    });
  } catch (error) {
    console.error('Delete merchant error:', error);
    return res.status(500).json({ error: 'Failed to delete merchant' });
  }
});

export default router;
