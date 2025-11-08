import { Email } from '../value-objects/Email';
import { PIN } from '../value-objects/PIN';
import { DomainEvent, AdminSuspended } from '../events/DomainEvent';
import { ForbiddenError, ValidationError } from '../../common/errors/AppError';

export interface SuperAdminProps {
  id: string;
  email: Email;
  name: string;
  currentPin?: PIN;
  pinExpiresAt?: Date;
  pinAttempts: number;
  emailVerified: boolean;
  suspendedAt?: Date;
  lastLoginAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * SuperAdmin Entity
 * Represents system administrators with elevated privileges
 */
export class SuperAdmin {
  private props: SuperAdminProps;
  private domainEvents: DomainEvent[] = [];

  private constructor(props: SuperAdminProps) {
    this.props = props;
  }

  static create(props: SuperAdminProps): SuperAdmin {
    if (!props.name || props.name.trim().length < 2) {
      throw new ValidationError('Admin name must be at least 2 characters');
    }

    return new SuperAdmin(props);
  }

  // Getters
  getId(): string {
    return this.props.id;
  }

  getEmail(): Email {
    return this.props.email;
  }

  getName(): string {
    return this.props.name;
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

  isEmailVerified(): boolean {
    return this.props.emailVerified;
  }

  isSuspended(): boolean {
    return this.props.suspendedAt !== undefined && this.props.suspendedAt !== null;
  }

  getSuspendedAt(): Date | undefined {
    return this.props.suspendedAt;
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
   * Check if admin can perform actions
   */
  canPerformActions(): boolean {
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
      throw new ForbiddenError('Cannot set PIN for suspended admin');
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
      return;
    }

    this.props.emailVerified = true;
    this.props.updatedAt = new Date();
  }

  /**
   * Suspend admin account
   */
  suspend(reason: string): void {
    if (this.isSuspended()) {
      throw new ValidationError('Admin is already suspended');
    }

    this.props.suspendedAt = new Date();
    this.props.updatedAt = new Date();

    this.domainEvents.push(new AdminSuspended(this.props.id, reason));
  }
}
