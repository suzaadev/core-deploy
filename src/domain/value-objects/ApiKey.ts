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
   * Returns both the ApiKey object (with hash) and the plaintext key to show user once
   */
  static async generate(): Promise<{ apiKey: ApiKey; plaintext: string }> {
    // Generate cryptographically secure random key: suzaa_live_32_random_bytes
    const randomBytes = crypto.randomBytes(32).toString('hex');
    const plaintext = `suzaa_live_${randomBytes}`;

    const hashedValue = await bcrypt.hash(plaintext, 10);

    return {
      apiKey: new ApiKey(hashedValue),
      plaintext,
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
    if (!plaintext || !plaintext.startsWith('suzaa_')) {
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
