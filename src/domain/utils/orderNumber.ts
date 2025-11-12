import { DateTime } from 'luxon';
import { prisma } from '../../infrastructure/database/client';

export async function getNextOrderNumber(
  merchantId: string,
  orderDate: string,
  client: any = prisma
): Promise<number> {
  const lastOrder = await client.paymentRequest.findFirst({
    where: {
      merchantId,
      orderDate,
    },
    orderBy: {
      orderNumber: 'desc',
    },
    select: {
      orderNumber: true,
    },
  });

  return lastOrder ? lastOrder.orderNumber + 1 : 1;
}

export function generateLinkId(
  slug: string,
  orderDate: string,
  orderNumber: number
): string {
  const formattedNumber = orderNumber.toString().padStart(4, '0');
  return `${slug}/${orderDate}/${formattedNumber}`;
}

export function getCurrentOrderDate(timezone: string): string {
  return DateTime.now().setZone(timezone).toFormat('yyyyMMdd');
}
