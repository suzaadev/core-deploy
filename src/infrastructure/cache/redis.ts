import Redis from 'ioredis';
import { config } from '../../config';

export const redis = new Redis(config.redis.url, {
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  lazyConnect: true,
});

export async function connectRedis() {
  try {
    await redis.connect();
    console.log('✅ Redis connected');
  } catch (error) {
    console.error('❌ Redis connection failed:', error);
    process.exit(1);
  }
}

export async function disconnectRedis() {
  await redis.quit();
}
