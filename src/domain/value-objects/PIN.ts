import bcrypt from 'bcrypt';
import { ValidationError } from '../../common/errors/AppError';

/**
 * PIN Value Object
 * Handles PIN generation, validation, and hashing
 */
export class PIN {
  private readonly hashedValue: string;

  private constructor(hashedValue: string) {
    this.hashedValue = hashedValue;
  }

  /**
   * Generate a new random alphanumeric PIN
   */
  static async generate(length: number = 6): Promise<{ pin: PIN; plaintext: string }> {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let plaintext = '';

    for (let i = 0; i < length; i++) {
      const randomIndex = Math.floor(Math.random() * chars.length);
      plaintext += chars[randomIndex];
    }

    const hashedValue = await bcrypt.hash(plaintext, 10);
    return {
      pin: new PIN(hashedValue),
      plaintext,
    };
  }

  /**
   * Create PIN from already hashed value (for reconstitution from DB)
   */
  static fromHash(hashedValue: string): PIN {
    if (!hashedValue) {
      throw new ValidationError('PIN hash is required');
    }
    return new PIN(hashedValue);
  }

  /**
   * Create PIN by hashing a plaintext value
   */
  static async fromPlaintext(plaintext: string): Promise<PIN> {
    if (!plaintext || plaintext.length < 4) {
      throw new ValidationError('PIN must be at least 4 characters');
    }
    const hashedValue = await bcrypt.hash(plaintext, 10);
    return new PIN(hashedValue);
  }

  /**
   * Verify if plaintext PIN matches this hashed PIN
   */
  async verify(plaintext: string): Promise<boolean> {
    if (!plaintext) {
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
