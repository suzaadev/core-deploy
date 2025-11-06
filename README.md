# SUZAA Core 🚀

**Open-source cryptocurrency payment gateway with a modular plugin architecture.**

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen.svg)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/typescript-5.x-blue.svg)](https://www.typescriptlang.org)
[![PostgreSQL](https://img.shields.io/badge/postgresql-17-336791.svg)](https://www.postgresql.org)
[![Redis](https://img.shields.io/badge/redis-7.x-red.svg)](https://redis.io)

---

## 📋 Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Features](#features)
- [Quick Start](#quick-start)
- [Documentation](#documentation)
- [API Reference](#api-reference)
- [Tech Stack](#tech-stack)
- [Roadmap](#roadmap)
- [Contributing](#contributing)
- [License](#license)
- [Support](#support)

---

## 🎯 Overview

SUZAA Core is a **production-ready, open-source payment gateway** designed for cryptocurrency payments. Built with a strict separation between business logic (core) and blockchain implementations (plugins), SUZAA Core is:

- ✅ **Framework-agnostic** - Core handles business logic, plugins handle blockchains
- ✅ **Production-ready** - Full audit logging, rate limiting, timezone support
- ✅ **Secure by design** - Passwordless authentication, JWT tokens, HMAC verification
- ✅ **Developer-friendly** - RESTful APIs, comprehensive docs, TypeScript
- ✅ **Scalable** - PostgreSQL, Redis, microservice-ready architecture

### Why SUZAA?

Traditional payment gateways are **monolithic and closed-source**. SUZAA Core provides:

1. **Transparency** - Open-source core you can audit and trust
2. **Flexibility** - Bring your own blockchain via plugins
3. **Control** - Self-hosted, no vendor lock-in
4. **Innovation** - Community-driven improvements

---

## 🏗️ Architecture

### Core + Plugin Model

SUZAA follows a strict **separation of concerns**:
```
┌─────────────────────────────────────────────────┐
│                 SUZAA CORE                      │
│        (Open Source - Business Logic)           │
├─────────────────────────────────────────────────┤
│  • Merchant Management                          │
│  • Payment Requests                             │
│  • Order Number Generation                      │
│  • Authentication & Authorization               │
│  • Audit Logging                                │
│  • Webhook Dispatch                             │
│  • Admin Dashboard                              │
└──────────────┬──────────────────────────────────┘
               │ HTTP API Contract
               │ (Stateless, Versioned, Signed)
               ↓
┌─────────────────────────────────────────────────┐
│              BLOCKCHAIN PLUGINS                 │
│         (Proprietary - Chain Experts)           │
├─────────────────────────────────────────────────┤
│  • suzaa-solana-plugin                          │
│  • suzaa-ethereum-plugin                        │
│  • suzaa-bitcoin-plugin                         │
│  • Your Custom Plugin                           │
└─────────────────────────────────────────────────┘
```

### Key Principles

1. **Core knows business, not blockchains** - SUZAA Core manages merchants, orders, and business rules. It never touches blockchain code.

2. **Plugins know blockchains, not business** - Plugins monitor chains, match transactions, and report evidence to Core.

3. **HTTP-only communication** - All interaction via stateless, versioned HTTP APIs with HMAC signatures.

4. **No direct database access** - Core and plugins maintain separate databases. No shared state.

5. **Evidence-based settlement** - Plugins report facts ("I saw transaction X"), Core makes decisions ("This settles order Y").

---

## ✨ Features

### Authentication & Authorization

- **Passwordless authentication** - PIN-based verification via email (10-minute expiry)
- **Auto-generated merchant slugs** - 6-letter unique identifiers (e.g., `jumasm`)
- **JWT tokens** - 7-day expiry, stateless authentication
- **Super admin system** - One-time registration, email locked, full merchant management
- **Role-based access control** - Merchant vs admin permissions

### Payment Management

- **Sequential order numbers** - Auto-incrementing per merchant per day (`jumasm/20251106/0001`)
- **Timezone-aware** - Daily reset at merchant's local midnight, not UTC
- **Configurable expiry** - 15, 30, 60, or 120 minutes
- **Two creation methods**:
  - Merchant-created (API/dashboard)
  - Buyer-initiated (public payment portal)
- **Rate limiting** - Prevents buyer abuse (1 order/hour default, configurable)
- **Auto-expiry** - Status updates when time runs out

### Security

- **Bcrypt password hashing** - Industry-standard encryption
- **HMAC signature verification** - Secure plugin communication
- **API key authentication** - For external integrations
- **Webhook secret signing** - Verify merchant webhooks
- **Audit logging** - Complete trail of all actions
- **Account suspension** - Admin can suspend/unsuspend merchants

### Infrastructure

- **PostgreSQL 17** - 5 schemas (core, payments, events, audit, ops), 11 tables
- **Redis caching** - Plugin response caching, rate limiting
- **Outbox pattern** - Guaranteed webhook delivery
- **Graceful shutdown** - Proper connection cleanup
- **Health checks** - `/health` endpoint for monitoring

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
# Edit .env with your database credentials

# Initialize database
pnpm db:push

# Start development server
pnpm dev
```

### Environment Variables
```bash
# Database
DATABASE_URL="postgresql://user:pass@localhost:5432/suzaa_core_db?schema=core"

# Redis
REDIS_URL="redis://localhost:6379"

# Server
PORT=3000
NODE_ENV=production
BASE_URL="http://your-domain.com"

# Security (use openssl rand -hex 32)
JWT_SECRET="your-jwt-secret"
API_KEY_SALT="your-api-key-salt"
PLUGIN_HMAC_SECRET="your-plugin-hmac-secret"
```

### First Steps

1. **Register super admin** (one-time only):
```bash
curl -X POST http://localhost:3000/admin/register \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@yourcompany.com","name":"Admin"}'
```

2. **Verify PIN** (check console for PIN):
```bash
curl -X POST http://localhost:3000/admin/verify \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@yourcompany.com","pin":"123456"}'
```

3. **Register a merchant**:
```bash
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"merchant@example.com","businessName":"Test Business"}'
```

4. **Create payment request**:
```bash
curl -X POST http://localhost:3000/payments/requests \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"amount":100.50,"description":"Invoice #123"}'
```

---

## 📚 Documentation

Comprehensive guides for every aspect of SUZAA Core:

- **[Setup Guide](SETUP.md)** - Complete installation and configuration
- **[Authentication Guide](AUTHENTICATION.md)** - Passwordless auth system
- **[Payment Requests](PAYMENT_REQUESTS.md)** - Order creation and management
- **[API Reference](#api-reference)** - Complete endpoint documentation (below)

---

## 🔌 API Reference

### Authentication

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/auth/register` | Public | Register new merchant |
| POST | `/auth/login` | Public | Request login PIN |
| POST | `/auth/verify` | Public | Verify PIN, get JWT |
| GET | `/auth/me` | JWT | Get current merchant info |

### Super Admin

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/admin/register` | Public | Register super admin (once) |
| POST | `/admin/login` | Public | Request admin PIN |
| POST | `/admin/verify` | Public | Verify admin PIN |

### Merchant Management (Admin Only)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/merchants` | Admin JWT | List all merchants |
| GET | `/merchants/:id` | Admin JWT | Get merchant details |
| POST | `/merchants/:id/suspend` | Admin JWT | Suspend merchant |
| POST | `/merchants/:id/unsuspend` | Admin JWT | Unsuspend merchant |
| DELETE | `/merchants/:id` | Admin JWT | Delete merchant |

### Payment Requests

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/payments/requests` | Merchant JWT | Create payment request |
| GET | `/payments/requests` | Merchant JWT | List merchant's requests |
| GET | `/payments/:slug/:date/:order` | Public | View payment request |

### Health & Status

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/health` | Public | Health check |
| GET | `/` | Public | Service info |

### Example: Create Payment Request
```bash
POST /payments/requests
Authorization: Bearer eyJhbGci...
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
    "paymentRequestId": "uuid-here",
    "linkId": "jumasm/20251106/0001",
    "paymentUrl": "http://your-domain.com/jumasm/20251106/0001",
    "expiresAt": "2025-11-06T16:30:00.000Z"
  }
}
```

---

## 🛠️ Tech Stack

### Backend
- **Node.js 20** - Runtime environment
- **TypeScript 5** - Type safety and developer experience
- **Express.js** - HTTP server and routing
- **Prisma** - Type-safe database ORM

### Database
- **PostgreSQL 17** - Primary data store
- **Redis 7** - Caching and rate limiting

### Security
- **Helmet** - Security headers
- **CORS** - Cross-origin resource sharing
- **JWT** - JSON Web Tokens for authentication
- **bcrypt** - Password hashing

### Infrastructure
- **pnpm** - Fast, efficient package manager
- **tsx** - TypeScript execution for development

---

## 🗺️ Roadmap

### ✅ Phase 1: Core Foundation (Complete)
- [x] Authentication system (passwordless)
- [x] Merchant management
- [x] Super admin system
- [x] Payment request creation
- [x] Sequential order numbers
- [x] Timezone support
- [x] Rate limiting
- [x] Audit logging

### 🚧 Phase 2: Customer Experience (In Progress)
- [ ] Public payment pages (UI)
- [ ] Buyer-initiated orders
- [ ] QR code generation
- [ ] Payment status polling
- [ ] Multi-language support

### 📋 Phase 3: Plugin Integration
- [ ] Plugin API contract finalization
- [ ] Solana plugin (proprietary)
- [ ] Webhook delivery system
- [ ] Payment intent creation
- [ ] Transaction monitoring

### 🔮 Phase 4: Advanced Features
- [ ] Recurring payments
- [ ] Subscription management
- [ ] Multi-currency conversion
- [ ] Advanced analytics
- [ ] Mobile SDK

### 🌟 Phase 5: Enterprise
- [ ] White-label customization
- [ ] Multi-tenant support
- [ ] Advanced fraud detection
- [ ] Compliance tools (KYC/AML)
- [ ] Enterprise SSO

---

## 🤝 Contributing

SUZAA Core is open source and welcomes contributions!

### How to Contribute

1. **Fork the repository**
2. **Create a feature branch** (`git checkout -b feature/amazing-feature`)
3. **Commit your changes** (`git commit -m 'Add amazing feature'`)
4. **Push to branch** (`git push origin feature/amazing-feature`)
5. **Open a Pull Request**

### Development Setup
```bash
# Clone your fork
git clone https://github.com/YOUR_USERNAME/first.git

# Install dependencies
pnpm install

# Create feature branch
git checkout -b feature/my-feature

# Make changes and test
pnpm dev

# Run tests (coming soon)
pnpm test

# Commit with conventional commits
git commit -m "feat: add amazing feature"
```

### Contribution Guidelines

- **Code Style** - Follow existing TypeScript patterns
- **Commits** - Use [Conventional Commits](https://www.conventionalcommits.org/)
- **Tests** - Add tests for new features (when test suite is ready)
- **Documentation** - Update docs for API changes
- **Security** - Report vulnerabilities privately

### Areas Needing Help

- 🎨 **UI/UX** - Public payment pages design
- 📱 **Mobile** - React Native SDK
- 🌍 **i18n** - Multi-language support
- 🧪 **Testing** - Unit and integration tests
- 📖 **Documentation** - Tutorials and guides
- 🔌 **Plugins** - Community blockchain plugins

---

## 📄 License

SUZAA Core is licensed under the **MIT License**.
```
MIT License

Copyright (c) 2025 SUZAA Global

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

**Note:** While SUZAA Core is open source (MIT), blockchain plugins are proprietary and licensed separately.

---

## 💬 Support

### Community

- **GitHub Issues** - Bug reports and feature requests
- **Discussions** - General questions and community chat
- **Discord** - Real-time community support (coming soon)

### Commercial Support

For enterprise deployments, custom plugins, or priority support:
- Email: dev@suzaa.com
- Website: https://suzaa.com (coming soon)

### Security

Found a security vulnerability? Please email security@suzaa.com instead of opening a public issue.

---

## 🌟 Acknowledgments

Built with passion by the SUZAA team and contributors worldwide.

Special thanks to:
- The TypeScript and Node.js communities
- Prisma team for an amazing ORM
- PostgreSQL and Redis maintainers
- All our contributors and early adopters

---

## 📊 Project Stats

- **Language:** TypeScript
- **Database:** PostgreSQL
- **Cache:** Redis
- **Architecture:** Microservices-ready
- **License:** MIT (core), Proprietary (plugins)
- **Status:** Production-ready (Phase 1 complete)

---

<div align="center">

**[Website](https://suzaa.com)** • **[Documentation](SETUP.md)** • **[API Docs](PAYMENT_REQUESTS.md)** • **[Contributing](#contributing)**

Made with ❤️ by [SUZAA Global](https://github.com/suzaaglobal)

⭐ **Star us on GitHub** — it helps!

</div>
