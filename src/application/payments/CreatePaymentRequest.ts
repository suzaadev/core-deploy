import { prisma } from '../../infrastructure/database/client';
import { config } from '../../config';
import { getCurrentOrderDate, getNextOrderNumber, generateLinkId } from '../../domain/utils/orderNumber';
import { canBuyerCreateOrder, recordBuyerOrder } from '../../domain/utils/buyerRateLimit';
import { DateTime } from 'luxon';
import { Prisma } from '@prisma/client';

class MonthlyLimitExceededError extends Error {
  limit: number;

  constructor(limit: number) {
    super('MONTHLY_LINK_LIMIT_REACHED');
    this.limit = limit;
  }
}

interface CreatePaymentRequestInput {
  merchantId: string;
  amountFiat: number;
  description?: string;
  expiryMinutes?: number;
  createdBy: 'merchant' | 'buyer';
  buyerIp?: string;
  buyerNote?: string;
}

interface CreatePaymentRequestOutput {
  success: boolean;
  paymentRequestId?: string;
  linkId?: string;
  paymentUrl?: string;
  expiresAt?: Date;
  message: string;
}

export async function createPaymentRequest(
  input: CreatePaymentRequestInput
): Promise<CreatePaymentRequestOutput> {
  const {
    merchantId,
    amountFiat,
    description,
    expiryMinutes,
    createdBy,
    buyerIp,
    buyerNote,
  } = input;

  if (amountFiat <= 0) {
    return { success: false, message: 'Amount must be greater than 0' };
  }

  const merchant = await prisma.merchant.findUnique({
    where: { id: merchantId },
    select: {
      id: true,
      slug: true,
      timezone: true,
      defaultCurrency: true,
      maxBuyerOrdersPerHour: true,
      suspendedAt: true,
      paymentLinkMonthlyLimit: true,
      defaultPaymentExpiryMinutes: true,
    },
  });

  if (!merchant) {
    return { success: false, message: 'Merchant not found' };
  }

  if (merchant.suspendedAt) {
    return { success: false, message: 'Merchant account suspended' };
  }

  if (createdBy === 'buyer' && buyerIp) {
    const rateLimit = await canBuyerCreateOrder(
      merchantId,
      buyerIp,
      merchant.maxBuyerOrdersPerHour
    );

    if (!rateLimit.allowed) {
      return {
        success: false,
        message: `Rate limit exceeded. Maximum ${merchant.maxBuyerOrdersPerHour} order(s) per hour.`,
      };
    }
  }

  const timezone = merchant.timezone || 'UTC';
  const nowInZone = DateTime.now().setZone(timezone);
  const monthStartUtc = nowInZone.startOf('month').toUTC();
  const nextMonthStartUtc = monthStartUtc.plus({ months: 1 });
  const allowedExpiries = [15, 30, 60, 120];
  const effectiveExpiry = expiryMinutes ?? merchant.defaultPaymentExpiryMinutes ?? 60;

  if (!allowedExpiries.includes(effectiveExpiry)) {
    return { success: false, message: 'Invalid expiry time. Must be 15, 30, 60, or 120 minutes' };
  }

  try {
    const { paymentRequest, linkId, expiresAt } = await prisma.$transaction(
      async (tx) => {
        if (merchant.paymentLinkMonthlyLimit > 0) {
          const monthlyCount = await tx.paymentRequest.count({
            where: {
              merchantId,
              createdAt: {
                gte: monthStartUtc.toJSDate(),
                lt: nextMonthStartUtc.toJSDate(),
              },
            },
          });

          if (monthlyCount >= merchant.paymentLinkMonthlyLimit) {
            throw new MonthlyLimitExceededError(merchant.paymentLinkMonthlyLimit);
          }
        }

        const orderDate = getCurrentOrderDate(merchant.timezone);
        const orderNumber = await getNextOrderNumber(merchantId, orderDate, tx);
        const linkId = generateLinkId(merchant.slug, orderDate, orderNumber);
        const expiresAt = new Date(Date.now() + effectiveExpiry * 60 * 1000);

        const paymentRequest = await tx.paymentRequest.create({
          data: {
            merchantId,
            orderDate,
            orderNumber,
            linkId,
            amountFiat,
            currencyFiat: merchant.defaultCurrency,
            description,
            expiryMinutes: effectiveExpiry,
            expiresAt,
            createdBy,
            createdByIp: buyerIp,
            buyerNote,
            status: 'PENDING',
          },
        });

        await tx.auditLog.create({
          data: {
            merchantId,
            action: 'PAYMENT_REQUEST_CREATED',
            resourceId: paymentRequest.id,
            payload: {
              linkId,
              createdBy,
              amountFiat,
            },
          },
        });

        return { paymentRequest, linkId, expiresAt };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      }
    );

    if (createdBy === 'buyer' && buyerIp) {
      await recordBuyerOrder(merchantId, buyerIp);
    }

    const paymentUrl = `${config.baseUrl}/${linkId}`;

    return {
      success: true,
      paymentRequestId: paymentRequest.id,
      linkId,
      paymentUrl,
      expiresAt,
      message: 'Payment request created successfully',
    };
  } catch (error: any) {
    if (error instanceof MonthlyLimitExceededError) {
      return {
        success: false,
        message: `Monthly payment link limit reached. This merchant is allowed ${error.limit} link(s) per month.`,
      };
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return {
        success: false,
        message: 'Order number conflict. Please try again.',
      };
    }

    console.error('Create payment request error:', error);

    return {
      success: false,
      message: 'Failed to create payment request',
    };
  }
}
