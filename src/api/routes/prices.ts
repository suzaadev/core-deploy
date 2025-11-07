import { Router, Request, Response } from 'express';
import { CoinGeckoPriceService } from '../../infrastructure/pricing/CoinGeckoPriceService';

const router = Router();

// Get current prices for specified coins
router.get('/', async (req: Request, res: Response) => {
  try {
    const symbols = (req.query.symbols as string)?.split(',') || ['SOL', 'ETH', 'BTC'];
    const prices = await CoinGeckoPriceService.getPrices(symbols);

    return res.json({
      success: true,
      data: prices,
      cachedFor: 180, // seconds
    });
  } catch (error) {
    console.error('Price fetch error:', error);
    return res.status(500).json({ error: 'Failed to fetch prices' });
  }
});

// Convert USD to crypto
router.get('/convert', async (req: Request, res: Response) => {
  try {
    const { amount, symbol } = req.query;

    if (!amount || !symbol) {
      return res.status(400).json({ error: 'Amount and symbol are required' });
    }

    const usdAmount = parseFloat(amount as string);
    if (isNaN(usdAmount) || usdAmount <= 0) {
      return res.status(400).json({ error: 'Invalid amount' });
    }

    const result = await CoinGeckoPriceService.convertUsdToCrypto(
      usdAmount,
      symbol as string
    );

    return res.json({
      success: true,
      data: {
        usd: usdAmount,
        crypto: result.amount,
        symbol: (symbol as string).toUpperCase(),
        rate: result.price,
      },
    });
  } catch (error: any) {
    console.error('Conversion error:', error);
    return res.status(500).json({ error: error.message || 'Conversion failed' });
  }
});

export default router;
