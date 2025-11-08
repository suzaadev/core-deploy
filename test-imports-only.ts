console.log('1. Starting import test...');

try {
  console.log('2. Importing config...');
  const { config } = require('./src/config');
  console.log('3. Config imported, port:', config.port);
  
  console.log('4. Importing database client...');
  const { prisma, connectDatabase } = require('./src/infrastructure/database/client');
  console.log('5. Database client imported');
  
  console.log('6. Importing Redis client...');
  const { redisClient, connectRedis } = require('./src/infrastructure/cache/redis');
  console.log('7. Redis client imported');
  
  console.log('8. Importing routes...');
  const authRoutes = require('./src/api/routes/auth');
  console.log('9. Auth routes imported');
  
  console.log('10. All imports successful!');
  process.exit(0);
} catch (error: any) {
  console.error('ERROR during import:', error.message);
  console.error('Stack:', error.stack);
  process.exit(1);
}
