import Redis from 'ioredis';
import { config } from '../../config';
import { logger } from '../../common/logger';

export const redis = new Redis(config.redis.url, {
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  lazyConnect: true,
  tls: {},
});

redis.on('connect', () => {
  logger.info('Redis connected successfully');
});

redis.on('error', (err: any) => {
  logger.error('Redis connection error', { 
    message: err.message
  });
});

export async function connectRedis() {
  try {
    await redis.connect();
    logger.info('Redis connected');
  } catch (error: any) {
    logger.error('Redis connection failed', { 
      message: error?.message
    });
    throw error;
  }
}

export async function disconnectRedis() {
  await redis.quit();
}

export const redisClient = redis;
export default redis;
