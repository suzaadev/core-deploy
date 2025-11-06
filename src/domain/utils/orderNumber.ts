import { prisma } from '../../infrastructure/database/client';

/**
 * Get current date in YYYYMMDD format for merchant's timezone
 */
export function getCurrentOrderDate(timezone: string): string {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  
  const parts = formatter.formatToParts(now);
  const year = parts.find(p => p.type === 'year')!.value;
  const month = parts.find(p => p.type === 'month')!.value;
  const day = parts.find(p => p.type === 'day')!.value;
  
  return `${year}${month}${day}`;
}

/**
 * Get next order number for merchant on given date
 * Returns number 1-9999
 */
export async function getNextOrderNumber(
  merchantId: string,
  orderDate: string
): Promise<number> {
  // Get highest order number for this merchant on this date
  const lastOrder = await prisma.paymentRequest.findFirst({
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

  const nextNumber = lastOrder ? lastOrder.orderNumber + 1 : 1;

  // Max 9999 orders per day
  if (nextNumber > 9999) {
    throw new Error('Daily order limit reached (9999)');
  }

  return nextNumber;
}

/**
 * Format order number with leading zeros
 * Example: 1 → "0001", 42 → "0042"
 */
export function formatOrderNumber(num: number): string {
  return num.toString().padStart(4, '0');
}

/**
 * Generate linkId from slug, date, and order number
 * Example: "jumasm/20251106/0001"
 */
export function generateLinkId(
  slug: string,
  orderDate: string,
  orderNumber: number
): string {
  return `${slug}/${orderDate}/${formatOrderNumber(orderNumber)}`;
}
