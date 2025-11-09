import { IMerchantRepository } from '../../domain/repositories/IMerchantRepository';
import { Merchant, MerchantProps } from '../../domain/entities/Merchant';
import { Email } from '../../domain/value-objects/Email';
import { PIN } from '../../domain/value-objects/PIN';
import { ApiKey } from '../../domain/value-objects/ApiKey';
import { PrismaClient } from '@prisma/client';
import { NotFoundError } from '../../common/errors/AppError';

/**
 * Prisma implementation of Merchant Repository
 */
export class PrismaMerchantRepository implements IMerchantRepository {
  constructor(private prisma: PrismaClient) {}

  async findById(id: string): Promise<Merchant | null> {
    const data = await this.prisma.merchant.findUnique({
      where: { id },
    });

    if (!data) {
      return null;
    }

    return this.toDomain(data);
  }

  async findByEmail(email: Email): Promise<Merchant | null> {
    const data = await this.prisma.merchant.findUnique({
      where: { email: email.getValue() },
    });

    if (!data) {
      return null;
    }

    return this.toDomain(data);
  }

  async findBySlug(slug: string): Promise<Merchant | null> {
    const data = await this.prisma.merchant.findUnique({
      where: { slug },
    });

    if (!data) {
      return null;
    }

    return this.toDomain(data);
  }

  async findByApiKeyHash(apiKeyHash: string): Promise<Merchant | null> {
    const data = await this.prisma.merchant.findUnique({
      where: { apiKeyHash },
    });

    if (!data) {
      return null;
    }

    return this.toDomain(data);
  }

  async save(merchant: Merchant): Promise<void> {
    const data = this.toPersistence(merchant);

    await this.prisma.merchant.upsert({
      where: { id: merchant.getId() },
      create: data,
      update: data,
    });

    // Publish domain events (for now, we'll skip event publishing infrastructure)
    // In a full implementation, you'd have an event bus here
    merchant.clearDomainEvents();
  }

  async delete(id: string): Promise<void> {
    await this.prisma.merchant.delete({
      where: { id },
    });
  }

  async findAll(filters?: {
    suspended?: boolean;
    emailVerified?: boolean;
    limit?: number;
    offset?: number;
  }): Promise<Merchant[]> {
    const where: any = {};

    if (filters?.suspended !== undefined) {
      where.suspendedAt = filters.suspended ? { not: null } : null;
    }

    if (filters?.emailVerified !== undefined) {
      where.emailVerified = filters.emailVerified;
    }

    const data = await this.prisma.merchant.findMany({
      where,
      take: filters?.limit,
      skip: filters?.offset,
      orderBy: { createdAt: 'desc' },
    });

    return data.map((d: any) => this.toDomain(d));
  }

  async count(filters?: { suspended?: boolean; emailVerified?: boolean }): Promise<number> {
    const where: any = {};

    if (filters?.suspended !== undefined) {
      where.suspendedAt = filters.suspended ? { not: null } : null;
    }

    if (filters?.emailVerified !== undefined) {
      where.emailVerified = filters.emailVerified;
    }

    return this.prisma.merchant.count({ where });
  }

  /**
   * Map from Prisma model to Domain entity
   */
  private toDomain(data: any): Merchant {
    const props: MerchantProps = {
      id: data.id,
      slug: data.slug,
      email: Email.create(data.email),
      businessName: data.businessName,
      defaultCurrency: data.defaultCurrency,
      timezone: data.timezone,
      maxBuyerOrdersPerHour: data.maxBuyerOrdersPerHour,
      settleTolerancePct: parseFloat(data.settleTolerancePct.toString()),
      allowUnsolicitedPayments: data.allowUnsolicitedPayments,
      paymentLinkMonthlyLimit: data.paymentLinkMonthlyLimit,
      tier: data.tier,
      walletLimit: data.walletLimit,
      currentPin: data.currentPin ? PIN.fromHash(data.currentPin) : undefined,
      pinExpiresAt: data.pinExpiresAt || undefined,
      pinAttempts: data.pinAttempts,
      apiKey: data.apiKeyHash ? ApiKey.fromHash(data.apiKeyHash) : undefined,
      webhookSecret: data.webhookSecret,
      emailVerified: data.emailVerified,
      suspendedAt: data.suspendedAt || undefined,
      suspendedBy: data.suspendedBy || undefined,
      suspendedReason: data.suspendedReason || undefined,
      lastLoginAt: data.lastLoginAt || undefined,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
    };

    return Merchant.create(props);
  }

  /**
   * Map from Domain entity to Prisma model
   */
  private toPersistence(merchant: Merchant): any {
    return {
      id: merchant.getId(),
      slug: merchant.getSlug(),
      email: merchant.getEmail().getValue(),
      businessName: merchant.getBusinessName(),
      defaultCurrency: merchant.getDefaultCurrency(),
      timezone: merchant.getTimezone(),
      maxBuyerOrdersPerHour: merchant.getMaxBuyerOrdersPerHour(),
      settleTolerancePct: merchant.getSettleTolerancePct(),
      allowUnsolicitedPayments: merchant.getAllowUnsolicitedPayments(),
      paymentLinkMonthlyLimit: merchant.getPaymentLinkMonthlyLimit(),
      tier: merchant.getTier(),
      walletLimit: merchant.getWalletLimit(),
      currentPin: merchant.getCurrentPin()?.getHash() || null,
      pinExpiresAt: merchant.getPinExpiresAt() || null,
      pinAttempts: merchant.getPinAttempts(),
      apiKeyHash: merchant.getApiKey()?.getHash() || null,
      webhookSecret: merchant.getWebhookSecret(),
      emailVerified: merchant.isEmailVerified(),
      suspendedAt: merchant.getSuspendedAt() || null,
      suspendedBy: merchant.getSuspendedBy() || null,
      suspendedReason: merchant.getSuspendedReason() || null,
      lastLoginAt: merchant.getLastLoginAt() || null,
      updatedAt: merchant.getUpdatedAt(),
    };
  }
}
