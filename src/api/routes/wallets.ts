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
    const { 
      network, 
      tokenSymbol, 
      tokenName, 
      tokenType, 
      tokenDecimals, 
      contractAddress, 
      walletAddress, 
      label 
    } = req.body;

    // Validate required fields
    if (!network || !tokenSymbol || !tokenType || !walletAddress) {
      return res.status(400).json({ 
        error: 'Network, token symbol, token type, and wallet address are required' 
      });
    }

    const merchant = await prisma.merchant.findUnique({
      where: { id: req.merchant!.id },
      select: { walletLimit: true },
    });

    if (!merchant) {
      return res.status(404).json({ error: 'Merchant not found' });
    }

    if (merchant.walletLimit > 0) {
      const walletCount = await prisma.wallet.count({
        where: { merchantId: req.merchant!.id },
      });

      if (walletCount >= merchant.walletLimit) {
        return res.status(400).json({
          error: `Wallet limit reached. This merchant can have up to ${merchant.walletLimit} wallet(s).`,
        });
      }
    }

    // Check if wallet already exists
    const existing = await prisma.wallet.findFirst({
      where: {
        merchantId: req.merchant!.id,
        network: network.toUpperCase(),
        tokenSymbol: tokenSymbol.toUpperCase(),
        walletAddress,
      },
    });

    if (existing) {
      return res.status(400).json({ 
        error: 'Wallet with this network, token, and address combination already exists' 
      });
    }

    // Validate token decimals
    const decimals = tokenDecimals || 9;
    if (decimals < 0 || decimals > 18) {
      return res.status(400).json({ error: 'Token decimals must be between 0 and 18' });
    }

    const wallet = await prisma.wallet.create({
      data: {
        merchantId: req.merchant!.id,
        network: network.toUpperCase(),
        tokenSymbol: tokenSymbol.toUpperCase(),
        tokenName: tokenName || null,
        tokenType: tokenType.toUpperCase(),
        tokenDecimals: decimals,
        contractAddress: contractAddress || null,
        walletAddress,
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
