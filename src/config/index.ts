import dotenv from 'dotenv';
import { logger } from '../common/logger';

dotenv.config();

/**
 * Validate required environment variables
 */
function validateEnv(): void {
  const required = [
    'DATABASE_URL',
    'JWT_SECRET',
    'API_KEY_SALT',
    'PLUGIN_HMAC_SECRET',
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
  ];

  const missing = required.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    const error = `Missing required environment variables: ${missing.join(', ')}`;
    console.error(error);
    throw new Error(error);
  }

  // Validate JWT secret strength
  if (process.env.JWT_SECRET && process.env.JWT_SECRET.length < 32) {
    logger.warn('JWT_SECRET should be at least 32 characters for security');
  }
}

// Validate environment on startup
validateEnv();

/**
 * Application configuration
 */
export const config = {
  // Server
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  baseUrl: process.env.BASE_URL || 'http://localhost:3000',
  paymentPortalUrl: process.env.PAYMENT_PORTAL_URL || process.env.NEXT_PUBLIC_PAYMENT_PORTAL_URL || 'http://localhost:3065',

  // Database
  database: {
    url: process.env.DATABASE_URL!,
  },

  // Redis
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
  },

  // Security
  security: {
    jwtSecret: process.env.JWT_SECRET!,
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
    apiKeySalt: process.env.API_KEY_SALT!,
    pluginHmacSecret: process.env.PLUGIN_HMAC_SECRET!,
    bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS || '10', 10),
  },

  // CORS
  cors: {
    allowedOrigins: process.env.ALLOWED_ORIGINS
      ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
      : ['http://localhost:3000', 'http://localhost:3001'],
    credentials: true,
  },

  // Rate limiting
  rateLimit: {
    enabled: process.env.RATE_LIMIT_ENABLED !== 'false',
  },

  // Cache
  cache: {
    pluginWalletsTTL: parseInt(process.env.CACHE_PLUGIN_WALLETS_TTL || '60', 10),
    priceCacheTTL: parseInt(process.env.CACHE_PRICE_TTL || '300', 10), // 5 minutes
  },

  // PIN settings
  pin: {
    length: 6,
    expiryMinutes: parseInt(process.env.PIN_EXPIRY_MINUTES || '10', 10),
    maxAttempts: parseInt(process.env.PIN_MAX_ATTEMPTS || '5', 10),
  },

  // Payment settings
  payment: {
    defaultExpiryMinutes: parseInt(process.env.PAYMENT_DEFAULT_EXPIRY || '60', 10),
    maxExpiryMinutes: parseInt(process.env.PAYMENT_MAX_EXPIRY || '1440', 10), // 24 hours
    minExpiryMinutes: parseInt(process.env.PAYMENT_MIN_EXPIRY || '5', 10),
  },

  // Email
  email: {
    enabled: process.env.EMAIL_ENABLED === 'true',
    sendgridApiKey: process.env.SENDGRID_API_KEY || '',
    fromAddress: process.env.EMAIL_FROM || 'noreply@suzaa.com',
  },

  // Logging
  logging: {
    level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
  },
  // Supabase
  supabase: {
    url: process.env.SUPABASE_URL!,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
    anonKey: process.env.SUPABASE_ANON_KEY || '',
  },
} as const;

export type Config = typeof config;
