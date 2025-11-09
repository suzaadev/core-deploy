-- Add merchant tiering and monthly link limit columns
CREATE TYPE core."MerchantTier" AS ENUM ('TIER_1', 'TIER_2', 'TIER_3', 'TIER_4', 'TIER_5');

ALTER TABLE core."merchants"
  ADD COLUMN "payment_link_monthly_limit" INTEGER NOT NULL DEFAULT 100,
  ADD COLUMN "tier" core."MerchantTier" NOT NULL DEFAULT 'TIER_1';


