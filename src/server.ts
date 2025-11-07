import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config } from './config';
import { connectDatabase, disconnectDatabase } from './infrastructure/database/client';
import { connectRedis, disconnectRedis } from './infrastructure/cache/redis';
import authRoutes from './api/routes/auth';
import adminRoutes from './api/routes/admin';
import merchantRoutes from './api/routes/merchants';
import paymentRoutes from './api/routes/payments';
import walletRoutes from './api/routes/wallets';
import priceRoutes from './api/routes/prices';
import publicRoutes from './api/routes/public';

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'suzaa-core' });
});

app.get('/', (req, res) => {
  res.json({ 
    service: 'SUZAA Core Payment Gateway',
    version: '1.0.0',
    status: 'running' 
  });
});

app.use('/auth', authRoutes);
app.use('/admin', adminRoutes);
app.use('/merchants', merchantRoutes);
app.use('/payments', paymentRoutes);
app.use('/wallets', walletRoutes);
app.use('/prices', priceRoutes);
app.use('/public', publicRoutes);

app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    error: config.nodeEnv === 'production' ? 'Internal server error' : err.message,
  });
});

process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully...');
  await disconnectDatabase();
  await disconnectRedis();
  process.exit(0);
});

async function start() {
  await connectDatabase();
  await connectRedis();
  
  app.listen(config.port, () => {
    console.log(`🚀 SUZAA Core running on port ${config.port}`);
    console.log(`   Environment: ${config.nodeEnv}`);
    console.log(`   Base URL: ${config.baseUrl}`);
    console.log(`\n   🔐 Merchant Auth:`);
    console.log(`   - POST /auth/register`);
    console.log(`   - POST /auth/login`);
    console.log(`   - POST /auth/verify`);
    console.log(`   - GET /auth/me`);
    console.log(`\n   👑 Super Admin:`);
    console.log(`   - POST /admin/register`);
    console.log(`   - POST /admin/login`);
    console.log(`   - POST /admin/verify`);
    console.log(`\n   📊 Merchant Management:`);
    console.log(`   - GET /merchants`);
    console.log(`   - POST /merchants/:id/suspend`);
    console.log(`   - POST /merchants/:id/unsuspend`);
    console.log(`   - DELETE /merchants/:id`);
    console.log(`\n   💰 Payment Requests:`);
    console.log(`   - POST /payments/requests (create)`);
    console.log(`   - GET /payments/requests (list)`);
    console.log(`   - GET /payments/requests/:linkId (view)`);
  });
}

start().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
