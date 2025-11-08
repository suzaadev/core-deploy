import axios from 'axios';
import CircuitBreaker from 'opossum';
import { redis } from '../cache/redis';
import { logger } from '../../common/logger';
import { ServiceUnavailableError } from '../../common/errors/AppError';

const COINGECKO_API = 'https://api.coingecko.com/api/v3';
const CACHE_TTL = 180; // 3 minutes cache
const STALE_CACHE_TTL = 3600; // 1 hour for fallback

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

/**
 * Improved CoinGecko Price Service with Circuit Breaker
 * Implements resilient price fetching with fallback to stale cache
 */
export class CoinGeckoPriceService {
  private static circuitBreaker: CircuitBreaker;

  static {
    // Initialize circuit breaker
    this.circuitBreaker = new CircuitBreaker(this.fetchPriceFromAPI.bind(this), {
      timeout: 5000, // 5 second timeout
      errorThresholdPercentage: 50, // Open circuit if 50% of requests fail
      resetTimeout: 30000, // Try again after 30 seconds
      rollingCountTimeout: 10000, // 10 second window for error percentage
      rollingCountBuckets: 10,
      name: 'CoinGeckoPriceService',
    });

    // Event handlers
    this.circuitBreaker.on('open', () => {
      logger.warn('CoinGecko circuit breaker opened - too many failures');
    });

    this.circuitBreaker.on('halfOpen', () => {
      logger.info('CoinGecko circuit breaker half-open - testing recovery');
    });

    this.circuitBreaker.on('close', () => {
      logger.info('CoinGecko circuit breaker closed - service recovered');
    });

    this.circuitBreaker.fallback(() => {
      logger.warn('CoinGecko circuit breaker fallback triggered');
      return null;
    });
  }

  /**
   * Fetch price from CoinGecko API (wrapped by circuit breaker)
   */
  private static async fetchPriceFromAPI(coinId: string): Promise<number> {
    try {
      const response = await axios.get(`${COINGECKO_API}/simple/price`, {
        params: {
          ids: coinId,
          vs_currencies: 'usd',
        },
        timeout: 5000,
      });

      const price = response.data[coinId]?.usd;
      if (!price) {
        throw new Error(`No price data for ${coinId}`);
      }

      return price;
    } catch (error: any) {
      logger.error('CoinGecko API request failed', {
        coinId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get price with resilience (fresh cache → API → stale cache)
   */
  static async getPrice(symbol: string): Promise<number> {
    const coinId = COIN_IDS[symbol.toUpperCase()];
    if (!coinId) {
      throw new Error(`Unsupported coin: ${symbol}`);
    }

    const cacheKey = `price:${symbol}`;
    const staleCacheKey = `price:stale:${symbol}`;

    try {
      // 1. Try fresh cache
      const cached = await redis.get(cacheKey);
      if (cached) {
        const priceData: PriceData = JSON.parse(cached);
        logger.debug('Price cache hit (fresh)', { symbol, price: priceData.usd });
        return priceData.usd;
      }

      // 2. Try API with circuit breaker
      const price = await this.circuitBreaker.fire(coinId) as number | null;

      if (price !== null && typeof price === 'number') {
        // Success - cache both fresh and stale
        const priceData: PriceData = {
          usd: price,
          lastUpdated: Date.now(),
        };

        await Promise.all([
          redis.set(cacheKey, JSON.stringify(priceData), 'EX', CACHE_TTL),
          redis.set(staleCacheKey, JSON.stringify(priceData), 'EX', STALE_CACHE_TTL),
        ]);

        logger.info('Price fetched from API', { symbol, price });
        return price;
      }

      // 3. Circuit breaker open or fallback - try stale cache
      const staleCache = await redis.get(staleCacheKey);
      if (staleCache) {
        const priceData: PriceData = JSON.parse(staleCache);
        const ageMinutes = (Date.now() - priceData.lastUpdated) / 1000 / 60;

        logger.warn('Using stale price cache', {
          symbol,
          price: priceData.usd,
          ageMinutes: ageMinutes.toFixed(1),
        });

        return priceData.usd;
      }

      // 4. No cache available - throw error
      throw new ServiceUnavailableError(
        'Price service temporarily unavailable. Please try again later.',
      );
    } catch (error: any) {
      // Final fallback - check stale cache one more time
      const staleCache = await redis.get(staleCacheKey);
      if (staleCache) {
        const priceData: PriceData = JSON.parse(staleCache);
        logger.error('Using stale cache as last resort', {
          symbol,
          price: priceData.usd,
          error: error.message,
        });
        return priceData.usd;
      }

      logger.error('Complete price fetch failure', {
        symbol,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get multiple prices in parallel
   * FIXED: Now uses Promise.all for parallel fetching
   */
  static async getPrices(symbols: string[]): Promise<Record<string, number>> {
    const pricePromises = symbols.map(async (symbol) => {
      try {
        const price = await this.getPrice(symbol);
        return { symbol, price, error: null };
      } catch (error: any) {
        logger.error('Failed to get price for symbol', {
          symbol,
          error: error.message,
        });
        return { symbol, price: 0, error: error.message };
      }
    });

    const results = await Promise.all(pricePromises);

    const prices: Record<string, number> = {};
    for (const result of results) {
      prices[result.symbol] = result.price;
    }

    return prices;
  }

  /**
   * Convert USD to crypto amount
   */
  static async convertUsdToCrypto(
    usdAmount: number,
    symbol: string,
  ): Promise<{ amount: number; price: number }> {
    const price = await this.getPrice(symbol);

    if (price === 0) {
      throw new ServiceUnavailableError(`Unable to get price for ${symbol}`);
    }

    const cryptoAmount = usdAmount / price;

    return {
      amount: cryptoAmount,
      price,
    };
  }

  /**
   * Get circuit breaker stats (for monitoring)
   */
  static getStats() {
    return {
      state: this.circuitBreaker.opened ? 'open' : 'closed',
      stats: this.circuitBreaker.stats,
    };
  }
}
