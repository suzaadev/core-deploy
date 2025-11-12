module.exports = {
  apps: [{
    name: 'suzaa-backend',
    script: 'dist/server.js',
    cwd: '/home/suzaa/suzaa-deployment/core',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production',
      PORT: '3060'
    },
    env_file: '.env'
  }]
};
