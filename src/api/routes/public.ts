import { Router, Request, Response } from 'express';
import { prisma } from '../../infrastructure/database/client';
import { CoinGeckoPriceService } from '../../infrastructure/pricing/CoinGeckoPriceService';
import { redis } from '../../infrastructure/cache/redis';
import { config } from '../../config';
import { createPaymentRequest } from '../../application/payments/CreatePaymentRequest';
import { normalizeEmail } from '../../domain/utils/auth';

const router = Router();

// Rate limiting helper
async function checkRateLimit(merchantId: string, ip: string, maxAllowed: number): Promise<boolean> {
  const key = `rate:public:${merchantId}:${ip}`;
  const count = await redis.get(key);
  
  if (count && parseInt(count) >= maxAllowed) {
    return false;
  }
  
  return true;
}

async function incrementRateLimit(merchantId: string, ip: string, ttl: number): Promise<void> {
  const key = `rate:public:${merchantId}:${ip}`;
  const current = await redis.get(key);
  
  if (current) {
    await redis.incr(key);
  } else {
    await redis.set(key, '1', 'EX', ttl);
  }
}

// Get merchant's public wallets
router.get('/wallets/:slug', async (req: Request, res: Response) => {
  try {
    const { slug } = req.params;

    const merchant = await prisma.merchant.findUnique({
      where: { slug },
      select: {
        id: true,
        businessName: true,
        slug: true,
      },
    });

    if (!merchant) {
      return res.status(404).json({ error: 'Merchant not found' });
    }

    const wallets = await prisma.wallet.findMany({
      where: {
        merchantId: merchant.id,
        enabled: true,
      },
      select: {
        network: true,
        tokenSymbol: true,
        tokenName: true,
        tokenType: true,
        walletAddress: true,
        contractAddress: true,
        createdAt: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return res.json({
      success: true,
      data: {
        merchant: {
          name: merchant.businessName,
          slug: merchant.slug,
        },
        wallets,
      },
    });
  } catch (error) {
    console.error('Get public wallets error:', error);
    return res.status(500).json({ error: 'Failed to fetch wallets' });
  }
});

// Create payment request (public - no auth, rate limited)
router.post('/create-payment', async (req: Request, res: Response) => {
  try {
    const { merchantSlug, amount, description } = req.body;
    const clientIp = req.ip || req.socket.remoteAddress || 'unknown';

    if (!merchantSlug || !amount) {
      return res.status(400).json({ error: 'Merchant slug and amount are required' });
    }

    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({ error: 'Invalid amount' });
    }

    const merchant = await prisma.merchant.findUnique({
      where: { slug: merchantSlug },
      select: {
        id: true,
        slug: true,
        businessName: true,
        allowUnsolicitedPayments: true,
        maxBuyerOrdersPerHour: true,
        defaultPaymentExpiryMinutes: true,
      },
    });

    if (!merchant) {
      return res.status(404).json({ error: 'Merchant not found' });
    }

    if (!merchant.allowUnsolicitedPayments) {
      return res.status(403).json({ error: 'This merchant does not accept unsolicited payments' });
    }

    const allowed = await checkRateLimit(merchant.id, clientIp, merchant.maxBuyerOrdersPerHour);
    if (!allowed) {
      return res.status(429).json({ 
        error: `Rate limit exceeded. You can create ${merchant.maxBuyerOrdersPerHour} payment(s) per hour.` 
      });
    }

    const result = await createPaymentRequest({
      merchantId: merchant.id,
      amountFiat: parsedAmount,
      description,
      expiryMinutes: merchant.defaultPaymentExpiryMinutes,
      createdBy: 'buyer',
      buyerIp: clientIp,
    });

    if (!result.success) {
      return res.status(400).json({ error: result.message });
    }

    const ttlSeconds = 3600;
    await incrementRateLimit(merchant.id, clientIp, ttlSeconds);

    return res.status(201).json({
      success: true,
      data: {
        linkId: result.linkId,
        paymentUrl: result.paymentUrl,
        expiresAt: result.expiresAt,
        orderNumber: result.linkId?.split('/').pop(),
      },
    });
  } catch (error) {
    console.error('Create public payment error:', error);
    return res.status(500).json({ error: 'Failed to create payment request' });
  }
});

/**
 * PATCH /public/payment/{linkId}/status
 * Update payment settlement status (for customers - Cancel or Claimed Paid)
 * Note: linkId can contain slashes (slug/date/order), so we use wildcard pattern
 * This route must come BEFORE the GET /payment/* route to avoid conflicts
 */
router.patch('/payment/*/status', async (req: Request, res: Response) => {
  try {
    // Extract linkId from the wildcard match (everything between /payment/ and /status)
    const linkId = req.params[0];

    if (!linkId) {
      return res.status(400).json({ error: 'Link ID is required' });
    }

    const { status } = req.body;

    if (!status || !['CANCELED', 'CLAIMED_PAID'].includes(status)) {
      return res.status(400).json({ 
        error: 'Invalid status. Must be CANCELED or CLAIMED_PAID' 
      });
    }

    const paymentRequest = await prisma.paymentRequest.findUnique({
      where: { linkId },
      select: {
        id: true,
        status: true,
        settlementStatus: true,
        expiresAt: true,
      },
    });

    if (!paymentRequest) {
      return res.status(404).json({ error: 'Payment request not found' });
    }

    // Don't allow updates if already expired
    const isExpired = new Date() > paymentRequest.expiresAt;
    if (isExpired) {
      return res.status(400).json({ 
        error: 'Cannot update status for expired payment requests' 
      });
    }

    // Update settlement status
    const updated = await prisma.paymentRequest.update({
      where: { id: paymentRequest.id },
      data: { settlementStatus: status },
      select: {
        id: true,
        linkId: true,
        settlementStatus: true,
        status: true,
      },
    });

    return res.json({
      success: true,
      data: updated,
      message: status === 'CANCELED' 
        ? 'Payment request canceled' 
        : 'Payment marked as claimed paid',
    });
  } catch (error) {
    console.error('Update payment status error:', error);
    return res.status(500).json({ error: 'Failed to update payment status' });
  }
});

// Get payment request details with network+token combinations
router.get('/payment/*', async (req: Request, res: Response) => {
  try {
    const linkId = req.params[0];

    if (!linkId) {
      return res.status(400).json({ error: 'Link ID is required' });
    }

    const paymentRequest = await prisma.paymentRequest.findUnique({
      where: { linkId },
      select: {
        id: true,
        linkId: true,
        orderNumber: true,
        amountFiat: true,
        currencyFiat: true,
        description: true,
        status: true,
        settlementStatus: true,
        expiresAt: true,
        redirectUrl: true,
        merchantId: true,
        merchant: {
          select: {
            businessName: true,
            slug: true,
          },
        },
      },
    });

    if (!paymentRequest) {
      return res.status(404).json({ error: 'Payment request not found' });
    }

    const isExpired = new Date() > paymentRequest.expiresAt;

    const wallets = await prisma.wallet.findMany({
      where: {
        merchantId: paymentRequest.merchantId,
        enabled: true,
      },
      select: {
        id: true,
        network: true,
        tokenSymbol: true,
        tokenName: true,
        tokenType: true,
        tokenDecimals: true,
        contractAddress: true,
        walletAddress: true,
        createdAt: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    const walletsByNetworkToken: Record<string, any> = {};
    const availableOptions: Array<{network: string, token: string}> = [];

    wallets.forEach((wallet) => {
      const key = `${wallet.network}-${wallet.tokenSymbol}`;
      if (!walletsByNetworkToken[key]) {
        walletsByNetworkToken[key] = wallet;
        availableOptions.push({
          network: wallet.network,
          token: wallet.tokenSymbol,
        });
      }
    });

    const walletsWithPrices = await Promise.all(
      availableOptions.map(async (option) => {
        const key = `${option.network}-${option.token}`;
        const wallet = walletsByNetworkToken[key];
        let cryptoAmount = 0;
        let coinPrice = 0;

        try {
          const conversion = await CoinGeckoPriceService.convertUsdToCrypto(
            parseFloat(paymentRequest.amountFiat.toString()),
            wallet.tokenSymbol
          );

          cryptoAmount = conversion.amount;
          coinPrice = conversion.price;
        } catch (error) {
          console.error(`Failed to convert for ${wallet.network} ${wallet.tokenSymbol}:`, error);
        }

        return {
          id: wallet.id,
          network: wallet.network,
          tokenSymbol: wallet.tokenSymbol,
          tokenName: wallet.tokenName,
          tokenType: wallet.tokenType,
          tokenDecimals: wallet.tokenDecimals,
          contractAddress: wallet.contractAddress,
          walletAddress: wallet.walletAddress,
          cryptoAmount,
          coinPrice,
        };
      })
    );

    return res.json({
      success: true,
      data: {
        linkId: paymentRequest.linkId,
        orderNumber: paymentRequest.orderNumber.toString().padStart(4, '0'),
        amountUsd: parseFloat(paymentRequest.amountFiat.toString()),
        currency: paymentRequest.currencyFiat,
        description: paymentRequest.description,
        status: isExpired ? 'EXPIRED' : paymentRequest.status,
        settlementStatus: paymentRequest.settlementStatus,
        expiresAt: paymentRequest.expiresAt,
        redirectUrl: paymentRequest.redirectUrl,
        merchant: {
          name: paymentRequest.merchant.businessName,
          slug: paymentRequest.merchant.slug,
        },
        wallets: walletsWithPrices,
        availableOptions,
      },
    });
  } catch (error) {
    console.error('Get payment error:', error);
    return res.status(500).json({ error: 'Failed to fetch payment details' });
  }
});

/**
 * POST /public/check-merchant-status
 * Check if a merchant email is suspended (before allowing Supabase OTP)
 */
router.post('/check-merchant-status', async (req: Request, res: Response) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const normalizedEmail = normalizeEmail(email);

    const merchant = await prisma.merchant.findUnique({
      where: { email: normalizedEmail },
      select: {
        id: true,
        suspendedAt: true,
        suspendedBy: true,
        suspendedReason: true,
      },
    });

    // If merchant doesn't exist, allow (for registration)
    if (!merchant) {
      return res.json({
        success: true,
        canProceed: true,
        suspended: false,
      });
    }

    // If merchant is suspended, block
    if (merchant.suspendedAt) {
      return res.status(403).json({
        success: false,
        canProceed: false,
        suspended: true,
        message: 'Account has been suspended. Please contact support for assistance.',
      });
    }

    // Merchant exists and is not suspended
    return res.json({
      success: true,
      canProceed: true,
      suspended: false,
    });
  } catch (error) {
    console.error('Check merchant status error:', error);
    return res.status(500).json({ error: 'Failed to check merchant status' });
  }
});

export default router;
