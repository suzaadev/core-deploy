import Redis from 'ioredis';
import { config } from '../../config';
import { logger } from '../../common/logger';

export const redis = new Redis(config.redis.url, {
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  lazyConnect: true,
});

redis.on('connect', () => {
  logger.info('Redis connected successfully');
});

redis.on('error', (err) => {
  logger.error('Redis connection error', { error: err });
});

export async function connectRedis() {
  try {
    await redis.connect();
    logger.info('Redis connected');
  } catch (error) {
    logger.error('Redis connection failed', { error });
    process.exit(1);
  }
}

export async function disconnectRedis() {
  await redis.quit();
}

// Export as redisClient for compatibility
export const redisClient = redis;
export default redis;
