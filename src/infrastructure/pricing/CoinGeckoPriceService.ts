import axios from 'axios';
import { redis } from '../cache/redis';

const COINGECKO_API = 'https://api.coingecko.com/api/v3';
const CACHE_TTL = 180; // 3 minutes cache

interface PriceData {
  usd: number;
  lastUpdated: number;
}

const COIN_IDS: Record<string, string> = {
  SOL: 'solana',
  ETH: 'ethereum',
  BTC: 'bitcoin',
  USDC: 'usd-coin',
  USDT: 'tether',
};

export class CoinGeckoPriceService {
  private static async fetchPriceFromAPI(coinId: string): Promise<number> {
    try {
      const response = await axios.get(
        `${COINGECKO_API}/simple/price`,
        {
          params: {
            ids: coinId,
            vs_currencies: 'usd',
          },
          timeout: 5000,
        }
      );

      return response.data[coinId]?.usd || 0;
    } catch (error) {
      console.error(`Failed to fetch price for ${coinId}:`, error);
      throw new Error(`Price fetch failed for ${coinId}`);
    }
  }

  static async getPrice(symbol: string): Promise<number> {
    const coinId = COIN_IDS[symbol.toUpperCase()];
    if (!coinId) {
      throw new Error(`Unsupported coin: ${symbol}`);
    }

    const cacheKey = `price:${symbol}`;

    try {
      // Try to get from cache
      const cached = await redis.get(cacheKey);
      if (cached) {
        const priceData: PriceData = JSON.parse(cached);
        console.log(`✅ Price cache hit for ${symbol}: $${priceData.usd}`);
        return priceData.usd;
      }

      // Cache miss - fetch from API
      console.log(`🔄 Fetching fresh price for ${symbol} from CoinGecko...`);
      const price = await this.fetchPriceFromAPI(coinId);

      // Cache the result
      const priceData: PriceData = {
        usd: price,
        lastUpdated: Date.now(),
      };
      await redis.set(cacheKey, JSON.stringify(priceData), 'EX', CACHE_TTL);

      console.log(`✅ Cached ${symbol} price: $${price} (TTL: ${CACHE_TTL}s)`);
      return price;
    } catch (error) {
      console.error(`Error getting price for ${symbol}:`, error);
      // Return last known price if available, otherwise throw
      const cached = await redis.get(cacheKey);
      if (cached) {
        const priceData: PriceData = JSON.parse(cached);
        console.warn(`⚠️ Using stale price for ${symbol}: $${priceData.usd}`);
        return priceData.usd;
      }
      throw error;
    }
  }

  static async convertUsdToCrypto(
    usdAmount: number,
    symbol: string
  ): Promise<{ amount: number; price: number }> {
    const price = await this.getPrice(symbol);
    if (price === 0) {
      throw new Error(`Invalid price for ${symbol}`);
    }

    const cryptoAmount = usdAmount / price;
    return {
      amount: cryptoAmount,
      price,
    };
  }

  static async getPrices(symbols: string[]): Promise<Record<string, number>> {
    const prices: Record<string, number> = {};
    
    for (const symbol of symbols) {
      try {
        prices[symbol] = await this.getPrice(symbol);
      } catch (error) {
        console.error(`Failed to get price for ${symbol}:`, error);
        prices[symbol] = 0;
      }
    }

    return prices;
  }
}
