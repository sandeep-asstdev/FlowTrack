import { PrismaClient, Role, Priority, EdgeKind } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding FlowTrack database...');

  // 1. Create Default Workspace
  const workspace = await prisma.workspace.upsert({
    where: { slug: 'acme-developments' },
    update: {},
    create: {
      name: 'Acme Developments',
      slug: 'acme-developments',
      logoUrl: 'https://images.unsplash.com/photo-1541888946425-d0fbb18615f8?w=128&q=80',
      themeSettings: {
        accentColour: '#3b82f6',
        density: 'comfortable',
      },
    },
  });

  // 2. Create Users
  const passwordHash = await bcrypt.hash('Password123!', 10);

  const admin = await prisma.user.upsert({
    where: { email: 'admin@flowtrack.dev' },
    update: {},
    create: {
      email: 'admin@flowtrack.dev',
      fullName: 'System Administrator',
      phone: '+919876543210',
      passwordHash,
      avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=96&q=80',
    },
  });

  const suresh = await prisma.user.upsert({
    where: { email: 'suresh@flowtrack.dev' },
    update: {},
    create: {
      email: 'suresh@flowtrack.dev',
      fullName: 'Suresh Sharma',
      phone: '+919876543211',
      passwordHash,
      avatarUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=96&q=80',
    },
  });

  const ramesh = await prisma.user.upsert({
    where: { email: 'ramesh@flowtrack.dev' },
    update: {},
    create: {
      email: 'ramesh@flowtrack.dev',
      fullName: 'Ramesh Kumar',
      phone: '+919876543212',
      passwordHash,
      avatarUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=96&q=80',
    },
  });

  // 3. Create Memberships
  await prisma.membership.upsert({
    where: {
      workspaceId_userId: {
        workspaceId: workspace.id,
        userId: admin.id,
      },
    },
    update: {},
    create: {
      workspaceId: workspace.id,
      userId: admin.id,
      role: Role.ADMIN,
    },
  });

  await prisma.membership.upsert({
    where: {
      workspaceId_userId: {
        workspaceId: workspace.id,
        userId: suresh.id,
      },
    },
    update: {},
    create: {
      workspaceId: workspace.id,
      userId: suresh.id,
      role: Role.MANAGER,
    },
  });

  await prisma.membership.upsert({
    where: {
      workspaceId_userId: {
        workspaceId: workspace.id,
        userId: ramesh.id,
      },
    },
    update: {},
    create: {
      workspaceId: workspace.id,
      userId: ramesh.id,
      role: Role.MEMBER,
    },
  });

  // 4. Default Status Set & Statuses
  let statusSet = await prisma.statusSet.findFirst({
    where: { workspaceId: workspace.id, name: 'Default Status Set' },
  });

  if (!statusSet) {
    statusSet = await prisma.statusSet.create({
      data: {
        workspaceId: workspace.id,
        name: 'Default Status Set',
        isDefault: true,
      },
    });

    const defaultStatuses = [
      { key: 'not_started', labelI18n: { en: 'Not Started', hi: 'शुरू नहीं हुआ', kn: 'ಪ್ರಾರಂಭವಾಗಿಲ್ಲ' }, colour: '#94a3b8', icon: 'Circle', category: 'not_started', displayOrder: 0 },
      { key: 'in_progress', labelI18n: { en: 'In Progress', hi: 'प्रगति पर है', kn: 'ಪ್ರಗತಿಯಲ್ಲಿದೆ' }, colour: '#3b82f6', icon: 'Clock', category: 'active', displayOrder: 1 },
      { key: 'waiting', labelI18n: { en: 'Waiting', hi: 'अटका हुआ', kn: 'ಕಾಯುತ್ತಿದೆ' }, colour: '#f59e0b', icon: 'AlertTriangle', category: 'blocked', displayOrder: 2 },
      { key: 'done', labelI18n: { en: 'Done', hi: 'पूर्ण हुआ', kn: 'ಪೂರ್ಣಗೊಂಡಿದೆ' }, colour: '#10b981', icon: 'CheckCircle2', category: 'done', displayOrder: 3 },
      { key: 'cancelled', labelI18n: { en: 'Cancelled', hi: 'रद्द', kn: 'ರದ್ದುಗೊಳಿಸಲಾಗಿದೆ' }, colour: '#ef4444', icon: 'XCircle', category: 'cancelled', displayOrder: 4 },
    ];

    for (const s of defaultStatuses) {
      await prisma.status.create({
        data: {
          statusSetId: statusSet.id,
          key: s.key,
          labelI18n: s.labelI18n,
          colour: s.colour,
          icon: s.icon,
          category: s.category,
          displayOrder: s.displayOrder,
        },
      });
    }
  }

  // 5. Node Types
  const nodeTypes = [
    { key: 'task', name: 'Task', icon: 'CheckSquare', colour: '#3b82f6', isGroup: false },
    { key: 'stage', name: 'Stage / Group', icon: 'Layers', colour: '#8b5cf6', isGroup: true },
    { key: 'approval', name: 'Approval Gate', icon: 'ShieldCheck', colour: '#10b981', isGroup: false },
    { key: 'doc_request', name: 'Document Request', icon: 'FileText', colour: '#f59e0b', isGroup: false },
    { key: 'milestone', name: 'Milestone', icon: 'Flag', colour: '#ec4899', isGroup: false },
    { key: 'note', name: 'Note', icon: 'StickyNote', colour: '#64748b', isGroup: false },
  ];

  for (const nt of nodeTypes) {
    await prisma.nodeType.upsert({
      where: {
        workspaceId_key: {
          workspaceId: workspace.id,
          key: nt.key,
        },
      },
      update: {},
      create: {
        workspaceId: workspace.id,
        key: nt.key,
        name: nt.name,
        icon: nt.icon,
        colour: nt.colour,
        defaultStatusSetId: statusSet.id,
        isGroup: nt.isGroup,
        isSystem: true,
      },
    });
  }

  console.log('Seed completed successfully!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
