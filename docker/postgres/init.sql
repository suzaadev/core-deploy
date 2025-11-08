-- Create schemas for SUZAA Core
-- This script runs once when the PostgreSQL container is first created

-- Create schemas
CREATE SCHEMA IF NOT EXISTS core;
CREATE SCHEMA IF NOT EXISTS payments;
CREATE SCHEMA IF NOT EXISTS events;
CREATE SCHEMA IF NOT EXISTS audit;
CREATE SCHEMA IF NOT EXISTS ops;

-- Grant permissions to the database user
GRANT ALL PRIVILEGES ON SCHEMA core TO suzaa_core;
GRANT ALL PRIVILEGES ON SCHEMA payments TO suzaa_core;
GRANT ALL PRIVILEGES ON SCHEMA events TO suzaa_core;
GRANT ALL PRIVILEGES ON SCHEMA audit TO suzaa_core;
GRANT ALL PRIVILEGES ON SCHEMA ops TO suzaa_core;

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Set default schema
ALTER DATABASE suzaa_core_db SET search_path TO core, payments, events, audit, ops, public;
