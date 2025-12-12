import { authenticate, AuthRequest } from "../middleware/auth";
import { Router, Response } from 'express';
import { authenticateAdmin, AdminRequest } from '../middleware/adminAuth';
import { prisma } from '../../infrastructure/database/client';
import { generateSlug } from '../../domain/utils/auth';
import { ApiKey } from '../../domain/value-objects/ApiKey';

const router = Router();

// Merchant self-service endpoints (authenticated as merchant)
router.get('/me', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.merchant) {
      return res.status(404).json({ error: 'Merchant profile not found' });
    }

    const merchant = await prisma.merchant.findUnique({
      where: { id: req.merchant.id },
      select: {
        id: true,
        slug: true,
        defaultCurrency: true,
        timezone: true,
        email: true,
        businessName: true,
        maxBuyerOrdersPerHour: true,
        allowUnsolicitedPayments: true,
        emailVerified: true,
        createdAt: true,
        defaultPaymentExpiryMinutes: true,
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
  // Declare updates outside try block so it's accessible in error handler
  const updates: any = {};
  
  try {
    if (!req.merchant) {
      return res.status(404).json({ error: 'Merchant profile not found' });
    }

    // Get current merchant data to check slug and originalSlug
    // Note: originalSlug may not exist if migration hasn't run, that's OK
    let currentMerchant: { slug: string; originalSlug?: string | null; phoneNumber: string | null };
    try {
      currentMerchant = await prisma.merchant.findUnique({
        where: { id: req.merchant.id },
        select: {
          slug: true,
          originalSlug: true,
          phoneNumber: true,
        },
      }) as { slug: string; originalSlug?: string | null; phoneNumber: string | null };
    } catch (selectError: any) {
      // If originalSlug field doesn't exist, select without it
      if (selectError.message?.includes('originalSlug') || selectError.message?.includes('Unknown field')) {
        currentMerchant = await prisma.merchant.findUnique({
          where: { id: req.merchant.id },
          select: {
            slug: true,
            phoneNumber: true,
          },
        }) as { slug: string; phoneNumber: string | null };
        (currentMerchant as any).originalSlug = null;
      } else {
        throw selectError;
      }
    }

    if (!currentMerchant) {
      return res.status(404).json({ error: 'Merchant not found' });
    }

    // Handle originalSlug safely (in case migration hasn't run yet)
    const currentOriginalSlug = currentMerchant.originalSlug || null;

    const { allowUnsolicitedPayments, maxBuyerOrdersPerHour, defaultCurrency, timezone, defaultPaymentExpiryMinutes, phoneNumber } = req.body;
    
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

    if (defaultPaymentExpiryMinutes !== undefined) {
      const allowed = [15, 30, 60, 120];
      if (!allowed.includes(defaultPaymentExpiryMinutes)) {
        return res.status(400).json({ error: 'defaultPaymentExpiryMinutes must be one of 15, 30, 60, or 120' });
      }
      updates.defaultPaymentExpiryMinutes = defaultPaymentExpiryMinutes;
    }

    // Handle phone number and slug logic
    if (phoneNumber !== undefined) {
      if (phoneNumber === null || phoneNumber === '') {
        // Phone number is being removed
        updates.phoneNumber = null;
        
        // Revert slug to originalSlug if it exists, otherwise generate a new 6-digit slug
        if (currentOriginalSlug) {
          // Check if originalSlug is still available (in case it was taken by another merchant)
          const slugExists = await prisma.merchant.findUnique({
            where: { slug: currentOriginalSlug },
            select: { id: true },
          });
          
          if (!slugExists || slugExists.id === req.merchant.id) {
            // Original slug is available, revert to it
            updates.slug = currentOriginalSlug;
            // Clear originalSlug since we're using it (will be ignored if field doesn't exist)
            updates.originalSlug = null;
          } else {
            // Original slug was taken, generate a new one
            let newSlug = generateSlug();
            let attempts = 0;
            const maxAttempts = 10;
            
            while (attempts < maxAttempts) {
              const slugExists = await prisma.merchant.findUnique({
                where: { slug: newSlug },
                select: { id: true },
              });
              
              if (!slugExists) break;
              
              newSlug = generateSlug();
              attempts++;
            }
            
            if (attempts === maxAttempts) {
              return res.status(500).json({ error: 'Failed to generate unique slug. Please try again.' });
            }
            
            updates.slug = newSlug;
            // Clear originalSlug since we generated a new one (will be ignored if field doesn't exist)
            updates.originalSlug = null;
          }
        } else {
          // No originalSlug, generate a new 6-digit slug
          let newSlug = generateSlug();
          let attempts = 0;
          const maxAttempts = 10;
          
          while (attempts < maxAttempts) {
            const slugExists = await prisma.merchant.findUnique({
              where: { slug: newSlug },
              select: { id: true },
            });
            
            if (!slugExists) break;
            
            newSlug = generateSlug();
            attempts++;
          }
          
          if (attempts === maxAttempts) {
            return res.status(500).json({ error: 'Failed to generate unique slug. Please try again.' });
          }
          
          updates.slug = newSlug;
        }
      } else {
        // Phone number is being added/updated
        // Validate phone number: only digits, 7-20 characters
        const phoneRegex = /^\d+$/;
        const phoneStr = String(phoneNumber).trim();
        if (!phoneRegex.test(phoneStr)) {
          return res.status(400).json({ error: 'Phone number must contain only numbers' });
        }
        if (phoneStr.length < 7 || phoneStr.length > 20) {
          return res.status(400).json({ error: 'Phone number must be between 7 and 20 digits' });
        }
        
        // Check if this phone number is already used as a slug by another merchant
        const existingMerchantWithSlug = await prisma.merchant.findUnique({
          where: { slug: phoneStr },
          select: { id: true },
        });
        
        if (existingMerchantWithSlug && existingMerchantWithSlug.id !== req.merchant.id) {
          return res.status(409).json({ 
            error: 'This phone number is already in use by another merchant. Please use a different phone number.' 
          });
        }
        
        updates.phoneNumber = phoneStr;
        
        // Simple logic: when phone number is added, slug becomes the phone number
        if (currentMerchant.slug !== phoneStr) {
          // Store current slug as originalSlug only if it's not already set
          // (This will be ignored by Prisma if the field doesn't exist in the schema)
          if (!currentOriginalSlug) {
            updates.originalSlug = currentMerchant.slug;
          }
          // Update slug to phone number
          updates.slug = phoneStr;
        }
        // If current slug is already the phone number, no need to change anything
      }
    }

    const merchant = await prisma.merchant.update({
      where: { id: req.merchant.id },
      data: updates,
      select: {
        id: true,
        slug: true,
        defaultCurrency: true,
        timezone: true,
        email: true,
        businessName: true,
        phoneNumber: true,
        maxBuyerOrdersPerHour: true,
        allowUnsolicitedPayments: true,
        defaultPaymentExpiryMinutes: true,
      },
    });

    return res.json({
      success: true,
      data: merchant,
    });
  } catch (error: any) {
    console.error('Update merchant error:', error);
    console.error('Error details:', JSON.stringify(error, null, 2));
    
    // Handle unique constraint violation (slug already exists)
    if (error.code === 'P2002' && error.meta?.target?.includes('slug')) {
      return res.status(409).json({ 
        error: 'This phone number is already in use by another merchant. Please use a different phone number.' 
      });
    }
    
    // Handle case where originalSlug field doesn't exist (migration not run)
    // Prisma throws different errors for unknown fields, check for common patterns
    const isUnknownFieldError = 
      error.code === 'P2025' || 
      error.message?.includes('originalSlug') || 
      error.message?.includes('Unknown arg') ||
      error.message?.includes('Unknown field') ||
      (error.meta && error.meta.field_name && error.meta.field_name.includes('originalSlug'));
    
    if (isUnknownFieldError && updates.originalSlug !== undefined && req.merchant) {
      // Try again without originalSlug field
      console.warn('originalSlug field not found, retrying without it. Please run database migrations.');
      const retryUpdates = { ...updates };
      delete retryUpdates.originalSlug;
      try {
        const merchant = await prisma.merchant.update({
          where: { id: req.merchant.id },
          data: retryUpdates,
          select: {
            id: true,
            slug: true,
            defaultCurrency: true,
            timezone: true,
            email: true,
            businessName: true,
            phoneNumber: true,
            maxBuyerOrdersPerHour: true,
            allowUnsolicitedPayments: true,
            defaultPaymentExpiryMinutes: true,
          },
        });
        return res.json({
          success: true,
          data: merchant,
        });
      } catch (retryError: any) {
        console.error('Retry update merchant error:', retryError);
        return res.status(500).json({ 
          error: retryError.message || 'Failed to update settings. Please ensure database migrations are up to date.' 
        });
      }
    }
    
    return res.status(500).json({ 
      error: error.message || 'Failed to update settings' 
    });
  }
});

/**
 * DELETE /merchants/me
 * Delete own merchant account (self-service)
 */
router.delete('/me', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.merchant) {
      return res.status(404).json({ error: 'Merchant profile not found' });
    }

    const { confirmation } = req.body;

    if (confirmation !== 'delete') {
      return res.status(400).json({
        error: 'Confirmation required. Send { "confirmation": "delete" }'
      });
    }

    // Delete related records in correct order to handle foreign key constraints
    // PaymentIntents must be deleted before PaymentRequests (Restrict constraint)
    // PaymentRequests must be deleted before Merchant (Restrict constraint)
    // Wallets, Webhooks will cascade delete automatically
    
    // Step 1: Delete PaymentIntents (they block PaymentRequest deletion)
    await prisma.paymentIntent.deleteMany({
      where: { merchantId: req.merchant.id },
    });

    // Step 2: Delete PaymentRequests (they block Merchant deletion)
    await prisma.paymentRequest.deleteMany({
      where: { merchantId: req.merchant.id },
    });

    // Step 3: Delete merchant (cascades to Wallets, Webhooks; sets AuditLogs.merchantId to null)
    await prisma.merchant.delete({
      where: { id: req.merchant.id },
    });

    return res.json({
      success: true,
      message: 'Account deleted successfully',
    });
  } catch (error: any) {
    console.error('Delete merchant account error:', error);
    
    // Provide more specific error messages
    if (error.code === 'P2003') {
      return res.status(400).json({ 
        error: 'Cannot delete account: related records still exist. Please contact support.' 
      });
    }
    
    return res.status(500).json({ 
      error: error.message || 'Failed to delete account' 
    });
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
    // Super admin is authenticated via Supabase, req.authUser is set by middleware
    if (!req.authUser) {
      return res.status(401).json({ error: 'Authentication required' });
    }

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

    // Audit log before deletion - use authUser email (from Supabase) or admin email if available
    const deletedByEmail = req.admin?.email || req.authUser.email || 'unknown';
    
    await prisma.auditLog.create({
      data: {
        merchantId,
        action: 'MERCHANT_DELETED',
        resourceId: merchantId,
        payload: { 
          deletedBy: deletedByEmail,
          merchantData: {
            email: merchant.email,
            businessName: merchant.businessName,
            slug: merchant.slug,
          }
        },
      },
    });

    // Delete related records in correct order to handle foreign key constraints
    // PaymentIntents must be deleted before PaymentRequests (Restrict constraint)
    // PaymentRequests must be deleted before Merchant (Restrict constraint)
    // Wallets, Webhooks will cascade delete automatically
    
    // Step 1: Delete PaymentIntents (they block PaymentRequest deletion)
    await prisma.paymentIntent.deleteMany({
      where: { merchantId },
    });

    // Step 2: Delete PaymentRequests (they block Merchant deletion)
    await prisma.paymentRequest.deleteMany({
      where: { merchantId },
    });

    // Step 3: Delete merchant (cascades to Wallets, Webhooks; sets AuditLogs.merchantId to null)
    await prisma.merchant.delete({
      where: { id: merchantId },
    });

    return res.status(200).json({
      success: true,
      message: 'Merchant deleted successfully',
    });
  } catch (error: any) {
    console.error('Delete merchant error:', error);
    
    // Provide more specific error messages
    if (error.code === 'P2003') {
      return res.status(400).json({ 
        error: 'Cannot delete merchant: related records still exist. Please contact support.' 
      });
    }
    
    return res.status(500).json({ 
      error: error.message || 'Failed to delete merchant' 
    });
  }
});

