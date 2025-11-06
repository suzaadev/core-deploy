import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config } from './config';
import { connectDatabase, disconnectDatabase } from './infrastructure/database/client';
import { connectRedis, disconnectRedis } from './infrastructure/cache/redis';

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

// Routes (will add later)
app.get('/', (req, res) => {
  res.json({ 
    service: 'SUZAA Core Payment Gateway',
    version: '1.0.0',
    status: 'running' 
  });
});

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
  });
}

start().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
