/**
 * Base Domain Event
 * All domain events extend this
 */
export abstract class DomainEvent {
  public readonly occurredAt: Date;
  public readonly eventId: string;

  constructor() {
    this.occurredAt = new Date();
    this.eventId = crypto.randomUUID();
  }

  abstract getEventName(): string;
  abstract getAggregateId(): string;
}

/**
 * Merchant Domain Events
 */
export class MerchantRegistered extends DomainEvent {
  constructor(
    public readonly merchantId: string,
    public readonly email: string,
    public readonly businessName: string,
  ) {
    super();
  }

  getEventName(): string {
    return 'MerchantRegistered';
  }

  getAggregateId(): string {
    return this.merchantId;
  }
}

export class MerchantSuspended extends DomainEvent {
  constructor(
    public readonly merchantId: string,
    public readonly reason: string,
    public readonly suspendedBy: string,
  ) {
    super();
  }

  getEventName(): string {
    return 'MerchantSuspended';
  }

  getAggregateId(): string {
    return this.merchantId;
  }
}

export class MerchantUnsuspended extends DomainEvent {
  constructor(
    public readonly merchantId: string,
    public readonly unsuspendedBy: string,
  ) {
    super();
  }

  getEventName(): string {
    return 'MerchantUnsuspended';
  }

  getAggregateId(): string {
    return this.merchantId;
  }
}

export class MerchantEmailVerified extends DomainEvent {
  constructor(public readonly merchantId: string) {
    super();
  }

  getEventName(): string {
    return 'MerchantEmailVerified';
  }

  getAggregateId(): string {
    return this.merchantId;
  }
}

/**
 * Payment Domain Events
 */
export class PaymentRequestCreated extends DomainEvent {
  constructor(
    public readonly paymentRequestId: string,
    public readonly merchantId: string,
    public readonly amount: number,
    public readonly currency: string,
  ) {
    super();
  }

  getEventName(): string {
    return 'PaymentRequestCreated';
  }

  getAggregateId(): string {
    return this.paymentRequestId;
  }
}

export class PaymentReceived extends DomainEvent {
  constructor(
    public readonly paymentRequestId: string,
    public readonly txHash: string,
    public readonly amount: number,
  ) {
    super();
  }

  getEventName(): string {
    return 'PaymentReceived';
  }

  getAggregateId(): string {
    return this.paymentRequestId;
  }
}

export class PaymentSettled extends DomainEvent {
  constructor(
    public readonly paymentRequestId: string,
    public readonly settledBy: string,
  ) {
    super();
  }

  getEventName(): string {
    return 'PaymentSettled';
  }

  getAggregateId(): string {
    return this.paymentRequestId;
  }
}

/**
 * Admin Domain Events
 */
export class AdminRegistered extends DomainEvent {
  constructor(
    public readonly adminId: string,
    public readonly email: string,
  ) {
    super();
  }

  getEventName(): string {
    return 'AdminRegistered';
  }

  getAggregateId(): string {
    return this.adminId;
  }
}

export class AdminSuspended extends DomainEvent {
  constructor(
    public readonly adminId: string,
    public readonly reason: string,
  ) {
    super();
  }

  getEventName(): string {
    return 'AdminSuspended';
  }

  getAggregateId(): string {
    return this.adminId;
  }
}
