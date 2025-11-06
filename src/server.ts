import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config } from './config';
import { connectDatabase, disconnectDatabase } from './infrastructure/database/client';
import { connectRedis, disconnectRedis } from './infrastructure/cache/redis';
import authRoutes from './api/routes/auth';
import adminRoutes from './api/routes/admin';
import merchantRoutes from './api/routes/merchants';

const app = express();

// Security middleware
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'suzaa-core' });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({ 
    service: 'SUZAA Core Payment Gateway',
    version: '1.0.0',
    status: 'running' 
  });
});

// Routes
app.use('/auth', authRoutes);
app.use('/admin', adminRoutes);
app.use('/merchants', merchantRoutes);

// Error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    error: config.nodeEnv === 'production' ? 'Internal server error' : err.message,
  });
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully...');
  await disconnectDatabase();
  await disconnectRedis();
  process.exit(0);
});

// Start server
async function start() {
  await connectDatabase();
  await connectRedis();
  
  app.listen(config.port, () => {
    console.log(`🚀 SUZAA Core running on port ${config.port}`);
    console.log(`   Environment: ${config.nodeEnv}`);
    console.log(`\n   🔐 Merchant Auth:`);
    console.log(`   - POST /auth/register`);
    console.log(`   - POST /auth/login`);
    console.log(`   - POST /auth/verify`);
    console.log(`   - GET /auth/me (protected)`);
    console.log(`\n   👑 Super Admin:`);
    console.log(`   - POST /admin/register (one-time only)`);
    console.log(`   - POST /admin/login`);
    console.log(`   - POST /admin/verify`);
    console.log(`\n   📊 Merchant Management (admin only):`);
    console.log(`   - GET /merchants`);
    console.log(`   - GET /merchants/:id`);
    console.log(`   - POST /merchants/:id/suspend`);
    console.log(`   - POST /merchants/:id/unsuspend`);
    console.log(`   - DELETE /merchants/:id`);
  });
}

start().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
