# SUZAA Microservices Architecture

Documentation for services that extend SUZAA Core functionality.

---

## 🏗️ Architecture Overview
```
┌─────────────────────────────────────────────────────────┐
│                    SUZAA CORE                            │
│              (Open Source - Complete Product)            │
│                                                          │
│  • Authentication & merchant management                  │
│  • Payment request creation & order management           │
│  • Customer payment pages                                │
│  • Merchant & super admin dashboards                     │
│  • Event storage (outbox pattern)                        │
│  • Webhook URL registration                              │
│                                                          │
│  ✅ Deploy Core = Fully functional payment gateway       │
└────────────────────┬────────────────────────────────────┘
                     │
         ┌───────────┼───────────┬───────────┐
         │           │           │           │
    ┌────▼────┐ ┌───▼────┐ ┌───▼────┐ ┌───▼────┐
    │ Webhook │ │Analytics│ │Shopify │ │ Solana │
    │ Service │ │ Service │ │Integr. │ │ Plugin │
    └─────────┘ └─────────┘ └────────┘ └────────┘
    Proprietary  Proprietary Proprietary Proprietary
```

---

## 📋 Core Services vs Optional Services

### Core (Open Source - Required)

**What's included:**
- Merchant authentication
- Payment link creation
- Customer payment pages
- Order management UI
- Manual settlement
- Event storage (outbox)
- Webhook URL registration

**Can function without:**
- ❌ No automatic webhook delivery (manual check in dashboard)
- ❌ No automatic analytics (manual CSV export)
- ❌ No Shopify/WooCommerce sync (manual order creation)
- ❌ No blockchain auto-settlement (manual confirmation)

### Optional Services (Proprietary)

Add capabilities:
- ✅ Automatic webhook delivery
- ✅ Real-time analytics
- ✅ E-commerce integrations
- ✅ Blockchain monitoring

---

## 🔌 Service: Webhook Delivery

### Purpose
Automatically deliver webhooks to merchant endpoints when payment events occur.

### Why Separate Service?
- Core focuses on business logic
- Webhook delivery is infrastructure concern
- Independent scaling (high volume merchants)
- Retry logic without blocking core
- Separate failure domain

### Architecture
```
┌─────────────────────────────────────────────────────┐
│              suzaa-webhook-service                   │
│                  (Port 3001)                         │
├─────────────────────────────────────────────────────┤
│                                                      │
│  Worker Process:                                     │
│  1. Poll core.outbox table (new events)             │
│  2. Read core.webhooks (merchant URLs)               │
│  3. Deliver HTTP POST to merchant                    │
│  4. Record delivery in webhook_service_db            │
│  5. Retry on failure (exponential backoff)           │
│                                                      │
└─────────────────────────────────────────────────────┘
         ↓ Reads                     ↓ Writes
┌──────────────────┐       ┌──────────────────────┐
│   Core DB        │       │  Webhook Service DB  │
│  • outbox        │       │  • deliveries        │
│  • webhooks      │       │  • retry_queue       │
└──────────────────┘       └──────────────────────┘
```

### Database Schema (webhook_service_db)
```prisma
model WebhookDelivery {
  id           String    @id @default(uuid())
  webhookId    String    // From core.webhooks
  outboxId     String    // From core.outbox
  attempt      Int
  statusCode   Int?
  responseBody String?
  error        String?
  deliveredAt  DateTime?
  createdAt    DateTime  @default(now())
}

model RetryQueue {
  id              String    @id @default(uuid())
  deliveryId      String
  nextRetryAt     DateTime
  retryCount      Int
  maxRetries      Int       @default(5)
  backoffStrategy String    @default("exponential")
  createdAt       DateTime  @default(now())
}
```

### Deployment
```bash
# Same VPS as core
cd ~/suzaa-webhook-service
pm2 start dist/worker.js --name webhook-worker

# Environment
DATABASE_URL="postgresql://user:pass@localhost:5432/webhook_service_db"
CORE_DATABASE_URL="postgresql://user:pass@localhost:5432/suzaa_core_db"
POLL_INTERVAL_MS=1000
MAX_RETRIES=5
```

---

## 📊 Service: Analytics

### Purpose
Generate reports, charts, and metrics from payment data.

### Architecture
```
┌─────────────────────────────────────────────────────┐
│              suzaa-analytics-service                 │
│                  (Port 3002)                         │
├─────────────────────────────────────────────────────┤
│                                                      │
│  API Endpoints:                                      │
│  • GET /merchants/:id/stats                          │
│  • GET /merchants/:id/revenue-chart                  │
│  • GET /merchants/:id/top-products                   │
│                                                      │
│  Worker Process:                                     │
│  • Read core.payment_requests                        │
│  • Aggregate into analytics_db                       │
│  • Pre-compute common queries                        │
│                                                      │
└─────────────────────────────────────────────────────┘
```

### Database Schema (analytics_service_db)
```prisma
model DailyStats {
  id              String   @id @default(uuid())
  merchantId      String
  date            String   // YYYY-MM-DD
  totalOrders     Int
  successfulOrders Int
  totalRevenue    Decimal
  avgOrderValue   Decimal
  createdAt       DateTime @default(now())
  
  @@unique([merchantId, date])
}
```

---

## 🛒 Service: Shopify Integration

