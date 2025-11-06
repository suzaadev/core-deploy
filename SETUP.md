# SUZAA Core - Production Setup Guide

This guide walks you through setting up the SUZAA Core payment gateway from scratch on a Debian/Ubuntu VPS.

## Table of Contents
1. [Prerequisites](#prerequisites)
2. [System Setup](#system-setup)
3. [Database Setup](#database-setup)
4. [Application Setup](#application-setup)
5. [Configuration](#configuration)
6. [Running the Application](#running-the-application)
7. [Verification](#verification)

---

## Prerequisites

### Required Software
- Debian 12+ or Ubuntu 22.04+
- Node.js v20.x LTS
- PostgreSQL 17
- Redis 7+
- pnpm package manager

### System Requirements
- 2+ CPU cores
- 4GB+ RAM
- 10GB+ disk space
- Root or sudo access

---

## System Setup

### 1. Update System Packages
```bash
sudo apt update
sudo apt upgrade -y
```

### 2. Install PostgreSQL 17
```bash
sudo apt install postgresql postgresql-contrib -y
```

Verify installation:
```bash
sudo systemctl status postgresql
```

You should see `active (running)`.

### 3. Install Redis
```bash
sudo apt install redis-server -y
```

Verify installation:
```bash
sudo systemctl status redis-server
```

You should see `active (running)`.

### 4. Install Node.js v20 (if not installed)
```bash
# Install Node.js via NodeSource repository
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```

Verify:
```bash
node --version  # Should show v20.x.x
npm --version   # Should show v10.x.x
```

### 5. Install pnpm
```bash
sudo npm install -g pnpm
```

Verify:
```bash
pnpm --version  # Should show v10.x.x
```

---

## Database Setup

### 1. Create PostgreSQL User and Database

Switch to postgres user:
```bash
sudo -u postgres psql
```

Inside PostgreSQL console, run:
```sql
-- Create user with strong password
CREATE USER suzaa_core WITH PASSWORD 'YOUR_STRONG_PASSWORD_HERE';

-- Create database
CREATE DATABASE suzaa_core_db OWNER suzaa_core;

-- Grant privileges
GRANT ALL PRIVILEGES ON DATABASE suzaa_core_db TO suzaa_core;

-- Connect to database
\c suzaa_core_db

-- Create schemas
CREATE SCHEMA IF NOT EXISTS core;
CREATE SCHEMA IF NOT EXISTS payments;
CREATE SCHEMA IF NOT EXISTS events;
CREATE SCHEMA IF NOT EXISTS audit;
CREATE SCHEMA IF NOT EXISTS ops;

-- Grant schema permissions
GRANT ALL ON SCHEMA core, payments, events, audit, ops TO suzaa_core;

-- Exit
\q
```

### 2. Verify Database Creation
```bash
sudo -u postgres psql -d suzaa_core_db -c "\dn"
```

You should see all 5 schemas listed.

---

## Application Setup

### 1. Create Project Directory
```bash
cd ~
mkdir suzaa-core
cd suzaa-core
```

### 2. Initialize Project
```bash
pnpm init
```

### 3. Install Dependencies
```bash
# Production dependencies
pnpm add express cors helmet dotenv bcrypt jsonwebtoken express-rate-limit ioredis

# Development dependencies
pnpm add -D typescript @types/node @types/express @types/cors @types/bcrypt @types/jsonwebtoken tsx prisma
```

### 4. Initialize TypeScript
```bash
npx tsc --init
```

### 5. Initialize Prisma
```bash
npx prisma init
```

---

## Configuration

### 1. Create Environment Variables

Create `.env` file in project root:
```bash
cat > .env << 'ENVEOF'
# Database
DATABASE_URL="postgresql://suzaa_core:YOUR_PASSWORD@localhost:5432/suzaa_core_db?schema=core"

# Redis
REDIS_URL="redis://localhost:6379"

# Server
PORT=3000
NODE_ENV=production

# Security (GENERATE REAL SECRETS FOR PRODUCTION)
JWT_SECRET="CHANGE_ME_$(openssl rand -hex 32)"
API_KEY_SALT="CHANGE_ME_$(openssl rand -hex 32)"
PLUGIN_HMAC_SECRET="CHANGE_ME_$(openssl rand -hex 32)"
ENVEOF
```

**⚠️ CRITICAL:** Replace:
- `YOUR_PASSWORD` with your actual PostgreSQL password
- The placeholder secrets with real generated secrets

### 2. Generate Production Secrets
```bash
echo "JWT_SECRET=\"$(openssl rand -hex 32)\""
echo "API_KEY_SALT=\"$(openssl rand -hex 32)\""
echo "PLUGIN_HMAC_SECRET=\"$(openssl rand -hex 32)\""
```

Copy these values into your `.env` file.

### 3. Create Project Structure
```bash
mkdir -p src/{config,api/{routes,middleware,controllers},application,domain/{models,policies},infrastructure/{database,cache,plugins,outbox},workers}
```

### 4. Copy Project Files

Copy all source files from this repository into the `src/` directory:
- `src/config/index.ts`
- `src/infrastructure/database/client.ts`
- `src/infrastructure/cache/redis.ts`
- `src/server.ts`

### 5. Copy Prisma Schema

Copy `prisma/schema.prisma` to your `prisma/` directory.

---

## Database Migration

### 1. Generate Prisma Client
```bash
DATABASE_URL="postgresql://suzaa_core:YOUR_PASSWORD@localhost:5432/suzaa_core_db?schema=core" npx prisma generate
```

### 2. Create Database Tables
```bash
DATABASE_URL="postgresql://suzaa_core:YOUR_PASSWORD@localhost:5432/suzaa_core_db?schema=core" npx prisma db push
```

### 3. Verify Tables Created
```bash
sudo -u postgres psql -d suzaa_core_db -c "\dt core.*"
sudo -u postgres psql -d suzaa_core_db -c "\dt payments.*"
sudo -u postgres psql -d suzaa_core_db -c "\dt events.*"
sudo -u postgres psql -d suzaa_core_db -c "\dt audit.*"
sudo -u postgres psql -d suzaa_core_db -c "\dt ops.*"
```

You should see all tables listed.

---

## Running the Application

### Development Mode
```bash
pnpm run dev
```

You should see:
```
✅ Database connected
✅ Redis connected
🚀 SUZAA Core running on port 3000
   Environment: production
```

### Production Mode

1. Build the application:
```bash
pnpm run build
```

2. Start the server:
```bash
pnpm start
```

### Using PM2 (Recommended for Production)
```bash
# Install PM2
sudo npm install -g pm2

# Start application
pm2 start dist/server.js --name suzaa-core

# Save PM2 configuration
pm2 save

# Setup auto-restart on reboot
pm2 startup
```

---

## Verification

### 1. Health Check
```bash
curl http://localhost:3000/health
```

Expected response:
```json
{"status":"ok","service":"suzaa-core"}
```

### 2. Service Status
```bash
curl http://localhost:3000/
```

Expected response:
```json
{
  "service": "SUZAA Core Payment Gateway",
  "version": "1.0.0",
  "status": "running"
}
```

### 3. Database Connection

Check logs for:
- ✅ Database connected
- ✅ Redis connected

---

## Database Schema Overview

### Schemas
- **core**: Merchant management, plugin registry
- **payments**: Payment requests and intents
- **events**: Outbox pattern, webhooks
- **audit**: Audit logs
- **ops**: Operational locks

### Key Tables

#### core.merchants
Stores merchant accounts with business policies.

#### core.plugin_registry
Registers blockchain plugins (Solana, etc.) with secure secret storage.

#### payments.payment_requests
Business-level payment requests (what customer owes).

#### payments.payment_intents
Technical payment intents (how payment will be made).

#### events.outbox
Reliable event delivery using outbox pattern.

#### events.webhooks
Merchant webhook configurations.

#### events.webhook_deliveries
Tracks webhook delivery attempts for debugging.

#### audit.audit_logs
Comprehensive audit trail for compliance.

---

## Security Checklist

- [ ] Changed all default passwords
- [ ] Generated unique secrets for JWT, API keys, HMAC
- [ ] Configured firewall (only allow ports 22, 80, 443, 3000)
- [ ] Enabled PostgreSQL authentication
- [ ] Set up SSL/TLS certificates
- [ ] Configured Redis password
- [ ] Set up backup strategy
- [ ] Enabled audit logging
- [ ] Configured rate limiting
- [ ] Set up monitoring

---

## Troubleshooting

### Issue: Cannot connect to PostgreSQL

**Solution:**
```bash
# Check PostgreSQL status
sudo systemctl status postgresql

# Restart if needed
sudo systemctl restart postgresql

# Check PostgreSQL logs
sudo tail -f /var/log/postgresql/postgresql-17-main.log
```

### Issue: Cannot connect to Redis

**Solution:**
```bash
# Check Redis status
sudo systemctl status redis-server

# Restart if needed
sudo systemctl restart redis-server

# Test connection
redis-cli ping  # Should return PONG
```

### Issue: Permission denied errors

**Solution:**
```bash
# Ensure correct ownership
sudo chown -R suzaa:suzaa ~/suzaa-core

# Check database permissions
sudo -u postgres psql -d suzaa_core_db -c "\du"
```

### Issue: Port 3000 already in use

**Solution:**
```bash
# Find process using port 3000
sudo lsof -i :3000

# Kill the process
sudo kill -9 <PID>

# Or change port in .env
PORT=3001
```

---

## Maintenance

### Backup Database
```bash
# Create backup
sudo -u postgres pg_dump suzaa_core_db > backup_$(date +%Y%m%d).sql

# Restore from backup
sudo -u postgres psql suzaa_core_db < backup_20251106.sql
```

### View Logs
```bash
# Application logs (if using PM2)
pm2 logs suzaa-core

# PostgreSQL logs
sudo tail -f /var/log/postgresql/postgresql-17-main.log

# Redis logs
sudo tail -f /var/log/redis/redis-server.log
```

### Update Application
```bash
cd ~/suzaa-core
git pull
pnpm install
pnpm run build
pm2 restart suzaa-core
```

---

## Next Steps

After completing setup:

1. **Create first merchant account** (implement registration API)
2. **Set up Solana plugin** (suzaa-solana-plugin)
3. **Configure webhooks** (for merchant notifications)
4. **Set up monitoring** (Prometheus, Grafana)
5. **Configure SSL/TLS** (Let's Encrypt)
6. **Set up CI/CD** (GitHub Actions)

---

## Support

For issues or questions:
- Check logs first
- Review troubleshooting section
- Verify all services are running
- Check database connections

---

## Architecture Notes

### Core + Plugin Model

SUZAA Core follows a strict separation:
- **Core** = Business ledger (what was paid, to whom, how much)
- **Plugins** = Chain experts (how to find transactions, confirmations)

### No Direct Database Access

- Core NEVER accesses Plugin databases
- Plugins NEVER access Core databases
- All communication via HTTP APIs

### Evidence-Based Settlement

1. Plugin monitors blockchain
2. Plugin finds matching transaction
3. Plugin POSTs evidence to Core
4. Core applies business rules
5. Core makes final settlement decision

---

**Setup completed!** 🎉

You now have a production-ready SUZAA Core payment gateway running.
