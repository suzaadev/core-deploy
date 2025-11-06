# SUZAA Core - Authentication Guide

This document explains the passwordless, PIN-based authentication system for both merchants and super admins.

## Table of Contents
1. [Merchant Authentication](#merchant-authentication)
2. [Super Admin Authentication](#super-admin-authentication)
3. [Security Features](#security-features)
4. [API Reference](#api-reference)

---

## Merchant Authentication

### Overview
Merchants use a **passwordless, frictionless** authentication system:
- ✅ No passwords to remember
- ✅ PIN-based verification via email
- ✅ Automatic slug generation (6 lowercase letters)
- ✅ JWT tokens for API access

### Registration Flow

#### 1. Register Account
```bash
POST /auth/register
Content-Type: application/json

{
  "email": "merchant@example.com",
  "businessName": "My Business",
  "defaultCurrency": "USD"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Registration successful. Please check your email for the verification PIN.",
  "data": {
    "merchantId": "uuid-here",
    "slug": "abcdef"
  }
}
```

**What happens:**
- System generates unique 6-letter slug (e.g., "abcdef")
- System generates 6-digit PIN (valid 10 minutes)
- PIN sent to email (currently logged to console)
- Merchant record created with `emailVerified: false`

#### 2. Verify PIN
```bash
POST /auth/verify
Content-Type: application/json

{
  "email": "merchant@example.com",
  "pin": "123456"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "merchant": {
      "id": "uuid-here",
      "slug": "abcdef",
      "email": "merchant@example.com",
      "businessName": "My Business"
    }
  }
}
```

**What happens:**
- PIN validated (max 5 attempts)
- PIN cleared from database
- `emailVerified` set to true
- JWT token issued (expires in 7 days)
- Audit log created

### Login Flow

#### 1. Request PIN
```bash
POST /auth/login
Content-Type: application/json

{
  "email": "merchant@example.com"
}
```

**Response:**
```json
{
  "success": true,
  "message": "If an account exists with this email, a PIN has been sent."
}
```

**What happens:**
- New 6-digit PIN generated
- PIN expires in 10 minutes
- Attempt counter reset to 0
- PIN sent to email
- Audit log created

#### 2. Verify PIN
Same as registration verification (step 2 above).

### Protected Routes

Use the JWT token to access protected merchant routes:
```bash
GET /auth/me
Authorization: Bearer <your-jwt-token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "uuid-here",
    "slug": "abcdef",
    "email": "merchant@example.com",
    "businessName": "My Business",
    "defaultCurrency": "USD",
    "settleTolerancePct": "2",
    "emailVerified": true,
    "createdAt": "2025-11-06T14:08:50.416Z",
    "lastLoginAt": "2025-11-06T14:11:01.283Z"
  }
}
```

---

## Super Admin Authentication

### Overview
Super admin uses the **same PIN-based system** as merchants, with critical differences:
- ✅ **One-time registration only** - Only first admin can register
- ✅ **Email locked** - Can only be changed via direct database access
- ✅ **Special JWT role** - Token includes `role: "super_admin"`
- ✅ **Merchant management powers** - Can suspend/unsuspend/delete merchants

### Registration Flow (ONE-TIME ONLY)

#### 1. Register Super Admin
```bash
POST /admin/register
Content-Type: application/json

{
  "email": "admin@suzaa.com",
  "name": "Super Admin"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Super admin registration successful. Please check your email for the verification PIN.",
  "data": {
    "adminId": "uuid-here"
  }
}
```

**Security:**
- ⚠️ This endpoint only works if NO super admin exists
- ⚠️ Second attempt returns: "Super admin already registered. Contact system administrator."
- ⚠️ Email is permanently locked (no slug, no password reset)

#### 2. Verify PIN
```bash
POST /admin/verify
Content-Type: application/json

{
  "email": "admin@suzaa.com",
  "pin": "123456"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "admin": {
      "id": "uuid-here",
      "email": "admin@suzaa.com",
      "name": "Super Admin"
    }
  }
}
```

**JWT Payload:**
```json
{
  "adminId": "uuid-here",
  "email": "admin@suzaa.com",
  "role": "super_admin",
  "iat": 1762439305,
  "exp": 1763044105
}
```

### Login Flow

Same as merchants:
1. POST /admin/login (request PIN)
2. POST /admin/verify (verify PIN, get token)

---

## Security Features

### PIN Security
- **6 digits** (100,000 - 999,999)
- **10-minute expiry** - Must be used within 10 minutes
- **Max 5 attempts** - PIN invalidated after 5 failed attempts
- **One-time use** - PIN cleared after successful verification
- **Reset on new request** - Requesting new PIN resets attempt counter

### Slug Generation (Merchants Only)
- **6 lowercase letters** (a-z)
- **Collision retry** - Up to 10 retries if slug already exists
- **Unique constraint** - Database enforces uniqueness
- **Public identifier** - Safe to share (like username)

### JWT Tokens
- **7-day expiry** - Tokens valid for 1 week
- **Stateless** - No server-side session storage
- **Role-based** - Admin tokens include `role: "super_admin"`
- **Signed** - HMAC-SHA256 with secret key

### Audit Logging
All authentication events are logged:
- `MERCHANT_REGISTERED`
- `LOGIN_PIN_REQUESTED`
- `LOGIN_SUCCESS`
- `MERCHANT_SUSPENDED`
- `MERCHANT_UNSUSPENDED`
- `MERCHANT_DELETED`

### Account Suspension
- Suspended merchants cannot request PINs
- Existing tokens remain valid (consider token blacklist for production)
- Super admin can suspend/unsuspend with reason tracking

---

## API Reference

### Merchant Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | /auth/register | Public | Register new merchant |
| POST | /auth/login | Public | Request login PIN |
| POST | /auth/verify | Public | Verify PIN, get JWT |
| GET | /auth/me | JWT | Get current merchant info |

### Super Admin Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | /admin/register | Public | Register super admin (one-time) |
| POST | /admin/login | Public | Request admin login PIN |
| POST | /admin/verify | Public | Verify PIN, get admin JWT |

### Merchant Management (Admin Only)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | /merchants | Admin JWT | List all merchants |
| GET | /merchants/:id | Admin JWT | Get merchant details |
| POST | /merchants/:id/suspend | Admin JWT | Suspend merchant |
| POST | /merchants/:id/unsuspend | Admin JWT | Unsuspend merchant |
| DELETE | /merchants/:id | Admin JWT | Delete merchant (requires confirmation) |

---

## Error Responses

### Common Errors

**Invalid Email:**
```json
{
  "error": "Invalid email format"
}
```

**Suspended Account:**
```json
{
  "error": "Account suspended. Please contact support."
}
```

**Expired PIN:**
```json
{
  "error": "PIN expired. Please request a new one."
}
```

**Invalid PIN:**
```json
{
  "error": "Invalid email or PIN"
}
```

**Too Many Attempts:**
```json
{
  "error": "Too many failed attempts. Please request a new PIN."
}
```

**Invalid Token:**
```json
{
  "error": "Invalid token"
}
```

**Expired Token:**
```json
{
  "error": "Token expired"
}
```

---

## Production Checklist

Before deploying to production:

### Email Integration
- [ ] Integrate real email service (SendGrid, Mailgun, AWS SES)
- [ ] Update `sendPinToEmail()` in `src/domain/utils/auth.ts`
- [ ] Configure email templates
- [ ] Set up email rate limiting

### Security Enhancements
- [ ] Generate strong secrets in `.env` (use `openssl rand -hex 32`)
- [ ] Enable HTTPS/TLS
- [ ] Implement rate limiting on auth endpoints
- [ ] Add CAPTCHA for public endpoints
- [ ] Consider token blacklist for suspended accounts
- [ ] Set up WAF (Web Application Firewall)

### Monitoring
- [ ] Set up failed login attempt monitoring
- [ ] Alert on multiple failed PIN attempts
- [ ] Monitor audit logs for suspicious activity
- [ ] Track PIN expiry rates

### Compliance
- [ ] Add GDPR-compliant privacy policy
- [ ] Implement data deletion requests
- [ ] Set up data retention policies
- [ ] Document data processing agreements

---

## Testing Examples

### Test Merchant Registration
```bash
# 1. Register
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","businessName":"Test Co","defaultCurrency":"USD"}'

# 2. Check console for PIN
# Output: PIN: 123456

# 3. Verify PIN
curl -X POST http://localhost:3000/auth/verify \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","pin":"123456"}'

# 4. Use token
curl -X GET http://localhost:3000/auth/me \
  -H "Authorization: Bearer <your-token-here>"
```

### Test Super Admin
```bash
# 1. Register (one-time only)
curl -X POST http://localhost:3000/admin/register \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@suzaa.com","name":"Admin"}'

# 2. Verify PIN
curl -X POST http://localhost:3000/admin/verify \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@suzaa.com","pin":"123456"}'

# 3. List merchants
curl -X GET http://localhost:3000/merchants \
  -H "Authorization: Bearer <admin-token>"

# 4. Suspend merchant
curl -X POST http://localhost:3000/merchants/<merchant-id>/suspend \
  -H "Authorization: Bearer <admin-token>" \
  -H "Content-Type: application/json" \
  -d '{"reason":"Policy violation"}'
```

---

## Architecture Notes

### Why Passwordless?

1. **Better UX** - No password to forget
2. **Higher Security** - No password to steal
3. **Simpler** - No password reset flow needed
4. **Modern** - Following industry best practices

### Why 6-Letter Slugs?

- **308,915,776 combinations** (26^6) - Collision-resistant
- **Human-readable** - Easy to share and remember
- **URL-friendly** - No special characters
- **Short** - Fits in URLs and UIs nicely

### Why 10-Minute PIN Expiry?

- **Balance** - Enough time to check email, not too long to be risky
- **Security** - Limits window for PIN interception
- **UX** - Most users check email within minutes

---

**Built with security and simplicity in mind.** 🔐
