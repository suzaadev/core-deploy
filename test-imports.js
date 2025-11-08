async function test() {
  try {
    console.log('1. Testing environment variables...');
    console.log('DATABASE_URL:', process.env.DATABASE_URL ? 'SET' : 'NOT SET');
    console.log('PORT:', process.env.PORT);
    
    console.log('\n2. Testing logger import...');
    const { logger } = require('./dist/common/logger');
    console.log('Logger loaded:', typeof logger);
    
    console.log('\n3. Testing config import...');
    const { config } = require('./dist/config');
    console.log('Config loaded:', typeof config);
    console.log('Config port:', config.port);
    
    console.log('\n4. All imports successful!');
  } catch (error) {
    console.error('ERROR:', error.message);
    console.error('Stack:', error.stack);
  }
}

test();
