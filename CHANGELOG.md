
## [Unreleased] - 2024-11-07

### Added
- **Public Payment Creation System**
  - Public payment portal endpoint allowing buyers to create payment requests
  - Configurable rate limiting per merchant (Redis-based)
  - IP-based rate limiting with configurable max requests per hour
  - Public API endpoint: POST /public/create-payment
  - Merchant settings: `allowUnsolicitedPayments` and `maxBuyerOrdersPerHour`

- **Wallet Management System**
  - New Wallet model in database schema
  - Support for multiple blockchains (Solana, Ethereum, Bitcoin)
  - Wallet CRUD endpoints for authenticated merchants
  - Unique constraint on merchantId + blockchain + address
  - Enable/disable wallets without deletion

- **Real-time Pricing Infrastructure**
  - CoinGeckoPriceService integration with CoinGecko API
  - Real-time USD to crypto conversion (SOL, ETH, BTC)
  - Price caching with Redis (60-second TTL)
  - Public price endpoint: GET /prices/convert
  - Automatic price calculation on payment request retrieval

- **Merchant Self-Service Endpoints**
  - GET /merchants/me - Get current merchant info
  - PATCH /merchants/me - Update merchant settings
  - Self-service settings management for rate limiting

- **Enhanced Payment Display**
  - Payment requests now include wallet information
  - Real-time crypto amount calculation
  - Support for multiple wallets per merchant
  - Solana memo/reference number support

### Changed
- Updated Prisma schema with Wallet model
- Extended Merchant model with wallet relation
- Added wallet and pricing routes to main server
- Payment retrieval now includes crypto conversion

### Dependencies
- Added axios for HTTP requests to CoinGecko API

### Technical Details
- Rate limiting uses Redis with keys: `rate:public:{merchantId}:{ip}`
- Price caching uses Redis with keys: `price:{symbol}`
- All wallet operations require merchant authentication
- Public payment creation tracks creator IP for rate limiting

