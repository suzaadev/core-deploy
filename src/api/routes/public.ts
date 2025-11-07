import { Router, Request, Response } from 'express';
import { prisma } from '../../infrastructure/database/client';
import { CoinGeckoPriceService } from '../../infrastructure/pricing/CoinGeckoPriceService';
import { redis } from '../../infrastructure/cache/redis';

const router = Router();

// Rate limiting helper
async function checkRateLimit(merchantId: string, ip: string, maxAllowed: number): Promise<boolean> {
  const key = `rate:public:${merchantId}:${ip}`;
  const count = await redis.get(key);
  
  if (count && parseInt(count) >= maxAllowed) {
    return false; // Rate limit exceeded
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

    // Find merchant
    const merchant = await prisma.merchant.findUnique({
      where: { slug: merchantSlug },
      select: {
        id: true,
        slug: true,
        businessName: true,
        allowUnsolicitedPayments: true,
        maxBuyerOrdersPerHour: true,
      },
    });

    if (!merchant) {
      return res.status(404).json({ error: 'Merchant not found' });
    }

    if (!merchant.allowUnsolicitedPayments) {
      return res.status(403).json({ error: 'This merchant does not accept unsolicited payments' });
    }

    // Check rate limit with merchant's setting
    const allowed = await checkRateLimit(merchant.id, clientIp, merchant.maxBuyerOrdersPerHour);
    if (!allowed) {
      return res.status(429).json({ 
        error: `Rate limit exceeded. You can create ${merchant.maxBuyerOrdersPerHour} payment(s) per hour.` 
      });
    }

    // Get today's date and next order number
    const today = new Date();
    const dateStr = today.toISOString().split('T')[0].replace(/-/g, '');

    const lastOrder = await prisma.paymentRequest.findFirst({
      where: {
        merchantId: merchant.id,
        orderDate: dateStr,
      },
      orderBy: { orderNumber: 'desc' },
    });

    const nextOrderNumber = lastOrder ? lastOrder.orderNumber + 1 : 1;
    const linkId = `${merchant.slug}/${dateStr}/${nextOrderNumber.toString().padStart(4, '0')}`;

    // Create payment request
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    const paymentRequest = await prisma.paymentRequest.create({
      data: {
        merchantId: merchant.id,
        orderDate: dateStr,
        orderNumber: nextOrderNumber,
        linkId,
        amountFiat: parsedAmount,
        currencyFiat: 'USD',
        description: description || null,
        expiryMinutes: 60,
        expiresAt,
        createdBy: 'buyer',
        createdByIp: clientIp,
        status: 'PENDING',
      },
    });

    // Increment rate limit
    const ttlSeconds = 3600; // 1 hour
    await incrementRateLimit(merchant.id, clientIp, ttlSeconds);

    return res.status(201).json({
      success: true,
      data: {
        linkId: paymentRequest.linkId,
        orderNumber: nextOrderNumber.toString().padStart(4, '0'),
        paymentUrl: `http://116.203.195.248:3001/${linkId}`,
      },
    });
  } catch (error) {
    console.error('Create public payment error:', error);
    return res.status(500).json({ error: 'Failed to create payment request' });
  }
});

// Get payment request details
router.get('/payment/*', async (req: Request, res: Response) => {
  try {
    const linkId = req.params[0];

    if (!linkId) {
      return res.status(400).json({ error: 'Link ID is required' });
    }

    const paymentRequest = await prisma.paymentRequest.findUnique({
      where: { linkId },
      include: {
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
        blockchain: true,
        address: true,
      },
    });

    const walletsWithPrices = await Promise.all(
      wallets.map(async (wallet) => {
        let cryptoAmount = 0;
        let coinPrice = 0;
        let symbol = '';

        try {
          switch (wallet.blockchain) {
            case 'SOLANA':
              symbol = 'SOL';
              break;
            case 'ETHEREUM':
              symbol = 'ETH';
              break;
            case 'BITCOIN':
              symbol = 'BTC';
              break;
            default:
              symbol = 'SOL';
          }

          const conversion = await CoinGeckoPriceService.convertUsdToCrypto(
            parseFloat(paymentRequest.amountFiat.toString()),
            symbol
          );

          cryptoAmount = conversion.amount;
          coinPrice = conversion.price;
        } catch (error) {
          console.error(`Failed to convert for ${wallet.blockchain}:`, error);
        }

        return {
          ...wallet,
          symbol,
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
        expiresAt: paymentRequest.expiresAt,
        merchant: {
          name: paymentRequest.merchant.businessName,
          slug: paymentRequest.merchant.slug,
        },
        wallets: walletsWithPrices,
      },
    });
  } catch (error) {
    console.error('Get payment error:', error);
    return res.status(500).json({ error: 'Failed to fetch payment details' });
  }
});

export default router;
