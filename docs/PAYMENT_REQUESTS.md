# SUZAA Core - Payment Request System

Complete documentation for the payment request creation and management system.

## Table of Contents
1. [Overview](#overview)
2. [Link Format](#link-format)
3. [Order Number System](#order-number-system)
4. [Creation Methods](#creation-methods)
5. [API Reference](#api-reference)
6. [Rate Limiting](#rate-limiting)
7. [Timezone Handling](#timezone-handling)
8. [Expiry Management](#expiry-management)
9. [Examples](#examples)

---

## Overview

The Payment Request system allows merchants to create payment links for customers. Each payment request generates a unique, sequential URL that customers can use to pay via cryptocurrency.

### Key Features
- ✅ **Sequential order numbers** - Auto-increments per merchant per day
- ✅ **Timezone-aware** - Resets at midnight in merchant's timezone
- ✅ **Configurable expiry** - 15, 30, 60 (default), or 120 minutes
- ✅ **Two creation methods** - Merchant-created or buyer-initiated
- ✅ **Rate limiting** - Prevents buyer abuse
- ✅ **Automatic expiry** - Status updates when time runs out

---

## Link Format

### Structure
```
http://116.203.195.248/{slug}/{YYYYMMDD}/{NNNN}
                       └─┬──┘ └──┬────┘ └─┬─┘
                      merchant  date    order
                       slug   (timezone) number
```

### Example
```
http://116.203.195.248/jumasm/20251106/0001
```

- **Merchant**: `jumasm` (6-letter slug)
- **Date**: `20251106` (November 6, 2025 in merchant's timezone)
- **Order**: `0001` (first order of the day)

### Components

**Slug (6 letters)**
- Unique merchant identifier
- Lowercase a-z only
- Auto-generated during registration
- Public and searchable

**Date (8 digits)**
- Format: YYYYMMDD
- Based on **merchant's timezone**
- Not UTC unless merchant timezone is UTC
- Changes at midnight in merchant's local time

**Order Number (4 digits)**
- Range: 0001-9999
- Resets daily at midnight (merchant timezone)
- Sequential per merchant
- Atomic increment (no collisions)

---

## Order Number System

### Daily Reset Logic

**How It Works:**
1. Merchant creates first payment of the day → Order `0001`
2. Second payment → Order `0002`
3. At midnight (merchant timezone) → Resets to `0001`

**Example Timeline (EST Timezone):**
```
Nov 6, 2025 10:00 AM EST → jumasm/20251106/0001
Nov 6, 2025 11:30 AM EST → jumasm/20251106/0002
Nov 6, 2025 11:59 PM EST → jumasm/20251106/0003
Nov 7, 2025 12:01 AM EST → jumasm/20251107/0001  ← Reset!
```

### Collision Prevention

**Atomic Increment:**
- Database query finds highest order number for date
- Increments by 1
- Unique constraint prevents duplicates
- Race conditions return error: "Order number conflict. Please try again."

**Daily Limit:**
- Maximum 9999 orders per merchant per day
- Exceeding limit returns error: "Daily order limit reached"

### Timezone Changes

**What Happens:**
- Merchant changes timezone in settings
- Order sequence continues in **new timezone**
- Old orders remain valid (use original timezone)
- New orders use new timezone
- Warning shown: "Changing timezone will reset order sequence"

**Example:**
```
Merchant in EST creates: jumasm/20251106/0001 (10 AM EST)
Merchant switches to PST at 11 AM EST
Next order created: jumasm/20251106/0002 (8 AM PST = 11 AM EST, same day)
Wait until midnight PST
Next order: jumasm/20251107/0001 (resets at PST midnight)
```

---

## Creation Methods

### 1. Merchant-Created (Dashboard/API)

**Who:** Authenticated merchant via dashboard or API

**Process:**
```
1. Merchant logs in with JWT token
2. Creates payment request with amount, description, expiry
3. System generates sequential order number
4. Returns payment link immediately
```

**Required Fields:**
- `amount` (number) - Payment amount in fiat
- `description` (string, optional) - Payment description
- `expiryMinutes` (15, 30, 60, 120) - Default: 60

**Example:**
```bash
POST /payments/requests
Authorization: Bearer <merchant-jwt>
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
    "paymentUrl": "http://116.203.195.248/jumasm/20251106/0001",
    "expiresAt": "2025-11-06T16:30:00.000Z"
  }
}
```

### 2. Buyer-Initiated (Public Page)

**Who:** Anonymous buyer on public payment portal

**Process:**
```
1. Buyer visits: http://116.203.195.248/jumasm
2. Enters amount (optional note)
3. System creates payment request
4. Redirects to payment page
```

**Restrictions:**
- ⚠️ Fixed 60-minute expiry (no choice)
- ⚠️ Rate limited (default: 1 order per hour)
- ⚠️ Merchant can adjust limit in settings

**Rate Limit Examples:**
- Default: 1 order per hour per IP
- Configurable: Merchant sets `maxBuyerOrdersPerHour`
- Tracking: Redis key `buyer-orders:{merchantId}:{ip}`
- Reset: Automatic after 1 hour

**Use Cases:**
- Invoices shared via email/SMS
- QR codes on physical products
- Donation pages
- "Pay me" links on social media

---

## API Reference

### Create Payment Request

**Endpoint:** `POST /payments/requests`

**Authentication:** Required (Merchant JWT)

**Request:**
```json
{
  "amount": 100.50,
  "description": "Invoice #12345",
  "expiryMinutes": 60
}
```

**Response (Success):**
```json
{
  "success": true,
  "data": {
    "paymentRequestId": "c417fd66-c9a5-4813-b387-4208f45b8f89",
    "linkId": "jumasm/20251106/0001",
    "paymentUrl": "http://116.203.195.248/jumasm/20251106/0001",
    "expiresAt": "2025-11-06T16:29:44.523Z"
  }
}
```

**Errors:**
```json
// Invalid amount
{"error": "Amount must be greater than 0"}

// Invalid expiry
{"error": "Invalid expiry time. Must be 15, 30, 60, or 120 minutes"}

// Daily limit
{"error": "Daily order limit reached (9999)"}

// Race condition
{"error": "Order number conflict. Please try again."}
```

---

### List Payment Requests

**Endpoint:** `GET /payments/requests`

**Authentication:** Required (Merchant JWT)

**Query Parameters:**
- `status` (optional) - Filter by status (PENDING, EXPIRED, SETTLED, etc.)
- `limit` (optional) - Default: 50, Max: 100
- `offset` (optional) - For pagination

**Example:**
```bash
GET /payments/requests?status=PENDING&limit=10&offset=0
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "linkId": "jumasm/20251106/0002",
      "amountFiat": "50",
      "currencyFiat": "USD",
      "description": "Second test payment",
      "status": "PENDING",
      "expiresAt": "2025-11-06T16:31:04.561Z",
      "createdBy": "merchant",
      "createdAt": "2025-11-06T15:31:04.563Z"
    }
  ],
  "total": 2,
  "limit": 50,
  "offset": 0
}
```

---

### Get Payment Request

**Endpoint:** `GET /payments/{slug}/{date}/{orderNumber}`

**Authentication:** None (Public)

**Example:**
```bash
GET /payments/jumasm/20251106/0001
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "c417fd66-c9a5-4813-b387-4208f45b8f89",
    "merchantId": "f941fe7d-4040-4ac9-bef0-ddcdc52a902a",
    "orderDate": "20251106",
    "orderNumber": 1,
    "linkId": "jumasm/20251106/0001",
    "amountFiat": "100.5",
    "currencyFiat": "USD",
    "description": "Test payment",
    "expiryMinutes": 60,
    "expiresAt": "2025-11-06T16:29:44.523Z",
    "createdBy": "merchant",
    "status": "PENDING",
    "merchant": {
      "businessName": "Test Business",
      "slug": "jumasm"
    }
  }
}
```

**Auto-Expiry:**
- If `expiresAt` has passed and status is `PENDING`
- Status automatically updates to `EXPIRED`
- Updated status returned in response

---

## Rate Limiting

### Buyer Rate Limiting

**Purpose:** Prevent abuse of buyer-initiated payment creation

**Mechanism:**
- Track orders per IP address per merchant
- Default limit: 1 order per hour
- Configurable by merchant: `maxBuyerOrdersPerHour`
- Storage: Redis with 1-hour TTL

**Implementation:**
```
Key: buyer-orders:{merchantId}:{buyerIp}
Value: Count of orders created
TTL: 3600 seconds (1 hour)
```

**Example Flow:**
```
Buyer (IP 1.2.3.4) creates order → Count = 1
Buyer tries again → Rejected: "Rate limit exceeded"
After 1 hour → Count expires → Can create again
```

**Merchant Configuration:**
```
Default: maxBuyerOrdersPerHour = 1
Custom: Set in merchant settings (1-100)
```

**Error Response:**
```json
{
  "error": "Rate limit exceeded. Maximum 1 order(s) per hour."
}
```

### Merchant Rate Limiting

**None Applied:**
- Merchants are authenticated and trusted
- Can create unlimited payment requests
- Daily limit only: 9999 orders per day (per merchant)

---

## Timezone Handling

### Configuration

**Merchant Timezone:**
- Set during registration: Default `UTC`
- Change in settings: `/merchants/settings`
- Format: IANA timezone (e.g., `America/New_York`, `Europe/London`)

**Supported Timezones:**
- All IANA timezones supported
- JavaScript `Intl.DateTimeFormat` used
- Automatic DST handling

### Date Calculation

**Example: Merchant in EST (America/New_York)**
```javascript
// Current time: Nov 6, 2025 11:30 PM EST
getCurrentOrderDate("America/New_York")
// Returns: "20251106"

// Current time: Nov 7, 2025 12:01 AM EST (next day)
getCurrentOrderDate("America/New_York")
// Returns: "20251107"
```

**Implementation:**
```typescript
export function getCurrentOrderDate(timezone: string): string {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  
  const parts = formatter.formatToParts(now);
  const year = parts.find(p => p.type === 'year')!.value;
  const month = parts.find(p => p.type === 'month')!.value;
  const day = parts.find(p => p.type === 'day')!.value;
  
  return `${year}${month}${day}`;
}
```

### Midnight Reset

**Automatic:**
- No cron job needed
- Checked on-demand when creating orders
- If `orderDate` changes, order number resets to 0001

**Example:**
```
11:59 PM EST: Create order → jumasm/20251106/0003
12:01 AM EST: Create order → jumasm/20251107/0001  ← Reset!
```

---

## Expiry Management

### Expiry Options

**Merchant-Created:**
- 15 minutes
- 30 minutes
- 60 minutes (default)
- 120 minutes

**Buyer-Created:**
- Fixed: 60 minutes (no choice)

### Expiry Calculation
```typescript
const expiresAt = new Date(Date.now() + expiryMinutes * 60 * 1000);
```

**Example:**
```
Created: 2025-11-06 15:30:00 UTC
Expiry: 60 minutes
expiresAt: 2025-11-06 16:30:00 UTC
```

### Status Lifecycle
```
PENDING → Payment request active, waiting for payment
   ↓ (time passes, no payment)
EXPIRED → Time ran out, payment no longer accepted
   ↓ (customer pays anyway - edge case)
MONITORING → Payment detected, awaiting confirmations
   ↓ (confirmations received)
SETTLED → Payment confirmed and credited
```

**Other Statuses:**
- `UNDERPAID` - Customer sent less than required
- `OVERPAID` - Customer sent more (rare)
- `FAILED` - Technical error during processing

### Auto-Expiry

**Trigger:** When payment request is viewed

**Logic:**
```typescript
if (new Date() > paymentRequest.expiresAt && status === 'PENDING') {
  // Update status to EXPIRED
  await prisma.paymentRequest.update({
    where: { id: paymentRequest.id },
    data: { status: 'EXPIRED' },
  });
}
```

**Why on-demand?**
- No background jobs needed
- Efficient (only updates when accessed)
- Accurate (checks exact time)

---

## Examples

### Example 1: Create Payment Request

**Scenario:** Merchant creates invoice for $100
```bash
curl -X POST http://localhost:3000/payments/requests \
  -H "Authorization: Bearer <jwt-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 100.00,
    "description": "Invoice #12345",
    "expiryMinutes": 60
  }'
```

**Result:**
```
Link: http://116.203.195.248/jumasm/20251106/0001
Expires: 1 hour from now
```

---

### Example 2: Daily Order Sequence

**Scenario:** Merchant creates multiple orders throughout the day
```
10:00 AM: Create order → jumasm/20251106/0001
11:30 AM: Create order → jumasm/20251106/0002
02:45 PM: Create order → jumasm/20251106/0003
11:59 PM: Create order → jumasm/20251106/0004
12:01 AM: Create order → jumasm/20251107/0001  ← Reset!
```

---

### Example 3: Buyer Rate Limiting

**Scenario:** Buyer tries to create multiple orders
```
3:00 PM: Buyer creates order → Success (0001)
3:15 PM: Buyer tries again → Error: Rate limit exceeded
4:01 PM: Buyer tries again → Success (0002)
```

---

### Example 4: Expired Payment

**Scenario:** Customer tries to pay after expiry
```
Created: 3:00 PM, expires 4:00 PM
Customer visits at 4:30 PM
Status: EXPIRED
Action: Show "Payment link expired, please request new one"
```

---

### Example 5: Timezone Change

**Scenario:** Merchant moves to different timezone
```
Merchant in EST: jumasm/20251106/0001 (10 AM EST)
Change timezone to PST
Still Nov 6 in PST: jumasm/20251106/0002 (7 AM PST)
Midnight PST: jumasm/20251107/0001 (reset in PST)
```

---

## Database Schema

### PaymentRequest Table
```prisma
model PaymentRequest {
  id           String    @id @default(uuid())
  merchantId   String
  
  // Order identification
  orderDate    String    @db.VarChar(8)      // YYYYMMDD
  orderNumber  Int                            // 1-9999
  linkId       String    @unique             // slug/date/number
  
  // Amount
  amountFiat   Decimal   @db.Decimal(18, 6)
  currencyFiat String    @db.VarChar(3)
  description  String?
  
  // Expiry
  expiryMinutes Int      @default(60)
  expiresAt     DateTime
  
  // Tracking
  createdBy     String                        // "merchant" | "buyer"
  createdByIp   String?
  buyerNote     String?
  
  // Status
  status       String    @default("PENDING")
  
  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt

  @@unique([merchantId, orderDate, orderNumber])
  @@index([linkId])
  @@index([merchantId, orderDate])
  @@index([status, expiresAt])
}
```

### Key Indexes

**Performance Optimization:**
1. `linkId` - Fast lookups by payment URL
2. `merchantId + orderDate` - Daily order queries
3. `merchantId + orderDate + orderNumber` - Unique constraint
4. `status + expiresAt` - Expiry cleanup queries

---

## Architecture Notes

### Why Sequential Order Numbers?

**Advantages:**
- ✅ Human-readable (customers can reference "order 0042")
- ✅ Easy to track daily volume
- ✅ Predictable and memorable
- ✅ Works offline (no API dependency)

**Alternative Considered:**
- UUIDs: Not human-friendly, hard to communicate
- Random strings: Collision risk, not sequential

### Why Daily Reset?

**Advantages:**
- ✅ Manageable number range (0001-9999)
- ✅ Clear daily accounting
- ✅ Easier merchant reporting
- ✅ Natural business cycle alignment

**Business Benefits:**
- Daily reconciliation easier
- Clear performance metrics
- Historical tracking by date

### Why Timezone-Aware?

**Advantages:**
- ✅ Matches merchant's business hours
- ✅ Accurate daily reporting
- ✅ Better UX (orders grouped by business day)

**Example:**
```
Merchant in Tokyo (JST, UTC+9)
Nov 7, 12:01 AM JST = Nov 6, 3:01 PM UTC
Order date: 20251107 (Tokyo date, not UTC date)
```

### Why Rate Limit Buyers?

**Security:**
- Prevents DoS attacks
- Stops spam/abuse
- Protects merchant reputation

**Flexibility:**
- Merchant can adjust limit
- Per-merchant configuration
- Redis-based (fast, scalable)

---

## Production Checklist

Before deploying:

### Configuration
- [ ] Set `BASE_URL` in .env to production domain
- [ ] Configure proper timezone defaults
- [ ] Set appropriate rate limits

### Monitoring
- [ ] Track daily order counts per merchant
- [ ] Alert on daily limit approaches (e.g., 9000+ orders)
- [ ] Monitor expired payment requests
- [ ] Track buyer rate limit hits

### Database
- [ ] Ensure indexes are created
- [ ] Set up regular backups
- [ ] Monitor query performance

### Testing
- [ ] Test timezone edge cases (midnight, DST changes)
- [ ] Test concurrent order creation
- [ ] Test daily limit (9999 orders)
- [ ] Test buyer rate limiting
- [ ] Test expiry auto-update

---

**Built for scale, designed for simplicity.** 🚀
