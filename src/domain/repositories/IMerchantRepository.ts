import { Merchant } from '../entities/Merchant';
import { Email } from '../value-objects/Email';

/**
 * Merchant Repository Interface
 * Abstracts data access for Merchant aggregate
 */
export interface IMerchantRepository {
  /**
   * Find merchant by ID
   */
  findById(id: string): Promise<Merchant | null>;

  /**
   * Find merchant by email
   */
  findByEmail(email: Email): Promise<Merchant | null>;

  /**
   * Find merchant by slug
   */
  findBySlug(slug: string): Promise<Merchant | null>;

  /**
   * Find merchant by Supabase auth user id
   */
  findByAuthUserId(authUserId: string): Promise<Merchant | null>;

  /**
   * Find merchant by API key hash
   */
  findByApiKeyHash(apiKeyHash: string): Promise<Merchant | null>;

  /**
   * Save merchant (create or update)
   */
  save(merchant: Merchant): Promise<void>;

  /**
   * Delete merchant
   */
  delete(id: string): Promise<void>;

  /**
   * Find all merchants with optional filters
   */
  findAll(filters?: {
    suspended?: boolean;
    emailVerified?: boolean;
    limit?: number;
    offset?: number;
  }): Promise<Merchant[]>;

  /**
   * Count merchants with optional filters
   */
  count(filters?: { suspended?: boolean; emailVerified?: boolean }): Promise<number>;
}
