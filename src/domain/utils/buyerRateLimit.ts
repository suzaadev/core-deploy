import { redis } from '../../infrastructure/cache/redis';

/**
 * Check if buyer (by IP) can create order
 * Uses Redis to track orders per hour per merchant
 */
export async function canBuyerCreateOrder(
  merchantId: string,
  buyerIp: string,
  maxOrdersPerHour: number
): Promise<{ allowed: boolean; remaining: number }> {
  const key = `buyer-orders:${merchantId}:${buyerIp}`;
  
  // Get current count
  const count = await redis.get(key);
  const currentCount = count ? parseInt(count, 10) : 0;

  if (currentCount >= maxOrdersPerHour) {
    return { allowed: false, remaining: 0 };
  }

  return { allowed: true, remaining: maxOrdersPerHour - currentCount };
}

/**
 * Record buyer order creation
 * Increments count and sets 1-hour expiry
 */
export async function recordBuyerOrder(
  merchantId: string,
  buyerIp: string
): Promise<void> {
  const key = `buyer-orders:${merchantId}:${buyerIp}`;
  
  // Increment and set expiry to 1 hour (3600 seconds)
  const count = await redis.incr(key);
  
  // Set expiry only on first order
  if (count === 1) {
    await redis.expire(key, 3600);
  }
}
