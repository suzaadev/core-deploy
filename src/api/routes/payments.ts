import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { prisma } from '../../infrastructure/database/client';
import { createPaymentRequest } from '../../application/payments/CreatePaymentRequest';

const router = Router();

// Get all payment requests for merchant
router.get('/requests', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.merchant) {
      return res.status(404).json({ error: 'Merchant profile not found' });
    }

    const paymentRequests = await prisma.paymentRequest.findMany({
      where: { merchantId: req.merchant.id },
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
        redirectUrl: true,
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
    if (!req.merchant) {
      return res.status(404).json({ error: 'Merchant profile not found' });
    }

    const { id } = req.params;
    const { settlementStatus } = req.body;

    if (!['PENDING', 'PAID', 'SETTLED', 'REJECTED', 'REISSUED', 'CANCELED', 'CLAIMED_PAID'].includes(settlementStatus)) {
      return res.status(400).json({ error: 'Invalid settlement status' });
    }

    const paymentRequest = await prisma.paymentRequest.findUnique({
      where: { id },
      select: { merchantId: true },
    });

    if (!paymentRequest || paymentRequest.merchantId !== req.merchant.id) {
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

// Basic URL validation - must start with http:// or https://
function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

// Create payment request (existing endpoint)
router.post('/requests', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.merchant) {
      return res.status(404).json({ error: 'Merchant profile not found' });
    }

    const { amount, description, expiryMinutes, redirectUrl } = req.body;
    const parsedAmount = Number(amount);
    const parsedExpiry = Number(expiryMinutes || 60);

    if (!parsedAmount || parsedAmount <= 0) {
      return res.status(400).json({ error: 'Valid amount is required' });
    }

    // Validate redirectUrl if provided
    if (redirectUrl !== undefined && redirectUrl !== null) {
      if (typeof redirectUrl !== 'string' || redirectUrl.trim() === '') {
        return res.status(400).json({ error: 'redirectUrl must be a non-empty string' });
      }
      if (!isValidUrl(redirectUrl.trim())) {
        return res.status(400).json({ error: 'redirectUrl must be a valid URL starting with http:// or https://' });
      }
    }

    const result = await createPaymentRequest({
      merchantId: req.merchant.id,
      amountFiat: parsedAmount,
      description,
      expiryMinutes: parsedExpiry,
      redirectUrl: redirectUrl ? redirectUrl.trim() : undefined,
      createdBy: 'merchant',
    });

    if (!result.success) {
      return res.status(400).json({ error: result.message });
    }

    return res.status(201).json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('Create payment request error:', error);
    return res.status(500).json({ error: 'Failed to create payment request' });
  }
});

export default router;
