import { SuperAdmin } from '../entities/SuperAdmin';
import { Email } from '../value-objects/Email';

/**
 * SuperAdmin Repository Interface
 */
export interface ISuperAdminRepository {
  /**
   * Find admin by ID
   */
  findById(id: string): Promise<SuperAdmin | null>;

  /**
   * Find admin by email
   */
  findByEmail(email: Email): Promise<SuperAdmin | null>;

  /**
   * Save admin (create or update)
   */
  save(admin: SuperAdmin): Promise<void>;

  /**
   * Count total admins
   */
  count(): Promise<number>;
}
