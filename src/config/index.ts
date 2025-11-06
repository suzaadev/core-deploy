import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  baseUrl: process.env.BASE_URL || 'http://localhost:3000',
  
  database: {
    url: process.env.DATABASE_URL!,
  },
  
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
  },
  
  security: {
    jwtSecret: process.env.JWT_SECRET!,
    apiKeySalt: process.env.API_KEY_SALT!,
    pluginHmacSecret: process.env.PLUGIN_HMAC_SECRET!,
  },
  
  cache: {
    pluginWalletsTTL: 60,
  },
};
