import { IPaymentRequestRepository } from '../../domain/repositories/IPaymentRequestRepository';
import { PaymentRequest, PaymentRequestProps, PaymentStatus, SettlementStatus } from '../../domain/entities/PaymentRequest';
import { Money } from '../../domain/value-objects/Money';
import { PrismaClient } from '@prisma/client';

/**
 * Prisma implementation of PaymentRequest Repository
 */
export class PrismaPaymentRequestRepository implements IPaymentRequestRepository {
  constructor(private prisma: PrismaClient) {}

  async findById(id: string): Promise<PaymentRequest | null> {
    const data = await this.prisma.paymentRequest.findUnique({
      where: { id },
    });

    if (!data) {
      return null;
    }

    return this.toDomain(data);
  }

  async findByLinkId(linkId: string): Promise<PaymentRequest | null> {
    const data = await this.prisma.paymentRequest.findUnique({
      where: { linkId },
    });

    if (!data) {
      return null;
    }

    return this.toDomain(data);
  }

  async save(paymentRequest: PaymentRequest): Promise<void> {
    const data = this.toPersistence(paymentRequest);

    await this.prisma.paymentRequest.upsert({
      where: { id: paymentRequest.getId() },
      create: data,
      update: data,
    });

    paymentRequest.clearDomainEvents();
  }

  async findByMerchantId(
    merchantId: string,
    filters?: {
      status?: PaymentStatus;
      settlementStatus?: SettlementStatus;
      limit?: number;
      offset?: number;
    },
  ): Promise<PaymentRequest[]> {
    const where: any = { merchantId };

    if (filters?.status) {
      where.status = filters.status;
    }

    if (filters?.settlementStatus) {
      where.settlementStatus = filters.settlementStatus;
    }

    const data = await this.prisma.paymentRequest.findMany({
      where,
      take: filters?.limit,
      skip: filters?.offset,
      orderBy: { createdAt: 'desc' },
    });

    return data.map((d: any) => this.toDomain(d));
  }

  async findLastForMerchantOnDate(merchantId: string, orderDate: string): Promise<PaymentRequest | null> {
    const data = await this.prisma.paymentRequest.findFirst({
      where: { merchantId, orderDate },
      orderBy: { orderNumber: 'desc' },
    });

    if (!data) {
      return null;
    }

    return this.toDomain(data);
  }

  async countByMerchantId(merchantId: string, filters?: { status?: PaymentStatus }): Promise<number> {
    const where: any = { merchantId };

    if (filters?.status) {
      where.status = filters.status;
    }

    return this.prisma.paymentRequest.count({ where });
  }

  async findExpiredPending(): Promise<PaymentRequest[]> {
    const data = await this.prisma.paymentRequest.findMany({
      where: {
        status: PaymentStatus.PENDING,
        expiresAt: {
          lt: new Date(),
        },
      },
      take: 100, // Process in batches
    });

    return data.map((d: any) => this.toDomain(d));
  }

  /**
   * Map from Prisma model to Domain entity
   */
  private toDomain(data: any): PaymentRequest {
    const props: PaymentRequestProps = {
      id: data.id,
      merchantId: data.merchantId,
      orderDate: data.orderDate,
      orderNumber: data.orderNumber,
      linkId: data.linkId,
      amount: Money.create(data.amountFiat, data.currencyFiat),
      description: data.description || undefined,
      status: data.status as PaymentStatus,
      settlementStatus: data.settlementStatus as SettlementStatus,
      createdBy: data.createdBy,
      expiresAt: data.expiresAt,
      txHash: data.txHash || undefined,
      amountCrypto: data.amountCrypto ? parseFloat(data.amountCrypto.toString()) : undefined,
      cryptoCurrency: data.cryptoCurrency || undefined,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
    };

    return PaymentRequest.create(props);
  }

  /**
   * Map from Domain entity to Prisma model
   */
  private toPersistence(paymentRequest: PaymentRequest): any {
    return {
      id: paymentRequest.getId(),
      merchantId: paymentRequest.getMerchantId(),
      orderDate: paymentRequest.getOrderDate(),
      orderNumber: paymentRequest.getOrderNumber(),
      linkId: paymentRequest.getLinkId(),
      amountFiat: paymentRequest.getAmount().getAmount(),
      currencyFiat: paymentRequest.getAmount().getCurrency(),
      description: paymentRequest.getDescription() || null,
      status: paymentRequest.getStatus(),
      settlementStatus: paymentRequest.getSettlementStatus(),
      createdBy: paymentRequest.getCreatedBy(),
      expiresAt: paymentRequest.getExpiresAt(),
      txHash: paymentRequest.getTxHash() || null,
      amountCrypto: paymentRequest.getAmountCrypto() || null,
      cryptoCurrency: paymentRequest.getCryptoCurrency() || null,
      updatedAt: paymentRequest.getUpdatedAt(),
    };
  }
}
