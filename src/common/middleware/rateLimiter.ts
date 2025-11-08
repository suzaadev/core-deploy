import rateLimit from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import { redisClient } from '../../infrastructure/cache/redis';
import { RateLimitError } from '../errors/AppError';

/**
 * Create rate limiter with Redis store
 */
function createRateLimiter(options: {
  windowMs: number;
  max: number;
  message?: string;
  skipSuccessfulRequests?: boolean;
  keyGenerator?: (req: any) => string;
}) {
  return rateLimit({
    windowMs: options.windowMs,
    max: options.max,
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: options.skipSuccessfulRequests ?? false,

    // Use Redis for distributed rate limiting
    store: new RedisStore({
      sendCommand: (...args: string[]) => (redisClient as any).call(...args),
      prefix: 'rl:',
    }),

    // Custom key generator (defaults to IP)
    keyGenerator: options.keyGenerator || ((req) => req.ip || 'unknown'),

    // Custom handler for rate limit exceeded
    handler: (req, res) => {
      const retryAfter = Math.ceil(options.windowMs / 1000);
      res.setHeader('Retry-After', retryAfter);

      throw new RateLimitError(
        options.message || 'Too many requests, please try again later',
        retryAfter
      );
    },
  });
}

/**
 * Strict rate limiter for authentication endpoints
 * 5 requests per 15 minutes per IP
 */
export const authRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  message: 'Too many authentication attempts, please try again in 15 minutes',
  skipSuccessfulRequests: false,
});

/**
 * Rate limiter for login endpoints
 * 10 requests per 15 minutes per IP
 */
export const loginRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  message: 'Too many login attempts, please try again in 15 minutes',
});

/**
 * Rate limiter for PIN verification
 * 5 attempts per 10 minutes per email
 */
export const pinVerificationRateLimiter = createRateLimiter({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 5,
  message: 'Too many PIN verification attempts, please try again in 10 minutes',
  keyGenerator: (req) => {
    // Rate limit by email instead of IP
    const email = req.body?.email || req.ip;
    return `pin:${email}`;
  },
});

/**
 * Standard API rate limiter
 * 100 requests per 15 minutes per IP
 */
export const apiRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  message: 'Too many requests, please try again later',
  skipSuccessfulRequests: true,
});

/**
 * Rate limiter for public payment creation
 * 20 requests per hour per IP
 */
export const publicPaymentRateLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20,
  message: 'Too many payment creation attempts, please try again later',
});

/**
 * Strict rate limiter for admin operations
 * 50 requests per 15 minutes per IP
 */
export const adminRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50,
  message: 'Too many admin requests, please try again later',
});

/**
 * Rate limiter for wallet operations
 * 30 requests per 15 minutes per merchant
 */
export const walletRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30,
  keyGenerator: (req) => {
    // Rate limit by merchant ID
    const merchantId = req.merchant?.id || req.ip;
    return `wallet:${merchantId}`;
  },
});
