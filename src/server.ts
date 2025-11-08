import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import hpp from 'hpp';
import { config } from './config';
import { connectDatabase, disconnectDatabase } from './infrastructure/database/client';
import { connectRedis, disconnectRedis } from './infrastructure/cache/redis';
import { logger, httpLogStream } from './common/logger';
import { errorHandler, notFoundHandler } from './common/errors/errorHandler';
import { correlationIdMiddleware } from './common/middleware/correlationId';

// Import routes
import authRoutes from './api/routes/auth';
import adminRoutes from './api/routes/admin';
import merchantRoutes from './api/routes/merchants';
import paymentRoutes from './api/routes/payments';
import walletRoutes from './api/routes/wallets';
import priceRoutes from './api/routes/prices';
import publicRoutes from './api/routes/public';

/**
 * Create Express application with production-grade middleware
 */
const app = express();

/**
 * Trust proxy - important for rate limiting and IP detection
 */
app.set('trust proxy', 1);

/**
 * Security middleware
 */
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
}));

/**
 * CORS configuration with environment-based origins
 * FIXED: No longer allows all origins
 */
app.use(cors({
  origin: config.cors.allowedOrigins,
  credentials: config.cors.credentials,
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Correlation-ID'],
  exposedHeaders: ['X-Correlation-ID'],
  maxAge: 86400, // 24 hours
}));

/**
 * Compression middleware
 */
app.use(compression());

/**
 * HTTP Parameter Pollution protection
 */
app.use(hpp());

/**
 * Request parsing
 */
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

/**
 * Correlation ID for distributed tracing
 */
app.use(correlationIdMiddleware);

/**
 * HTTP request logging
 */
if (config.nodeEnv === 'production') {
  app.use(morgan('combined', { stream: httpLogStream }));
} else {
  app.use(morgan('dev'));
}

/**
 * Health check endpoint
 */
app.get('/health', async (req, res) => {
  try {
    // Check database connectivity
    await prisma.$queryRaw`SELECT 1`;

    // Check Redis connectivity
    await redisClient.ping();

    res.json({
      status: 'healthy',
      service: 'suzaa-core',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      environment: config.nodeEnv,
      dependencies: {
        database: 'connected',
        redis: 'connected',
      },
    });
  } catch (error) {
    logger.error('Health check failed', { error });
    res.status(503).json({
      status: 'unhealthy',
      service: 'suzaa-core',
      error: 'Service dependencies unavailable',
    });
  }
});

/**
 * Root endpoint
 */
app.get('/', (req, res) => {
  res.json({
    service: 'SUZAA Core Payment Gateway',
    version: '1.0.0',
    status: 'running',
    documentation: '/api/docs', // For future OpenAPI docs
    health: '/health',
  });
});

/**
 * API Routes
 */
app.use('/auth', authRoutes);
app.use('/admin', adminRoutes);
app.use('/merchants', merchantRoutes);
app.use('/payments', paymentRoutes);
app.use('/wallets', walletRoutes);
app.use('/prices', priceRoutes);
app.use('/public', publicRoutes);

/**
 * 404 handler for undefined routes
 */
app.use(notFoundHandler);

/**
 * Global error handling middleware
 * Must be last in middleware chain
 */
app.use(errorHandler);

/**
 * Graceful shutdown handling
 * Properly close database and Redis connections
 */
let server: any;
let isShuttingDown = false;

async function gracefulShutdown(signal: string): Promise<void> {
  if (isShuttingDown) {
    logger.warn('Shutdown already in progress, forcing exit');
    process.exit(1);
  }

  isShuttingDown = true;
  logger.info(`${signal} received, starting graceful shutdown`);

  // Stop accepting new connections
  if (server) {
    server.close(() => {
      logger.info('HTTP server closed');
    });
  }

  try {
    // Close database connections
    logger.info('Closing database connections...');
    await disconnectDatabase();

    // Close Redis connections
    logger.info('Closing Redis connections...');
    await disconnectRedis();

    logger.info('Graceful shutdown completed');
    process.exit(0);
  } catch (error) {
    logger.error('Error during graceful shutdown', { error });
    process.exit(1);
  }
}

// Handle shutdown signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', { error, stack: error.stack });
  gracefulShutdown('UNCAUGHT_EXCEPTION');
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled promise rejection', { reason, promise });
  gracefulShutdown('UNHANDLED_REJECTION');
});

/**
 * Start server
 */
async function start(): Promise<void> {
  try {
    logger.info('Starting SUZAA Core...');

    // Connect to database
    logger.info('Connecting to database...');
    await connectDatabase();
    logger.info('Database connected successfully');

    // Connect to Redis
    logger.info('Connecting to Redis...');
    await connectRedis();
    logger.info('Redis connected successfully');

    // Start HTTP server
    server = app.listen(config.port, () => {
      logger.info(`🚀 SUZAA Core started successfully`, {
        port: config.port,
        environment: config.nodeEnv,
        baseUrl: config.baseUrl,
        corsOrigins: config.cors.allowedOrigins,
      });

      // Log available endpoints
      console.log(`\n${'='.repeat(60)}`);
      console.log('🚀 SUZAA Core Payment Gateway');
      console.log(`${'='.repeat(60)}`);
      console.log(`Environment: ${config.nodeEnv}`);
      console.log(`Port: ${config.port}`);
      console.log(`Base URL: ${config.baseUrl}`);
      console.log(`${'='.repeat(60)}\n`);
      console.log('📋 Available Endpoints:\n');
      console.log('Health & Status:');
      console.log('  GET  /health          - Health check');
      console.log('  GET  /                - Service info\n');
      console.log('🔐 Merchant Authentication:');
      console.log('  POST /auth/register   - Register new merchant');
      console.log('  POST /auth/login      - Request login PIN');
      console.log('  POST /auth/verify     - Verify PIN & get token');
      console.log('  GET  /auth/me         - Get current merchant\n');
      console.log('👑 Super Admin:');
      console.log('  POST /admin/register  - Register super admin (one-time)');
      console.log('  POST /admin/login     - Request admin PIN');
      console.log('  POST /admin/verify    - Verify admin PIN\n');
      console.log('📊 Merchant Management (Admin):');
      console.log('  GET  /merchants       - List all merchants');
      console.log('  POST /merchants/:id/suspend   - Suspend merchant');
      console.log('  POST /merchants/:id/unsuspend - Unsuspend merchant');
      console.log('  DELETE /merchants/:id - Delete merchant\n');
      console.log('💰 Payment Requests:');
      console.log('  POST /payments/requests         - Create payment');
      console.log('  GET  /payments/requests         - List payments');
      console.log('  GET  /payments/requests/:linkId - View payment\n');
      console.log('🔗 Public:');
      console.log('  POST /public/create-payment     - Create unsolicited payment');
      console.log('  GET  /public/payment/:linkId    - Get payment details\n');
      console.log(`${'='.repeat(60)}\n`);
    });
  } catch (error) {
    logger.error('Failed to start server', { error });
    process.exit(1);
  }
}

// Start the server
start();

// Import for health check
import { prisma } from './infrastructure/database/client';
import { redisClient } from './infrastructure/cache/redis';

export default app;
