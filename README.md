# SUZAA Core 🚀

**Open-source cryptocurrency payment gateway with a modular plugin architecture.**

> **Current Status:** Phase 1 Complete - Core business logic and authentication system fully implemented. Building customer UX and CASH payment flow before plugin integration.

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen.svg)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/typescript-5.x-blue.svg)](https://www.typescriptlang.org)
[![PostgreSQL](https://img.shields.io/badge/postgresql-17-336791.svg)](https://www.postgresql.org)
[![Redis](https://img.shields.io/badge/redis-7.x-red.svg)](https://redis.io)

---

## 📋 Table of Contents

- [Overview](#overview)
- [Project Structure](#project-structure)
- [Architecture](#architecture)
- [Current Features](#current-features)
- [Payment Flows](#payment-flows)
- [Business Logic](#business-logic)
- [Quick Start](#quick-start)
- [API Reference](#api-reference)
- [Roadmap](#roadmap)
- [Contributing](#contributing)

---

## 🎯 Overview

SUZAA Core is a **production-ready, open-source payment gateway** designed for cryptocurrency payments with a unique twist: it works standalone with CASH payments before any blockchain plugins are added.

### Core Philosophy

**Separation of Concerns:**
- **SUZAA Core** (this repository) = Business logic, UX, merchant management
- **Blockchain Plugins** (separate microservices) = Chain expertise, transaction monitoring
- **Cash Fallback** = Always works, even without plugins

### Why This Matters

Traditional payment gateways are monolithic and closed-source. SUZAA Core provides:

1. **Immediate Functionality** - Works with CASH before plugins (launch faster)
2. **True Modularity** - Plugins are separate services, not code modules
3. **Open Source Core** - Auditable, trustworthy business logic
4. **Proprietary Plugins** - Blockchain expertise is the revenue model
5. **Platform Thinking** - Anyone can write plugins, SDK provided

---

## 📁 Project Structure
```
suzaa-core/
├── prisma/
│   └── schema.prisma              # Database schema (11 tables, 5 schemas)
│
├── src/
│   ├── api/                       # HTTP API Layer
│   │   ├── middleware/
│   │   │   ├── auth.ts            # Merchant JWT authentication
│   │   │   └── adminAuth.ts       # Super admin authentication
│   │   └── routes/
│   │       ├── auth.ts            # Merchant auth endpoints
│   │       ├── admin.ts           # Super admin endpoints
│   │       ├── merchants.ts       # Merchant management (admin)
│   │       └── payments.ts        # Payment request endpoints
│   │
│   ├── application/               # Use Cases (Business Logic)
│   │   ├── auth/
│   │   │   ├── RegisterMerchant.ts
│   │   │   ├── LoginMerchant.ts
│   │   │   └── VerifyPin.ts
│   │   ├── admin/
│   │   │   ├── RegisterSuperAdmin.ts
│   │   │   ├── LoginSuperAdmin.ts
│   │   │   └── VerifySuperAdminPin.ts
│   │   └── payments/
│   │       └── CreatePaymentRequest.ts
│   │
│   ├── domain/                    # Domain Models & Utilities
│   │   └── utils/
│   │       ├── auth.ts            # Slug generation, PIN generation
│   │       ├── orderNumber.ts     # Sequential order numbering
│   │       └── buyerRateLimit.ts  # Redis-based rate limiting
│   │
│   ├── infrastructure/            # External Integrations
│   │   ├── database/
│   │   │   └── client.ts          # Prisma client
│   │   └── cache/
│   │       └── redis.ts           # Redis client
│   │
│   ├── config/
│   │   └── index.ts               # Environment configuration
│   │
│   └── server.ts                  # Express app entry point
│
├── docs/
│   ├── SETUP.md                   # Installation guide
│   ├── AUTHENTICATION.md          # Auth system documentation
│   └── PAYMENT_REQUESTS.md        # Payment request documentation
│
├── .env                           # Environment variables
├── package.json                   # Dependencies
└── tsconfig.json                  # TypeScript configuration
```

### Database Architecture
```
┌─────────────────────────────────────────────────────────┐
│                    PostgreSQL Database                  │
├─────────────────────────────────────────────────────────┤
│  Schema: core                                           │
│    ├── merchants              (Merchant accounts)       │
│    ├── super_admins           (Platform admins)         │
│    └── plugin_registry         (Plugin connections)     │
├─────────────────────────────────────────────────────────┤
│  Schema: payments                                       │
│    ├── payment_requests        (Orders/invoices)        │
│    └── payment_intents         (Specific payment methods)│
├─────────────────────────────────────────────────────────┤
│  Schema: events                                         │
│    ├── outbox                  (Event dispatch queue)   │
│    ├── webhooks                (Merchant webhooks)      │
│    └── webhook_deliveries      (Delivery tracking)      │
├─────────────────────────────────────────────────────────┤
│  Schema: audit                                          │
│    └── audit_logs              (Complete audit trail)   │
├─────────────────────────────────────────────────────────┤
│  Schema: ops                                            │
│    └── advisory_locks          (Distributed locking)    │
└─────────────────────────────────────────────────────────┘
```

---

## 🏗️ Architecture

### Current Architecture (Phase 1)
```
┌──────────────────────────────────────────────────────────┐
│                    SUZAA CORE                            │
│              (Standalone - No Plugins)                   │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────┐ │
│  │   Merchant  │  │   Customer   │  │  Super Admin   │ │
│  │     Auth    │  │   Payment    │  │   Dashboard    │ │
│  │  (PIN-based)│  │     Pages    │  │   (Manage)     │ │
│  └──────┬──────┘  └──────┬───────┘  └────────┬───────┘ │
│         │                │                   │         │
│         └────────────────┼───────────────────┘         │
│                          │                             │
│  ┌──────────────────────▼──────────────────────────┐   │
│  │          Payment Request Creation               │   │
│  │  • Sequential order numbers (jumasm/20251106/0001)│  │
│  │  • Timezone-aware daily reset                   │   │
│  │  • Configurable expiry (15-120 min)            │   │
│  │  • Rate limiting (buyer protection)             │   │
│  └──────────────────────┬──────────────────────────┘   │
│                          │                             │
│  ┌──────────────────────▼──────────────────────────┐   │
│  │        Payment Method Selection                 │   │
│  │                                                  │   │
│  │  ┌──────────┐  ┌─────────────────────────────┐ │   │
│  │  │   CASH   │  │  Crypto (Future - Plugins)  │ │   │
│  │  │          │  │  • USDC (Solana plugin)     │ │   │
│  │  │ Manual   │  │  • SOL (Solana plugin)      │ │   │
│  │  │ confirm  │  │  • BTC (Bitcoin plugin)     │ │   │
│  │  └────┬─────┘  └─────────────────────────────┘ │   │
│  └───────┼────────────────────────────────────────┘   │
│          │                                             │
│  ┌───────▼────────────────────────────────────────┐   │
│  │          Settlement Decision Logic              │   │
│  │  • Amount matching (with tolerance)             │   │
│  │  • Status transitions                           │   │
│  │  • Webhook dispatch                             │   │
│  │  • Audit logging                                │   │
│  └─────────────────────────────────────────────────┘   │
│                                                          │
├──────────────────────────────────────────────────────────┤
│                   Data Layer                             │
│  ┌──────────────┐        ┌─────────────────┐            │
│  │ PostgreSQL 17│        │   Redis 7.x     │            │
│  │ (5 schemas)  │        │ (Rate limiting) │            │
│  └──────────────┘        └─────────────────┘            │
└──────────────────────────────────────────────────────────┘
```

### Future Architecture (Phase 2 - With Plugins)
```
┌──────────────────────────────────────────────────────────┐
│                    SUZAA CORE                            │
│              (Open Source - MIT License)                 │
└────────────────────┬─────────────────────────────────────┘
                     │
         ┌───────────┼───────────┐
         │ HTTP API  │  HTTP API │
         │ Contract  │  Contract │
         ▼           ▼           ▼
┌────────────┐  ┌────────────┐  ┌────────────┐
│  Solana    │  │  Bitcoin   │  │  Ethereum  │
│  Plugin    │  │  Plugin    │  │  Plugin    │
│ (VPS #1)   │  │ (VPS #2)   │  │ (VPS #3)   │
├────────────┤  ├────────────┤  ├────────────┤
│ Separate   │  │ Separate   │  │ Separate   │
│ Database   │  │ Database   │  │ Database   │
└────────────┘  └────────────┘  └────────────┘
 Proprietary     Proprietary     Proprietary

Key Principles:
- Plugins are microservices (separate VPS, separate DB)
- HTTP-only communication (no shared code/database)
- HMAC-signed requests (security)
- Core makes business decisions, plugins report facts
```

---

## ✨ Current Features

### ✅ Implemented (Phase 1)

#### Authentication System
- **Passwordless authentication** - PIN-based verification (10-minute expiry)
- **Auto-generated merchant slugs** - 6 letters, unique (e.g., `jumasm`)
- **JWT tokens** - 7-day expiry, stateless
- **Super admin** - One-time registration, email locked
- **Role-based access** - Merchant vs admin permissions
- **Max 5 PIN attempts** - Security lockout

#### Payment Requests
- **Sequential order numbers** - `jumasm/20251106/0001` format
- **Daily auto-reset** - At midnight in merchant's timezone
- **Configurable expiry** - 15, 30, 60, or 120 minutes
- **Two creation methods**:
  - Merchant-created (authenticated API)
  - Buyer-initiated (public page, rate-limited)
- **Timezone-aware** - Date based on merchant's local time
- **Rate limiting** - 1 order/hour for buyers (configurable)

#### Merchant Management
- **List all merchants** (admin)
- **Suspend/unsuspend** (admin with reason tracking)
- **Delete merchant** (admin with confirmation)
- **Merchant settings** (timezone, currency, limits)

#### Infrastructure
- **PostgreSQL 17** - 5 schemas, 11 tables, production-ready
- **Redis** - Caching and rate limiting
- **Audit logging** - Complete trail of all actions
- **Health checks** - `/health` endpoint
- **Graceful shutdown** - Clean connection cleanup

### 🚧 In Progress (Phase 1.5)

#### Customer Payment UX
- [ ] Payment lookup page (enter order number)
- [ ] Payment details page (amount, merchant, timer)
- [ ] CASH payment instructions
- [ ] "I Have Paid" button (customer claim)
- [ ] Payment status polling

#### Merchant Dashboard
- [ ] Order list with filters
- [ ] Order details view
- [ ] Mark as paid action
- [ ] Settings page
- [ ] Export to CSV

#### Settlement Logic
- [ ] Amount tolerance checking
- [ ] Status transitions (PENDING → SETTLED)
- [ ] Webhook dispatch to merchants
- [ ] Receipt generation

### 📋 Planned (Phase 2 - Plugins)

#### Plugin Integration
- [ ] Plugin HTTP client
- [ ] Plugin evidence endpoint
- [ ] HMAC signature verification
- [ ] Plugin SDK (`@suzaa/plugin-sdk`)
- [ ] Reference plugin (mock)
- [ ] Solana plugin (proprietary)

---

## 💰 Payment Flows

### Current Flow: CASH Payments
```
┌─────────────────────────────────────────────────────────┐
│                 CASH Payment Flow                        │
│              (No Plugins Required)                       │
└─────────────────────────────────────────────────────────┘

1. MERCHANT CREATES ORDER
   ┌───────────────────────────────────────────┐
   │ POST /payments/requests                   │
   │ { amount: 100.50, description: "..." }    │
   │                                           │
   │ → Creates: jumasm/20251106/0001          │
   │ → Status: PENDING                         │
   │ → Expires: 60 minutes                     │
   └───────────────────────────────────────────┘

2. CUSTOMER VISITS LINK
   ┌───────────────────────────────────────────┐
   │ GET /payments/jumasm/20251106/0001        │
   │                                           │
   │ Shows:                                    │
   │ • Merchant: "Test Business"               │
   │ • Amount: $100.50 USD                     │
   │ • Expires: "14:32 remaining"              │
   │ • Payment methods: [CASH]                 │
   └───────────────────────────────────────────┘

3. CUSTOMER SELECTS CASH
   ┌───────────────────────────────────────────┐
   │ POST /payments/:id/select-method          │
   │ { method: "CASH" }                        │
   │                                           │
   │ Shows instructions:                       │
   │ "Pay via bank transfer, cash, or check"  │
   │                                           │
   │ [I Have Paid] button                      │
   └───────────────────────────────────────────┘

4. CUSTOMER CLAIMS PAID
   ┌───────────────────────────────────────────┐
   │ POST /payments/:id/mark-paid              │
   │                                           │
   │ → Creates PaymentIntent                   │
   │ → Status: PENDING_CONFIRMATION            │
   │ → Notifies merchant                       │
   └───────────────────────────────────────────┘

5. MERCHANT CONFIRMS
   ┌───────────────────────────────────────────┐
   │ Merchant Dashboard                        │
   │ → Views order jumasm/20251106/0001        │
   │ → Sees: "Customer claims paid"            │
   │ → Clicks: [Confirm Payment]               │
   │                                           │
   │ POST /payments/:id/confirm (auth)         │
   │ → Status: SETTLED                         │
   │ → settledAt: timestamp                    │
   │ → Webhook dispatched                      │
   │ → Audit log created                       │
   └───────────────────────────────────────────┘
```

### Future Flow: Crypto Payments (With Plugins)
```
┌─────────────────────────────────────────────────────────┐
│              Crypto Payment Flow                         │
│          (Requires Blockchain Plugin)                    │
└─────────────────────────────────────────────────────────┘

1. MERCHANT CREATES ORDER
   (Same as CASH flow)

2. CUSTOMER VISITS LINK
   Shows payment methods: [USDC] [SOL] [BTC] [CASH]

3. CUSTOMER SELECTS CRYPTO (e.g., USDC)
   ┌───────────────────────────────────────────┐
   │ Core → Plugin:                            │
   │ POST /v1/intents/:id/allocate             │
   │ { coin: "USDC_SOL", amount: "100.50" }   │
   │                                           │
   │ Plugin → Core:                            │
   │ { address: "Ffo...M2", memo: "12345" }   │
   │                                           │
   │ Shows to customer:                        │
   │ • QR code                                 │
   │ • Address + memo                          │
   │ • Amount in crypto (with conversion)     │
   └───────────────────────────────────────────┘

4. PLUGIN DETECTS PAYMENT
   ┌───────────────────────────────────────────┐
   │ Plugin monitors blockchain                │
   │ → Finds matching transaction              │
   │                                           │
   │ Plugin → Core:                            │
   │ POST /internal/decisions/settlement       │
   │ { txId: "...", amountReceived: "100.48" }│
   │                                           │
   │ Core decides:                             │
   │ → 100.48 vs 100.50 = 0.02 difference     │
   │ → Within 2% tolerance → SETTLED          │
   └───────────────────────────────────────────┘

5. AUTOMATIC SETTLEMENT
   → Status: SETTLED (no merchant action needed)
   → Webhook dispatched
   → Customer sees success
```

---

## 🧠 Business Logic

### Settlement Decision Algorithm

This is the core business logic that works for BOTH cash and crypto:
```typescript
interface SettlementContext {
  paymentRequest: {
    amountFiat: number;        // Expected amount
    currencyFiat: string;      // USD, EUR, etc.
  };
  merchant: {
    settleTolerancePct: number; // Default: 2%
  };
  evidence: {
    amountReceived: number;     // Actual amount
    method: 'CASH' | 'CRYPTO';
    source: string;             // "merchant_confirm" or "plugin_evidence"
  };
}

function decideSettlement(ctx: SettlementContext): SettlementDecision {
  const expected = ctx.paymentRequest.amountFiat;
  const received = ctx.evidence.amountReceived;
  const tolerance = expected * (ctx.merchant.settleTolerancePct / 100);
  
  const difference = Math.abs(received - expected);
  
  // Within tolerance → SETTLED
  if (difference <= tolerance) {
    return {
      status: 'SETTLED',
      reason: `Amount within ${ctx.merchant.settleTolerancePct}% tolerance`,
      amountExpected: expected,
      amountReceived: received,
      difference: difference
    };
  }
  
  // Under tolerance → UNDERPAID
  if (received < expected) {
    return {
      status: 'UNDERPAID',
      reason: `Received ${received}, expected ${expected}`,
      amountExpected: expected,
      amountReceived: received,
      difference: difference
    };
  }
  
  // Over tolerance → OVERPAID (rare, but handle it)
  return {
    status: 'OVERPAID',
    reason: `Received ${received}, expected ${expected}`,
    amountExpected: expected,
    amountReceived: received,
    difference: difference
  };
}
```

### Status Lifecycle
```
┌──────────────────────────────────────────────────────┐
│            Payment Request Status Flow                │
└──────────────────────────────────────────────────────┘

PENDING
  │
  ├─→ (time expires) → EXPIRED
  │
  ├─→ (customer selects CASH) → PENDING_CONFIRMATION
  │       │
  │       ├─→ (merchant confirms) → SETTLED ✓
  │       └─→ (merchant rejects) → REJECTED
  │
  └─→ (customer selects CRYPTO) → MONITORING
          │
          ├─→ (full amount detected) → SETTLED ✓
          ├─→ (partial amount) → UNDERPAID
          └─→ (overpayment) → OVERPAID

Legend:
✓ = Happy path (payment successful)
```

---

## 🚀 Quick Start

### Prerequisites

- Node.js ≥ 20.0.0
- PostgreSQL ≥ 17
- Redis ≥ 7.0
- pnpm (recommended) or npm

### Installation
```bash
# Clone repository
git clone https://github.com/suzaaglobal/first.git
cd first

# Install dependencies
pnpm install

# Configure environment
cp .env.example .env
# Edit .env with your settings

# Setup database
DATABASE_URL="your-connection-string" pnpm db:push

# Start development
pnpm dev
```

### Environment Variables
```bash
# Database
DATABASE_URL="postgresql://suzaa_core:password@localhost:5432/suzaa_core_db?schema=core"

# Redis
REDIS_URL="redis://localhost:6379"

# Server
PORT=3000
NODE_ENV=production
BASE_URL="http://your-domain.com"

# Security (generate with: openssl rand -hex 32)
JWT_SECRET="your-jwt-secret-here"
API_KEY_SALT="your-api-key-salt-here"
PLUGIN_HMAC_SECRET="your-plugin-hmac-secret-here"
```

### First Steps
```bash
# 1. Register super admin
curl -X POST http://localhost:3000/admin/register \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@company.com","name":"Admin"}'

# 2. Check console for PIN, then verify
curl -X POST http://localhost:3000/admin/verify \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@company.com","pin":"123456"}'

# 3. Register merchant
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"merchant@example.com","businessName":"My Shop"}'

# 4. Create payment request
curl -X POST http://localhost:3000/payments/requests \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"amount":100.50,"description":"Order #123"}'

# Response: http://your-domain.com/jumasm/20251106/0001
```

---

## 🔌 API Reference

### Quick Reference

| Category | Endpoint | Method | Auth | Description |
|----------|----------|--------|------|-------------|
| **Merchant Auth** | `/auth/register` | POST | Public | Register merchant |
| | `/auth/login` | POST | Public | Request PIN |
| | `/auth/verify` | POST | Public | Verify PIN, get JWT |
| | `/auth/me` | GET | JWT | Get merchant info |
| **Admin** | `/admin/register` | POST | Public | Register admin (once) |
| | `/admin/login` | POST | Public | Request admin PIN |
| | `/admin/verify` | POST | Public | Verify admin PIN |
| **Payments** | `/payments/requests` | POST | Merchant | Create payment request |
| | `/payments/requests` | GET | Merchant | List merchant's requests |
| | `/payments/:slug/:date/:order` | GET | Public | View payment details |
| **Admin Management** | `/merchants` | GET | Admin | List all merchants |
| | `/merchants/:id/suspend` | POST | Admin | Suspend merchant |
| | `/merchants/:id/unsuspend` | POST | Admin | Unsuspend merchant |

### Example: Create Payment Request
```bash
POST /payments/requests
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: application/json

{
  "amount": 100.50,
  "description": "Invoice #12345",
  "expiryMinutes": 60
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "paymentRequestId": "c417fd66-c9a5-4813-b387-4208f45b8f89",
    "linkId": "jumasm/20251106/0001",
    "paymentUrl": "http://116.203.195.248/jumasm/20251106/0001",
    "expiresAt": "2025-11-06T16:30:00.000Z"
  }
}
```

For complete API documentation, see:
- [Authentication Guide](AUTHENTICATION.md)
- [Payment Requests Guide](PAYMENT_REQUESTS.md)

---

## 🗺️ Roadmap

### ✅ Phase 1: Core Foundation (COMPLETE)
- [x] Authentication (passwordless PIN-based)
- [x] Merchant management
- [x] Super admin system
- [x] Payment request creation
- [x] Sequential order numbers
- [x] Timezone-aware daily reset
- [x] Rate limiting
- [x] Audit logging
- [x] Database schema (production-ready)

### 🚧 Phase 1.5: CASH Payment Flow (IN PROGRESS)
- [ ] Customer payment lookup page
- [ ] Payment details display
- [ ] CASH payment instructions
- [ ] Customer "I Have Paid" button
- [ ] Merchant dashboard (order list)
- [ ] Merchant confirmation action
- [ ] Settlement decision logic
- [ ] Webhook dispatch
- **Goal:** Fully functional payment gateway WITHOUT plugins

### 📋 Phase 2: Plugin Architecture
- [ ] Plugin HTTP contract (OpenAPI spec)
- [ ] Plugin SDK (`@suzaa/plugin-sdk`)
- [ ] Mock plugin (reference implementation)
- [ ] Plugin HTTP client (Core → Plugin)
- [ ] Evidence endpoint (Plugin → Core)
- [ ] HMAC signature verification
- [ ] Plugin health checks
- [ ] Settlement decision (crypto-aware)

### 🔌 Phase 2.5: First Plugin (Proprietary)
- [ ] Solana plugin (separate repository)
- [ ] Wallet management
- [ ] Blockchain scanner
- [ ] Transaction matcher
- [ ] Confirmation tracking
- [ ] Reorg handling
- **Goal:** End-to-end crypto payment (Solana USDC)

### 🌟 Phase 3: Platform Features
- [ ] Multi-currency conversion API
- [ ] QR code generation
- [ ] Payment status webhooks
- [ ] Recurring payments
- [ ] Subscription management
- [ ] Advanced analytics
- [ ] Mobile SDK

### 🏢 Phase 4: Enterprise
- [ ] White-label customization
- [ ] Multi-tenant mode
- [ ] Advanced fraud detection
- [ ] KYC/AML compliance tools
- [ ] Enterprise SSO
- [ ] SLA guarantees

---

## 🤝 Contributing

SUZAA Core is open source (MIT License) and welcomes contributions!

### Current Priorities

We need help with:
- 🎨 **Frontend** - Customer payment pages (React/HTML)
- 🧪 **Testing** - Unit and integration tests
- 📖 **Documentation** - Tutorials and guides
- 🌍 **i18n** - Multi-language support
- 🔌 **Community Plugins** - Write your own blockchain plugins

### How to Contribute

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing`)
3. Commit changes (`git commit -m 'feat: add amazing feature'`)
4. Push to branch (`git push origin feature/amazing`)
5. Open Pull Request

### Development Setup
```bash
git clone https://github.com/YOUR_USERNAME/first.git
cd first
pnpm install
pnpm dev
```

---

## 📄 License

**SUZAA Core:** MIT License (Open Source)
```
MIT License

Copyright (c) 2025 SUZAA Global

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction...
```

**Blockchain Plugins:** Proprietary (Licensed Separately)

---

## 💬 Support

- **GitHub Issues:** Bug reports and features
- **Discussions:** Community chat
- **Email:** dev@suzaa.com
- **Security:** security@suzaa.com (private)

---

## 🌟 Acknowledgments

Built with:
- TypeScript & Node.js
- Express.js
- Prisma ORM
- PostgreSQL & Redis

---

<div align="center">

**[Documentation](SETUP.md)** • **[API Reference](PAYMENT_REQUESTS.md)** • **[Contributing](#contributing)**

Made with ❤️ by [SUZAA Global](https://github.com/suzaaglobal)

⭐ Star us on GitHub if you find this useful!

**Current Status:** Phase 1 Complete, Building CASH Payment Flow

</div>
