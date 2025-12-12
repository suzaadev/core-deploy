import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { ValidationError } from '../../common/errors/AppError';

/**
 * ApiKey Value Object
 * Handles API key generation and verification
 */
export class ApiKey {
  private readonly hashedValue: string;

  private constructor(hashedValue: string) {
    this.hashedValue = hashedValue;
  }

  /**
   * Generate a new API key
   * Returns: apiKey object, plaintext key, and fingerprint (last 4-6 chars)
   */
  static async generate(): Promise<{ apiKey: ApiKey; plaintext: string; fingerprint: string }> {
    // Generate cryptographically secure random key: sza_live_<random>
    const randomBytes = crypto.randomBytes(32).toString('hex');
    const plaintext = `sza_live_${randomBytes}`;

    const hashedValue = await bcrypt.hash(plaintext, 10);
    
    // Extract fingerprint: last 4-6 characters
    const fingerprint = `...${plaintext.slice(-6)}`;

    return {
      apiKey: new ApiKey(hashedValue),
      plaintext,
      fingerprint,
    };
  }

  /**
   * Create ApiKey from already hashed value (for reconstitution from DB)
   */
  static fromHash(hashedValue: string): ApiKey {
    if (!hashedValue) {
      throw new ValidationError('API key hash is required');
    }
    return new ApiKey(hashedValue);
  }

  /**
   * Verify if plaintext API key matches this hashed key
   */
  async verify(plaintext: string): Promise<boolean> {
    if (!plaintext || !plaintext.startsWith('sza_live_')) {
      return false;
    }
    return bcrypt.compare(plaintext, this.hashedValue);
  }

  /**
   * Get the hashed value (for persistence)
   */
  getHash(): string {
    return this.hashedValue;
  }
}
