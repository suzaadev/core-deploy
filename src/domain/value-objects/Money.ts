import { ValidationError } from '../../common/errors/AppError';
import { Decimal } from '@prisma/client/runtime/library';

/**
 * Money Value Object
 * Represents monetary amounts with currency
 */
export class Money {
  private readonly amount: Decimal;
  private readonly currency: string;

  private constructor(amount: Decimal, currency: string) {
    this.amount = amount;
    this.currency = currency;
  }

  static create(amount: number | string | Decimal, currency: string): Money {
    if (amount === null || amount === undefined) {
      throw new ValidationError('Amount is required');
    }

    let decimalAmount: Decimal;
    if (typeof amount === 'number') {
      if (amount < 0) {
        throw new ValidationError('Amount must be non-negative');
      }
      if (amount > 1000000000) {
        throw new ValidationError('Amount exceeds maximum allowed');
      }
      decimalAmount = new Decimal(amount);
    } else if (typeof amount === 'string') {
      try {
        decimalAmount = new Decimal(amount);
        if (decimalAmount.isNegative()) {
          throw new ValidationError('Amount must be non-negative');
        }
      } catch {
        throw new ValidationError('Invalid amount format');
      }
    } else {
      decimalAmount = amount;
    }

    if (!currency || typeof currency !== 'string') {
      throw new ValidationError('Currency is required');
    }

    const upperCurrency = currency.toUpperCase().trim();
    if (upperCurrency.length !== 3) {
      throw new ValidationError('Currency must be a 3-letter code');
    }

    return new Money(decimalAmount, upperCurrency);
  }

  getAmount(): Decimal {
    return this.amount;
  }

  getCurrency(): string {
    return this.currency;
  }

  toNumber(): number {
    return this.amount.toNumber();
  }

  toString(): string {
    return `${this.amount.toFixed(2)} ${this.currency}`;
  }

  equals(other: Money): boolean {
    return this.amount.equals(other.amount) && this.currency === other.currency;
  }

  add(other: Money): Money {
    if (this.currency !== other.currency) {
      throw new ValidationError('Cannot add money with different currencies');
    }
    return new Money(this.amount.add(other.amount), this.currency);
  }

  subtract(other: Money): Money {
    if (this.currency !== other.currency) {
      throw new ValidationError('Cannot subtract money with different currencies');
    }
    const result = this.amount.sub(other.amount);
    if (result.isNegative()) {
      throw new ValidationError('Subtraction would result in negative amount');
    }
    return new Money(result, this.currency);
  }

  multiply(factor: number): Money {
    if (factor < 0) {
      throw new ValidationError('Cannot multiply by negative factor');
    }
    return new Money(this.amount.mul(factor), this.currency);
  }
}
