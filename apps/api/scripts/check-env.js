const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
  try {
    const users = await prisma.user.findMany({
      select: { id: true, email: true, fullName: true }
    });
    console.log('All user emails:', users.map(u => `${u.email} (${u.fullName})`));

    const workspaces = await prisma.workspace.findMany({
      select: { id: true, name: true, slug: true }
    });
    console.log('Workspaces:', workspaces);

    const statuses = await prisma.status.findMany({
      select: { id: true, key: true, category: true, statusSetId: true }
    });
    console.log('Statuses count:', statuses.length);

    const nodeTypes = await prisma.nodeType.findMany({
      select: { id: true, key: true, name: true, workspaceId: true }
    });
    console.log('Node types:', nodeTypes);
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await prisma.$disconnect();
  }
}

check();
