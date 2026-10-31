const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
  const ws = await prisma.workspace.findFirst({ where: { name: 'Acme Developments' } });
  const statusSets = await prisma.statusSet.findMany({
    where: { workspaceId: ws.id },
    include: { statuses: true }
  });
  console.log('Status Sets:', JSON.stringify(statusSets, null, 2));
  await prisma.$disconnect();
}

check();

