import { Router, Request, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { prisma } from '../../infrastructure/database/client';

const router = Router();

// Get all wallets for merchant
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const wallets = await prisma.wallet.findMany({
      where: { merchantId: req.merchant!.id },
      orderBy: { createdAt: 'desc' },
    });

    return res.json({
      success: true,
      data: wallets,
    });
  } catch (error) {
    console.error('Get wallets error:', error);
    return res.status(500).json({ error: 'Failed to fetch wallets' });
  }
});

// Add new wallet
router.post('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { blockchain, address, label } = req.body;

    if (!blockchain || !address) {
      return res.status(400).json({ error: 'Blockchain and address are required' });
    }

    // Check if wallet already exists
    const existing = await prisma.wallet.findFirst({
      where: {
        merchantId: req.merchant!.id,
        blockchain,
        address,
      },
    });

    if (existing) {
      return res.status(400).json({ error: 'Wallet already exists' });
    }

    const wallet = await prisma.wallet.create({
      data: {
        merchantId: req.merchant!.id,
        blockchain: blockchain.toUpperCase(),
        address,
        label: label || null,
        enabled: true,
      },
    });

    return res.status(201).json({
      success: true,
      data: wallet,
    });
  } catch (error) {
    console.error('Create wallet error:', error);
    return res.status(500).json({ error: 'Failed to create wallet' });
  }
});

// Update wallet (toggle enabled or change label)
router.patch('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { enabled, label } = req.body;

    // Verify wallet belongs to merchant
    const wallet = await prisma.wallet.findFirst({
      where: {
        id,
        merchantId: req.merchant!.id,
      },
    });

    if (!wallet) {
      return res.status(404).json({ error: 'Wallet not found' });
    }

    const updated = await prisma.wallet.update({
      where: { id },
      data: {
        ...(typeof enabled === 'boolean' && { enabled }),
        ...(label !== undefined && { label }),
      },
    });

    return res.json({
      success: true,
      data: updated,
    });
  } catch (error) {
    console.error('Update wallet error:', error);
    return res.status(500).json({ error: 'Failed to update wallet' });
  }
});

// Delete wallet
router.delete('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    // Verify wallet belongs to merchant
    const wallet = await prisma.wallet.findFirst({
      where: {
        id,
        merchantId: req.merchant!.id,
      },
    });

    if (!wallet) {
      return res.status(404).json({ error: 'Wallet not found' });
    }

    await prisma.wallet.delete({ where: { id } });

    return res.json({
      success: true,
      message: 'Wallet deleted',
    });
  } catch (error) {
    console.error('Delete wallet error:', error);
    return res.status(500).json({ error: 'Failed to delete wallet' });
  }
});

export default router;
