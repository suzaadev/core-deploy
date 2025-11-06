import { prisma } from '../../infrastructure/database/client';
import { config } from '../../config';
import { getCurrentOrderDate, getNextOrderNumber, generateLinkId } from '../../domain/utils/orderNumber';
import { canBuyerCreateOrder, recordBuyerOrder } from '../../domain/utils/buyerRateLimit';

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
    expiryMinutes = 60,
    createdBy,
    buyerIp,
    buyerNote,
  } = input;

  if (amountFiat <= 0) {
    return { success: false, message: 'Amount must be greater than 0' };
  }

  const validExpiries = [15, 30, 60, 120];
  if (!validExpiries.includes(expiryMinutes)) {
    return { success: false, message: 'Invalid expiry time. Must be 15, 30, 60, or 120 minutes' };
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

  try {
    const orderDate = getCurrentOrderDate(merchant.timezone);
    const orderNumber = await getNextOrderNumber(merchantId, orderDate);
    const linkId = generateLinkId(merchant.slug, orderDate, orderNumber);
    const expiresAt = new Date(Date.now() + expiryMinutes * 60 * 1000);

    const paymentRequest = await prisma.paymentRequest.create({
      data: {
        merchantId,
        orderDate,
        orderNumber,
        linkId,
        amountFiat,
        currencyFiat: merchant.defaultCurrency,
        description,
        expiryMinutes,
        expiresAt,
        createdBy,
        createdByIp: buyerIp,
        buyerNote,
        status: 'PENDING',
      },
    });

    if (createdBy === 'buyer' && buyerIp) {
      await recordBuyerOrder(merchantId, buyerIp);
    }

    await prisma.auditLog.create({
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
    console.error('Create payment request error:', error);
    
    if (error.code === 'P2002') {
      return {
        success: false,
        message: 'Order number conflict. Please try again.',
      };
    }

    return {
      success: false,
      message: 'Failed to create payment request',
    };
  }
}
