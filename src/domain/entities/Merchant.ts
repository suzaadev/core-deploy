import { Email } from '../value-objects/Email';
import { PIN } from '../value-objects/PIN';
import { ApiKey } from '../value-objects/ApiKey';
import { DomainEvent, MerchantSuspended, MerchantUnsuspended, MerchantEmailVerified } from '../events/DomainEvent';
import { ForbiddenError, ValidationError } from '../../common/errors/AppError';

export interface MerchantProps {
  id: string;
  slug: string;
  email: Email;
  businessName: string;
  defaultCurrency: string;
  timezone: string;
  maxBuyerOrdersPerHour: number;
  settleTolerancePct: number;
  allowUnsolicitedPayments: boolean;
  currentPin?: PIN;
  pinExpiresAt?: Date;
  pinAttempts: number;
  apiKey?: ApiKey;
  webhookSecret: string;
  emailVerified: boolean;
  suspendedAt?: Date;
  suspendedBy?: string;
  suspendedReason?: string;
  lastLoginAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Merchant Aggregate Root
 * Encapsulates all business logic related to merchants
 */
export class Merchant {
  private props: MerchantProps;
  private domainEvents: DomainEvent[] = [];

  private constructor(props: MerchantProps) {
    this.props = props;
  }

  static create(props: MerchantProps): Merchant {
    // Validate business rules
    if (!props.businessName || props.businessName.trim().length < 2) {
      throw new ValidationError('Business name must be at least 2 characters');
    }

    if (props.maxBuyerOrdersPerHour < 1 || props.maxBuyerOrdersPerHour > 100) {
      throw new ValidationError('Max buyer orders per hour must be between 1 and 100');
    }

    return new Merchant(props);
  }

  // Getters
  getId(): string {
    return this.props.id;
  }

  getSlug(): string {
    return this.props.slug;
  }

  getEmail(): Email {
    return this.props.email;
  }

  getBusinessName(): string {
    return this.props.businessName;
  }

  getDefaultCurrency(): string {
    return this.props.defaultCurrency;
  }

  getTimezone(): string {
    return this.props.timezone;
  }

  getMaxBuyerOrdersPerHour(): number {
    return this.props.maxBuyerOrdersPerHour;
  }

  getSettleTolerancePct(): number {
    return this.props.settleTolerancePct;
  }

  getAllowUnsolicitedPayments(): boolean {
    return this.props.allowUnsolicitedPayments;
  }

  getCurrentPin(): PIN | undefined {
    return this.props.currentPin;
  }

  getPinExpiresAt(): Date | undefined {
    return this.props.pinExpiresAt;
  }

  getPinAttempts(): number {
    return this.props.pinAttempts;
  }

  getApiKey(): ApiKey | undefined {
    return this.props.apiKey;
  }

  getWebhookSecret(): string {
    return this.props.webhookSecret;
  }

  isEmailVerified(): boolean {
    return this.props.emailVerified;
  }

  isSuspended(): boolean {
    return this.props.suspendedAt !== undefined && this.props.suspendedAt !== null;
  }

  getSuspendedAt(): Date | undefined {
    return this.props.suspendedAt;
  }

  getSuspendedBy(): string | undefined {
    return this.props.suspendedBy;
  }

  getSuspendedReason(): string | undefined {
    return this.props.suspendedReason;
  }

