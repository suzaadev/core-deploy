# SUZAA Core 🚀

**Open-source cryptocurrency payment gateway with colocated microservices architecture.**

> **Architecture:** Colocated microservices with HTTP boundaries. Core and plugins run as independent processes on the same VPS, communicating via REST APIs. Horizontally scalable to multi-host deployment without code changes.

> **Current Status:** Phase 1 Complete - Core business logic and authentication system fully implemented. Building customer UX and CASH payment flow before plugin integration.

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen.svg)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/typescript-5.x-blue.svg)](https://www.typescriptlang.org)
[![PostgreSQL](https://img.shields.io/badge/postgresql-17-336791.svg)](https://www.postgresql.org)
[![Redis](https://img.shields.io/badge/redis-7.x-red.svg)](https://redis.io)

---

## 🏗️ Architecture: Colocated Microservices

### What This Means

SUZAA follows true microservices principles while maintaining deployment simplicity:

**Microservices Benefits:**
- ✅ Independent processes with separate databases
- ✅ HTTP-only communication (no shared code/memory)
- ✅ Technology-agnostic (plugins can use any language)
- ✅ Independent scaling and deployment
- ✅ Fault isolation (plugin crash ≠ core crash)

**Deployment Simplicity:**
- ✅ Single VPS deployment (cost-effective)
- ✅ Shared infrastructure (PostgreSQL, Redis)
- ✅ Easy management (one server to monitor)
- ✅ Simple CI/CD pipeline

**Evolution Path:**
- ✅ Scale vertically first (upgrade VPS)
- ✅ Scale horizontally later (separate VPS per service)
- ✅ No code changes required to scale
- ✅ No architectural rewrites needed

### Production Deployment (Single VPS)
```
VPS: localhost
├── suzaa-core (Port 3000)
│   ├── Process: pm2 start suzaa-core
│   ├── Database: suzaa_core_db
│   └── Purpose: Business logic, auth, UX
│
├── suzaa-solana-plugin (Port 4000)
│   ├── Process: pm2 start solana-plugin
│   ├── Database: solana_plugin_db
│   └── Purpose: Blockchain monitoring
│
├── PostgreSQL 17
│   ├── suzaa_core_db (5 schemas)
│   └── solana_plugin_db
│
├── Redis 7
│   └── Shared by both services
│
└── Nginx
    ├── suzaa.com → localhost:3000
    └── Core → localhost:4000 (internal)
```

### Service Communication
```
┌─────────────────────────────────────────────────┐
│                  Same VPS                        │
├─────────────────────────────────────────────────┤
│                                                  │
│  ┌──────────────┐         ┌─────────────────┐  │
│  │  SUZAA Core  │  HTTP   │ Solana Plugin   │  │
│  │  (Port 3000) │ ◄─────► │  (Port 4000)    │  │
│  └──────┬───────┘         └────────┬────────┘  │
│         │                          │            │
│  ┌──────▼───────┐         ┌────────▼────────┐  │
│  │ suzaa_core_db│         │solana_plugin_db │  │
│  └──────────────┘         └─────────────────┘  │
│                                                  │
│  ┌──────────────────────────────────────────┐  │
│  │  Redis (Shared - Rate limiting, caching)│  │
│  └──────────────────────────────────────────┘  │
└─────────────────────────────────────────────────┘

Communication Rules:
- HTTP REST APIs only (no shared code)
- HMAC-signed requests (security)
- Idempotent operations (reliability)
- Versioned contracts (/v1/...)
```

### When to Scale to Multi-Host

**Stay single-host until:**
- CPU utilization > 80% sustained
- Memory pressure affecting both services
- Network I/O bottleneck
- Geographic distribution needed
- High availability requirements (multi-region)

**Migration path:**
```bash
# Day 1: Single VPS
suzaa.com (VPS-1)
├── core:3000
└── plugin:4000

# Day 100: Scale plugin to separate VPS (no code changes)
suzaa.com (VPS-1)
└── core:3000 → calls plugin.suzaa.com

plugin.suzaa.com (VPS-2)
└── plugin:4000

# Day 200: Multi-region
us-east.suzaa.com (VPS-1) ├── core:3000
eu-west.suzaa.com (VPS-2) ├── core:3000

plugins.suzaa.com (VPS-3) └── all plugins
```

---

## 📁 Project Structure
```
/home/suzaa/
├── suzaa-core/                    # This repository (Open Source)
│   ├── prisma/
│   │   └── schema.prisma          # Core database schema
│   ├── src/
│   │   ├── api/
│   │   │   ├── middleware/
│   │   │   │   ├── auth.ts        # Merchant JWT auth
│   │   │   │   └── adminAuth.ts   # Super admin auth
│   │   │   └── routes/
│   │   │       ├── auth.ts        # Auth endpoints
│   │   │       ├── admin.ts       # Admin endpoints
│   │   │       ├── merchants.ts   # Merchant management
│   │   │       └── payments.ts    # Payment requests
│   │   ├── application/
│   │   │   ├── auth/              # Auth use cases
│   │   │   ├── admin/             # Admin use cases
│   │   │   └── payments/          # Payment use cases
│   │   ├── domain/
│   │   │   └── utils/             # Business utilities
│   │   ├── infrastructure/
│   │   │   ├── database/          # Prisma client
│   │   │   └── cache/             # Redis client
│   │   ├── config/
│   │   └── server.ts
│   ├── package.json
│   └── tsconfig.json
│
└── suzaa-solana-plugin/           # Future: Separate repo (Proprietary)
    ├── prisma/
    │   └── schema.prisma          # Plugin database schema
    ├── src/
    │   ├── api/
    │   │   └── routes/            # Plugin API endpoints
    │   ├── services/
    │   │   ├── WalletManager.ts
    │   │   ├── BlockchainScanner.ts
    │   │   └── TransactionMatcher.ts
    │   └── workers/
    │       ├── ScannerWorker.ts
    │       └── OutboxWorker.ts
    └── package.json
```

### Database Layout
```
PostgreSQL (localhost:5432)
├── suzaa_core_db
│   ├── Schema: core
│   │   ├── merchants
│   │   ├── super_admins
│   │   └── plugin_registry
│   ├── Schema: payments
│   │   ├── payment_requests
│   │   └── payment_intents
│   ├── Schema: events
│   │   ├── outbox
│   │   ├── webhooks
│   │   └── webhook_deliveries
│   ├── Schema: audit
│   │   └── audit_logs
│   └── Schema: ops
│       └── advisory_locks
│
└── solana_plugin_db (future)
    ├── wallets
    ├── allocations
    ├── detected_txs
    └── plugin_outbox

Redis (localhost:6379)
├── Database 0: Core (rate limiting, caching)
└── Database 1: Plugin (temporary data)
```

---

## ✨ Current Features

### ✅ Phase 1: Core Foundation (COMPLETE)

#### Authentication System
- **Passwordless authentication** - PIN-based (10-minute expiry, max 5 attempts)
- **Auto-generated merchant slugs** - 6 lowercase letters (e.g., `jumasm`)
- **JWT tokens** - 7-day expiry, stateless authentication
- **Super admin system** - One-time registration, email permanently locked
- **Role-based access control** - Merchant vs admin permissions

#### Payment Request System
- **Sequential order numbers** - Format: `jumasm/20251106/0001`
- **Timezone-aware** - Daily reset at merchant's local midnight (not UTC)
- **Configurable expiry** - 15, 30, 60, or 120 minutes
- **Dual creation modes**:
  - Merchant-created: Authenticated API, full control
  - Buyer-initiated: Public portal, rate-limited (1/hour default)
- **Rate limiting** - Redis-based, configurable per merchant
- **Automatic expiry** - Status updates when payment expires

#### Infrastructure
- **PostgreSQL 17** - 5 schemas, 11 tables, production-ready
- **Redis caching** - Plugin response caching, rate limiting
- **Audit logging** - Complete trail of all actions
- **Health monitoring** - `/health` endpoint
- **Graceful shutdown** - Clean connection cleanup

### 🚧 Phase 1.5: CASH Payment Flow (IN PROGRESS)

#### Customer Experience
- [ ] Payment lookup page (enter order number)
- [ ] Payment details page (merchant info, amount, timer)
- [ ] CASH payment instructions
- [ ] "I Have Paid" button
- [ ] Status polling (real-time updates)

#### Merchant Dashboard
- [ ] Order list with filters (status, date)
- [ ] Order details view
- [ ] Mark as paid action
- [ ] Settings page (timezone, limits)
- [ ] Export to CSV

#### Settlement Logic
- [ ] Amount tolerance checking (configurable %)
- [ ] Status lifecycle management
- [ ] Webhook dispatch
- [ ] Receipt generation

**Goal:** Fully functional payment gateway WITHOUT blockchain plugins.

### 📋 Phase 2: Plugin Integration (PLANNED)

#### HTTP Contract
- [ ] OpenAPI specification (complete contract)
- [ ] Versioned endpoints (`/v1/...`)
- [ ] HMAC signature verification
- [ ] Idempotency keys
- [ ] Error code standardization

#### Plugin SDK
- [ ] `@suzaa/plugin-sdk` package
- [ ] HMAC signing utilities
- [ ] Health check helpers
- [ ] TypeScript types
- [ ] Testing utilities

#### Reference Implementation
- [ ] Mock plugin (testing/development)
- [ ] Example responses
- [ ] Integration tests

#### Production Plugin
- [ ] Solana plugin (separate repository, proprietary)
- [ ] Wallet management
- [ ] Blockchain scanning
- [ ] Transaction matching
- [ ] Confirmation tracking

---

## 💰 Payment Flows

### Current: CASH Payments (No Plugins)
```
1. MERCHANT CREATES ORDER
   POST /payments/requests
   → jumasm/20251106/0001
   → Status: PENDING

2. CUSTOMER VISITS LINK
   GET /payments/jumasm/20251106/0001
   → Shows: Amount, merchant, timer
   → Methods: [CASH]

3. CUSTOMER SELECTS CASH
   → Instructions: "Pay via transfer/cash"
   → Button: [I Have Paid]

4. CUSTOMER CLAIMS PAID
   POST /payments/:id/mark-paid
   → Status: PENDING_CONFIRMATION

5. MERCHANT CONFIRMS
   POST /payments/:id/confirm (auth)
   → Status: SETTLED
   → Webhook dispatched
```

### Future: Crypto Payments (With Plugins)
```
1-2. Same as CASH

3. CUSTOMER SELECTS CRYPTO
   Core → Plugin: POST /v1/intents/:id/allocate
   Plugin → Core: { address, memo, amount_crypto }
   → Shows: QR code, address, crypto amount

4. PLUGIN DETECTS PAYMENT
   Plugin monitors blockchain
   Plugin → Core: POST /internal/decisions/settlement
   { txId, amountReceived, confirmations }

5. AUTOMATIC SETTLEMENT
   Core: Applies business logic
   → Within tolerance? → SETTLED
   → Webhook dispatched (no merchant action)
```

---

## 🚀 Quick Start

### Prerequisites

- Node.js ≥ 20.0.0
- PostgreSQL ≥ 17
- Redis ≥ 7.0
- pnpm

### Installation
```bash
# Clone
git clone https://github.com/suzaaglobal/first.git
cd first

# Install
pnpm install

# Configure
cp .env.example .env
# Edit .env with your credentials

# Database
DATABASE_URL="postgresql://user:pass@localhost:5432/suzaa_core_db?schema=core" pnpm db:push

# Start
pnpm dev
```

### Production Deployment
```bash
# Build
pnpm build

# Start with PM2
pm2 start dist/server.js --name suzaa-core

# Monitor
pm2 status
pm2 logs suzaa-core
```

---

## 📄 License

**SUZAA Core:** MIT License (Open Source)  
**Blockchain Plugins:** Proprietary (Licensed Separately)

---

## 💬 Support

- **Issues:** GitHub Issues
- **Email:** dev@suzaa.com
- **Security:** security@suzaa.com

---

<div align="center">

**[Documentation](SETUP.md)** • **[API Reference](PAYMENT_REQUESTS.md)** • **[Contributing](#contributing)**

Made with ❤️ by [SUZAA Global](https://github.com/suzaaglobal)

**Architecture:** Colocated Microservices | **License:** MIT (Core), Proprietary (Plugins)

</div>
