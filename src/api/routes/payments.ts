import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { createPaymentRequest } from '../../application/payments/CreatePaymentRequest';
import { prisma } from '../../infrastructure/database/client';

const router = Router();

/**
 * POST /payments/requests
 * Create payment request (merchant authenticated)
 */
router.post('/requests', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { amount, description, expiryMinutes } = req.body;

    if (!amount || typeof amount !== 'number') {
      return res.status(400).json({ error: 'Amount is required and must be a number' });
    }

    const result = await createPaymentRequest({
      merchantId: req.merchant!.id,
      amountFiat: amount,
      description,
      expiryMinutes: expiryMinutes || 60,
      createdBy: 'merchant',
    });

    if (!result.success) {
      return res.status(400).json({ error: result.message });
    }

    return res.status(201).json({
      success: true,
      data: {
        paymentRequestId: result.paymentRequestId,
        linkId: result.linkId,
        paymentUrl: result.paymentUrl,
        expiresAt: result.expiresAt,
      },
    });
  } catch (error) {
    console.error('Create payment request error:', error);
    return res.status(500).json({ error: 'Failed to create payment request' });
  }
});

/**
 * GET /payments/requests
 * List merchant's payment requests
 */
router.get('/requests', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { status, limit = 50, offset = 0 } = req.query;

    const where: any = {
      merchantId: req.merchant!.id,
    };

    if (status) {
      where.status = status;
    }

    const requests = await prisma.paymentRequest.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: Number(limit),
      skip: Number(offset),
      select: {
        id: true,
        linkId: true,
        amountFiat: true,
        currencyFiat: true,
        description: true,
        status: true,
        expiresAt: true,
        createdBy: true,
        createdAt: true,
      },
    });

    const total = await prisma.paymentRequest.count({ where });

    return res.status(200).json({
      success: true,
      data: requests,
      total,
      limit: Number(limit),
      offset: Number(offset),
    });
  } catch (error) {
    console.error('List payment requests error:', error);
    return res.status(500).json({ error: 'Failed to fetch payment requests' });
  }
});

/**
 * GET /payments/:slug/:date/:orderNumber
 * Get payment request by linkId components
 */
router.get('/:slug/:date/:orderNumber', async (req, res) => {
  try {
    const { slug, date, orderNumber } = req.params;
    const linkId = `${slug}/${date}/${orderNumber}`;

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

    // Check if expired
    if (new Date() > paymentRequest.expiresAt && paymentRequest.status === 'PENDING') {
      await prisma.paymentRequest.update({
        where: { id: paymentRequest.id },
        data: { status: 'EXPIRED' },
      });
      paymentRequest.status = 'EXPIRED';
    }

    return res.status(200).json({
      success: true,
      data: paymentRequest,
    });
  } catch (error) {
    console.error('Get payment request error:', error);
    return res.status(500).json({ error: 'Failed to fetch payment request' });
  }
});

export default router;
