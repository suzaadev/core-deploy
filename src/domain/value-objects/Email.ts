import validator from 'validator';
import { ValidationError } from '../../common/errors/AppError';

/**
 * Email Value Object
 * Ensures email validity and normalization throughout the domain
 */
export class Email {
  private readonly value: string;

  private constructor(email: string) {
    this.value = email;
  }

  static create(email: string): Email {
    if (!email || typeof email !== 'string') {
      throw new ValidationError('Email is required');
    }

    const trimmed = email.trim();

    if (trimmed.length > 254) {
      throw new ValidationError('Email must not exceed 254 characters');
    }

    if (!validator.isEmail(trimmed)) {
      throw new ValidationError('Invalid email format');
    }

    return new Email(trimmed.toLowerCase());
  }

  getValue(): string {
    return this.value;
  }

  equals(other: Email): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
