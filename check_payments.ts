import { prisma } from './src/infrastructure/database/client';

async function checkPayments() {
  const payments = await prisma.paymentRequest.findMany({
    where: { linkId: '2VL7KX' },
    select: {
      linkId: true,
      orderDate: true,
      orderNumber: true,
      amountFiat: true,
      createdAt: true,
    },
    orderBy: { orderNumber: 'desc' },
    take: 5,
  });
  
  console.log('Payment requests with linkId 2VL7KX:');
  console.log(JSON.stringify(payments, null, 2));
  
  await prisma.$disconnect();
  process.exit(0);
}

checkPayments();
