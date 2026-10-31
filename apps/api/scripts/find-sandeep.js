const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
  const users = await prisma.user.findMany({
    where: { email: { contains: 'sandeep' } }
  });
  console.log('Sandeep users in DB:', users);
  await prisma.$disconnect();
}

check();