  getLastLoginAt(): Date | undefined {
    return this.props.lastLoginAt;
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
   * Check if merchant can accept payments
   */
  canAcceptPayments(): boolean {
    return !this.isSuspended() && this.isEmailVerified();
  }

  /**
   * Check if PIN is valid and not expired
   */
  isPinValid(): boolean {
    if (!this.props.currentPin || !this.props.pinExpiresAt) {
      return false;
    }
    return new Date() < this.props.pinExpiresAt;
  }

  /**
   * Check if account is locked due to too many PIN attempts
   */
  isPinLocked(): boolean {
    return this.props.pinAttempts >= 5;
  }

  /**
   * Set a new PIN for login
   */
  setPin(pin: PIN, expiresAt: Date): void {
    if (this.isSuspended()) {
      throw new ForbiddenError('Cannot set PIN for suspended merchant');
    }

    this.props.currentPin = pin;
    this.props.pinExpiresAt = expiresAt;
    this.props.pinAttempts = 0;
    this.props.updatedAt = new Date();
  }

  /**
   * Increment PIN attempts
   */
  incrementPinAttempts(): void {
    this.props.pinAttempts += 1;
    this.props.updatedAt = new Date();
  }

  /**
   * Reset PIN attempts after successful login
   */
  resetPinAttempts(): void {
    this.props.pinAttempts = 0;
    this.props.lastLoginAt = new Date();
    this.props.updatedAt = new Date();
  }

  /**
   * Verify email
   */
  verifyEmail(): void {
    if (this.props.emailVerified) {
      return; // Already verified
    }

    this.props.emailVerified = true;
    this.props.updatedAt = new Date();

    this.domainEvents.push(new MerchantEmailVerified(this.props.id));
  }

  /**
   * Suspend merchant account
   */
  suspend(reason: string, suspendedBy: string): void {
    if (this.isSuspended()) {
      throw new ValidationError('Merchant is already suspended');
    }

    if (!reason || reason.trim().length < 3) {
      throw new ValidationError('Suspension reason must be at least 3 characters');
    }

    this.props.suspendedAt = new Date();
    this.props.suspendedBy = suspendedBy;
    this.props.suspendedReason = reason.trim();
    this.props.updatedAt = new Date();

    this.domainEvents.push(new MerchantSuspended(this.props.id, reason, suspendedBy));
  }

  /**
   * Unsuspend merchant account
   */
  unsuspend(unsuspendedBy: string): void {
    if (!this.isSuspended()) {
      throw new ValidationError('Merchant is not suspended');
    }

    this.props.suspendedAt = undefined;
    this.props.suspendedBy = undefined;
    this.props.suspendedReason = undefined;
    this.props.updatedAt = new Date();

    this.domainEvents.push(new MerchantUnsuspended(this.props.id, unsuspendedBy));
  }

  /**
   * Set API key for programmatic access
   */
  setApiKey(apiKey: ApiKey): void {
    if (this.isSuspended()) {
      throw new ForbiddenError('Cannot set API key for suspended merchant');
    }

    this.props.apiKey = apiKey;
    this.props.updatedAt = new Date();
  }

  /**
   * Update business settings
   */
  updateSettings(settings: {
    businessName?: string;
    defaultCurrency?: string;
    timezone?: string;
    maxBuyerOrdersPerHour?: number;
    settleTolerancePct?: number;
    allowUnsolicitedPayments?: boolean;
  }): void {
    if (this.isSuspended()) {
      throw new ForbiddenError('Cannot update settings for suspended merchant');
    }

    if (settings.businessName !== undefined) {
      if (settings.businessName.trim().length < 2) {
        throw new ValidationError('Business name must be at least 2 characters');
      }
      this.props.businessName = settings.businessName.trim();
    }

    if (settings.defaultCurrency !== undefined) {
      if (settings.defaultCurrency.length !== 3) {
        throw new ValidationError('Currency must be a 3-letter code');
      }
      this.props.defaultCurrency = settings.defaultCurrency.toUpperCase();
    }

    if (settings.timezone !== undefined) {
      this.props.timezone = settings.timezone;
    }

    if (settings.maxBuyerOrdersPerHour !== undefined) {
      if (settings.maxBuyerOrdersPerHour < 1 || settings.maxBuyerOrdersPerHour > 100) {
        throw new ValidationError('Max buyer orders per hour must be between 1 and 100');
      }
      this.props.maxBuyerOrdersPerHour = settings.maxBuyerOrdersPerHour;
    }

    if (settings.settleTolerancePct !== undefined) {
      if (settings.settleTolerancePct < 0 || settings.settleTolerancePct > 20) {
        throw new ValidationError('Settle tolerance must be between 0 and 20 percent');
      }
      this.props.settleTolerancePct = settings.settleTolerancePct;
    }

    if (settings.allowUnsolicitedPayments !== undefined) {
      this.props.allowUnsolicitedPayments = settings.allowUnsolicitedPayments;
    }

    this.props.updatedAt = new Date();
  }
}
