import { Money } from '../value-objects/Money';
import { DomainEvent, PaymentRequestCreated, PaymentReceived, PaymentSettled } from '../events/DomainEvent';
import { ValidationError, BadRequestError } from '../../common/errors/AppError';

export enum PaymentStatus {
  PENDING = 'PENDING',
  PAID = 'PAID',
  EXPIRED = 'EXPIRED',
  CANCELLED = 'CANCELLED',
}

export enum SettlementStatus {
  PENDING = 'PENDING',
  PAID = 'PAID',
  SETTLED = 'SETTLED',
  REJECTED = 'REJECTED',
  REISSUED = 'REISSUED',
}

export interface PaymentRequestProps {
  id: string;
  merchantId: string;
  orderDate: string;
  orderNumber: number;
  linkId: string;
  amount: Money;
  description?: string;
  status: PaymentStatus;
  settlementStatus: SettlementStatus;
  createdBy: string;
  expiresAt: Date;
  txHash?: string;
  amountCrypto?: number;
  cryptoCurrency?: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * PaymentRequest Entity
 * Represents a payment request created by a merchant
 */
export class PaymentRequest {
  private props: PaymentRequestProps;
  private domainEvents: DomainEvent[] = [];

  private constructor(props: PaymentRequestProps) {
    this.props = props;
  }

  static create(props: PaymentRequestProps): PaymentRequest {
    // Validate business rules
    if (!props.linkId || props.linkId.length === 0) {
      throw new ValidationError('Link ID is required');
    }

    if (props.orderNumber < 1 || props.orderNumber > 99999) {
      throw new ValidationError('Order number must be between 1 and 99999');
    }

    const payment = new PaymentRequest(props);

    payment.domainEvents.push(
      new PaymentRequestCreated(
        props.id,
        props.merchantId,
        props.amount.toNumber(),
        props.amount.getCurrency(),
      ),
    );

    return payment;
  }

  // Getters
  getId(): string {
    return this.props.id;
  }

  getMerchantId(): string {
    return this.props.merchantId;
  }

  getOrderDate(): string {
    return this.props.orderDate;
  }

  getOrderNumber(): number {
    return this.props.orderNumber;
  }

  getLinkId(): string {
    return this.props.linkId;
  }

  getAmount(): Money {
    return this.props.amount;
  }

  getDescription(): string | undefined {
    return this.props.description;
  }

  getStatus(): PaymentStatus {
    return this.props.status;
  }

  getSettlementStatus(): SettlementStatus {
    return this.props.settlementStatus;
  }

  getCreatedBy(): string {
    return this.props.createdBy;
  }

  getExpiresAt(): Date {
    return this.props.expiresAt;
  }

  getTxHash(): string | undefined {
    return this.props.txHash;
  }

  getAmountCrypto(): number | undefined {
    return this.props.amountCrypto;
  }

  getCryptoCurrency(): string | undefined {
    return this.props.cryptoCurrency;
  }

  getCreatedAt(): Date {
    return this.props.createdAt;
  }

  getUpdatedAt(): Date {
    return this.props.updatedAt;
  }

  getDomainEvents(): DomainEvent[] {
    return this.domainEvents;
  }

  clearDomainEvents(): void {
    this.domainEvents = [];
  }

  // Business Logic Methods

  /**
   * Check if payment request is expired
   */
  isExpired(): boolean {
    return new Date() > this.props.expiresAt;
  }

  /**
   * Check if payment can be accepted
   */
  canAcceptPayment(): boolean {
    return (
      this.props.status === PaymentStatus.PENDING &&
      !this.isExpired()
    );
  }

  /**
   * Mark payment as received
   */
  markAsPaid(txHash: string, amountCrypto: number, cryptoCurrency: string): void {
    if (!this.canAcceptPayment()) {
      throw new BadRequestError('Payment request cannot accept payments');
    }

    if (!txHash || txHash.trim().length === 0) {
      throw new ValidationError('Transaction hash is required');
    }

    if (amountCrypto <= 0) {
      throw new ValidationError('Crypto amount must be positive');
    }

    this.props.status = PaymentStatus.PAID;
    this.props.settlementStatus = SettlementStatus.PAID;
    this.props.txHash = txHash.trim();
    this.props.amountCrypto = amountCrypto;
    this.props.cryptoCurrency = cryptoCurrency.toUpperCase();
    this.props.updatedAt = new Date();

    this.domainEvents.push(new PaymentReceived(this.props.id, txHash, amountCrypto));
  }

  /**
   * Mark payment as expired
   */
  markAsExpired(): void {
    if (this.props.status !== PaymentStatus.PENDING) {
      return; // Already processed
    }

    this.props.status = PaymentStatus.EXPIRED;
    this.props.updatedAt = new Date();
  }

  /**
   * Cancel payment request
   */
  cancel(): void {
    if (this.props.status !== PaymentStatus.PENDING) {
      throw new BadRequestError('Can only cancel pending payment requests');
    }

    this.props.status = PaymentStatus.CANCELLED;
    this.props.updatedAt = new Date();
  }

  /**
   * Update settlement status
   */
  updateSettlementStatus(newStatus: SettlementStatus, settledBy?: string): void {
    // Validate state transitions
    const validTransitions: Record<SettlementStatus, SettlementStatus[]> = {
      [SettlementStatus.PENDING]: [SettlementStatus.PAID, SettlementStatus.REJECTED],
      [SettlementStatus.PAID]: [SettlementStatus.SETTLED, SettlementStatus.REJECTED],
      [SettlementStatus.SETTLED]: [SettlementStatus.REISSUED],
      [SettlementStatus.REJECTED]: [SettlementStatus.REISSUED],
      [SettlementStatus.REISSUED]: [],
    };

    const allowedTransitions = validTransitions[this.props.settlementStatus];
    if (!allowedTransitions.includes(newStatus)) {
      throw new BadRequestError(
        `Invalid settlement status transition from ${this.props.settlementStatus} to ${newStatus}`,
      );
    }

    this.props.settlementStatus = newStatus;
    this.props.updatedAt = new Date();

    if (newStatus === SettlementStatus.SETTLED && settledBy) {
      this.domainEvents.push(new PaymentSettled(this.props.id, settledBy));
    }
  }
}
