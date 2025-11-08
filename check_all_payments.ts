import { prisma } from './src/infrastructure/database/client';

async function checkPayments() {
  const payments = await prisma.paymentRequest.findMany({
    select: {
      linkId: true,
      orderDate: true,
      orderNumber: true,
      amountFiat: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
    take: 10,
  });
  
  console.log('Recent payment requests:');
  console.log(JSON.stringify(payments, null, 2));
  
  const count = await prisma.paymentRequest.count();
  console.log(`\nTotal payment requests: ${count}`);
  
  await prisma.$disconnect();
  process.exit(0);
}

checkPayments();
