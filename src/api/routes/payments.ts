import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { prisma } from '../../infrastructure/database/client';
import { CoinGeckoPriceService } from '../../infrastructure/pricing/CoinGeckoPriceService';
import { config } from '../../config';

const router = Router();

// Get all payment requests for merchant
router.get('/requests', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const paymentRequests = await prisma.paymentRequest.findMany({
      where: { merchantId: req.merchant!.id },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        linkId: true,
        orderDate: true,
        orderNumber: true,
        amountFiat: true,
        currencyFiat: true,
        description: true,
        status: true,
        createdBy: true,
        settlementStatus: true,
        expiresAt: true,
        createdAt: true,
      },
    });

    // Transform status to ACTIVE/EXPIRED
    const now = new Date();
    const transformed = paymentRequests.map((pr: any) => ({
      ...pr,
      amountFiat: parseFloat(pr.amountFiat.toString()),
      status: now > pr.expiresAt ? 'EXPIRED' : 'ACTIVE',
      originalStatus: pr.status,
    }));

    return res.json({
      success: true,
      data: transformed,
    });
  } catch (error) {
    console.error('Get payment requests error:', error);
    return res.status(500).json({ error: 'Failed to fetch payment requests' });
  }
});

// Update settlement status
router.patch('/requests/:id/settlement', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { settlementStatus } = req.body;

    if (!['PENDING', 'PAID', 'SETTLED', 'REJECTED', 'REISSUED'].includes(settlementStatus)) {
      return res.status(400).json({ error: 'Invalid settlement status' });
    }

    const paymentRequest = await prisma.paymentRequest.findUnique({
      where: { id },
      select: { merchantId: true },
    });

    if (!paymentRequest || paymentRequest.merchantId !== req.merchant!.id) {
      return res.status(404).json({ error: 'Payment request not found' });
    }

    const updated = await prisma.paymentRequest.update({
      where: { id },
      data: { settlementStatus },
      select: {
        id: true,
        settlementStatus: true,
      },
    });

    return res.json({
      success: true,
      data: updated,
    });
  } catch (error) {
    console.error('Update settlement status error:', error);
    return res.status(500).json({ error: 'Failed to update settlement status' });
  }
});

// Create payment request (existing endpoint)
router.post('/requests', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { amount, description, expiryMinutes } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Valid amount is required' });
    }

    const expiry = expiryMinutes || 60;
    const today = new Date();
    const dateStr = today.toISOString().split('T')[0].replace(/-/g, '');

    const lastOrder = await prisma.paymentRequest.findFirst({
      where: {
        merchantId: req.merchant!.id,
        orderDate: dateStr,
      },
      orderBy: { orderNumber: 'desc' },
    });

    const nextOrderNumber = lastOrder ? lastOrder.orderNumber + 1 : 1;
    const linkId = `${req.merchant!.slug}/${dateStr}/${nextOrderNumber.toString().padStart(4, '0')}`;
    const expiresAt = new Date(Date.now() + expiry * 60 * 1000);

    const paymentRequest = await prisma.paymentRequest.create({
      data: {
        merchantId: req.merchant!.id,
        orderDate: dateStr,
        orderNumber: nextOrderNumber,
        linkId,
        amountFiat: amount,
        currencyFiat: 'USD',
        description: description || null,
        expiryMinutes: expiry,
        expiresAt,
        createdBy: 'merchant',
        status: 'PENDING',
        settlementStatus: 'PENDING',
      },
    });

    return res.status(201).json({
      success: true,
      data: {
        ...paymentRequest,
        amountFiat: parseFloat(paymentRequest.amountFiat.toString()),
        paymentUrl: `${config.baseUrl}/${linkId}`,
      },
    });
  } catch (error) {
    console.error('Create payment request error:', error);
    return res.status(500).json({ error: 'Failed to create payment request' });
  }
});

export default router;