/**
 * POST /merchants/api-key
 * Generate a new API key (replaces existing if any)
 */
router.post('/api-key', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.merchant) {
      return res.status(404).json({ error: 'Merchant profile not found' });
    }

    // Generate new API key
    const { apiKey, plaintext, fingerprint } = await ApiKey.generate();

    // Store in merchant table (replaces existing key)
    await prisma.merchant.update({
      where: { id: req.merchant.id },
      data: {
        apiKeyHash: apiKey.getHash(),
        apiKeyFingerprint: fingerprint,
        apiKeyCreatedAt: new Date(),
      },
    });

    // Return plaintext key once
    return res.json({
      apiKey: plaintext,
      fingerprint: fingerprint,
    });
  } catch (error) {
    console.error('Generate API key error:', error);
    return res.status(500).json({ error: 'Failed to generate API key' });
  }
});

/**
 * GET /merchants/api-key
 * Get API key status
 */
router.get('/api-key', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.merchant) {
      return res.status(404).json({ error: 'Merchant profile not found' });
    }

    const merchant = await prisma.merchant.findUnique({
      where: { id: req.merchant.id },
      select: {
        apiKeyFingerprint: true,
        apiKeyCreatedAt: true,
      },
    });

    if (!merchant || !merchant.apiKeyFingerprint) {
      return res.json({ hasKey: false });
    }

    return res.json({
      hasKey: true,
      fingerprint: merchant.apiKeyFingerprint,
      createdAt: merchant.apiKeyCreatedAt?.toISOString() || null,
    });
  } catch (error) {
    console.error('Get API key error:', error);
    return res.status(500).json({ error: 'Failed to fetch API key' });
  }
});

export default router;
