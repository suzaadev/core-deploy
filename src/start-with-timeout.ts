import { connectDatabase } from './infrastructure/database/client';
import { connectRedis } from './infrastructure/cache/redis';

async function startWithTimeout() {
  console.log('=== Starting with 10 second timeout ===');
  
  // Database connection with timeout
  console.log('Attempting database connection...');
  const dbPromise = connectDatabase();
  const dbTimeout = new Promise((_, reject) => 
    setTimeout(() => reject(new Error('Database connection timeout')), 10000)
  );
  
  try {
    await Promise.race([dbPromise, dbTimeout]);
    console.log('✅ Database connected!');
  } catch (error: any) {
    console.error('❌ Database connection failed:', error.message);
    process.exit(1);
  }
  
  // Redis connection with timeout
  console.log('Attempting Redis connection...');
  const redisPromise = connectRedis();
  const redisTimeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Redis connection timeout')), 10000)
  );
  
  try {
    await Promise.race([redisPromise, redisTimeout]);
    console.log('✅ Redis connected!');
  } catch (error: any) {
    console.error('❌ Redis connection failed:', error.message);
    process.exit(1);
  }
  
  console.log('=== All connections successful ===');
}

startWithTimeout();