### Purpose
Sync Shopify orders to SUZAA Core payment requests.

### Architecture
```
┌─────────────────────────────────────────────────────┐
│           suzaa-shopify-integration                  │
│                  (Port 3003)                         │
├─────────────────────────────────────────────────────┤
│                                                      │
│  Webhook Handler:                                    │
│  • Receive Shopify webhook (order created)           │
│  • Transform to SUZAA format                         │
│  • POST to Core API /payments/requests               │
│                                                      │
│  Sync Worker:                                        │
│  • Poll Shopify API for new orders                   │
│  • Match with existing payment requests              │
│  • Update statuses                                   │
│                                                      │
└─────────────────────────────────────────────────────┘
```

---

## ⛓️ Service: Blockchain Plugins

### Purpose
Monitor blockchains, detect payments, report to core.

### Example: Solana Plugin
```
┌─────────────────────────────────────────────────────┐
│              suzaa-solana-plugin                     │
│                  (Port 4000)                         │
├─────────────────────────────────────────────────────┤
│                                                      │
│  API (Core → Plugin):                                │
│  • GET /v1/capabilities                              │
│  • GET /v1/merchants/:id/wallets                     │
│  • POST /v1/intents/:id/allocate                     │
│  • GET /v1/intents/:id/status                        │
│                                                      │
│  Worker (Plugin → Core):                             │
│  • Scan Solana blockchain                            │
│  • Match transactions to intents                     │
│  • POST to Core /internal/decisions/settlement       │
│                                                      │
└─────────────────────────────────────────────────────┘
```

### Database Schema (solana_plugin_db)
```prisma
model Wallet {
  id            String   @id @default(uuid())
  merchantId    String
  address       String   @unique
  coin          String   // "SOL", "USDC_SOL"
  privateKeyEnc String   // Encrypted
  createdAt     DateTime @default(now())
}

model Allocation {
  id            String   @id @default(uuid())
  intentId      String   @unique // From core
  walletId      String
  memo          String?
  expectedAmount Decimal
  expiresAt     DateTime
  createdAt     DateTime @default(now())
}

model DetectedTransaction {
  id            String   @id @default(uuid())
  allocationId  String
  txSignature   String   @unique
  amount        Decimal
  confirmations Int
  reportedToCore Boolean @default(false)
  createdAt     DateTime @default(now())
}
```

---

## 🚀 Deployment Guide

### Single VPS (Development/Small Scale)
```bash
# All services on same VPS
cd ~/
├── suzaa-core/                 (pm2: suzaa-core)
├── suzaa-webhook-service/      (pm2: webhook-worker)
├── suzaa-analytics-service/    (pm2: analytics-api)
├── suzaa-shopify-integration/  (pm2: shopify-sync)
└── suzaa-solana-plugin/        (pm2: solana-plugin)

# Start all
pm2 start ecosystem.config.js

# Monitor
pm2 status
pm2 logs
```

### Multi-VPS (Production/High Scale)
```bash
VPS-1 (Core)
├── suzaa-core (Port 3000)
└── PostgreSQL (core_db)

VPS-2 (Webhooks & Analytics)
├── suzaa-webhook-service (Port 3001)
├── suzaa-analytics-service (Port 3002)
└── PostgreSQL (webhook_db, analytics_db)

VPS-3 (Integrations)
├── suzaa-shopify-integration (Port 3003)
├── suzaa-woocommerce-integration (Port 3004)
└── PostgreSQL (integrations_db)

VPS-4+ (Blockchain Plugins)
├── suzaa-solana-plugin (Port 4000)
├── suzaa-bitcoin-plugin (Port 4001)
└── PostgreSQL (plugin_dbs)
```

---

## 📝 Implementation Roadmap

### Phase 1: Core Only (Current)
✅ Core is fully functional standalone
✅ Manual operations via dashboard
✅ CSV export for analytics
✅ No automatic webhooks

### Phase 2: Webhook Service (Next)
- [ ] Build webhook worker
- [ ] Implement retry logic
- [ ] Add delivery tracking
- [ ] Test with test merchants

### Phase 3: First Blockchain Plugin
- [ ] Solana plugin (proprietary)
- [ ] Wallet management
- [ ] Transaction monitoring
- [ ] Settlement reporting

### Phase 4: Analytics Service
- [ ] Build analytics worker
- [ ] Create aggregation jobs
- [ ] Build API endpoints
- [ ] Create charts/graphs

### Phase 5: E-commerce Integrations
- [ ] Shopify integration
- [ ] WooCommerce integration
- [ ] API documentation

---

## 🔒 Security Notes

### Service-to-Service Authentication

**Core → Services:**
- API keys in service config
- JWT tokens for authenticated endpoints

**Services → Core:**
- HMAC signatures (verify sender)
- Idempotency keys (prevent duplicates)
- IP allowlist (network security)

### Database Access

**Each service:**
- ✅ Has its own database
- ✅ Owns its schema
- ❌ Never directly queries other service DBs
- ✅ Communicates via HTTP APIs

---

## 📚 Resources

- [Core Documentation](../README.md)
- [Plugin Contract](./PLUGIN_CONTRACT.md) - Coming soon
- [Webhook Specification](./WEBHOOKS.md) - Coming soon

---

**Last Updated:** November 7, 2025  
**Status:** Documentation only - Services not yet implemented
