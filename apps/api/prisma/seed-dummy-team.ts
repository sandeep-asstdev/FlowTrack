import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

// Strict Production Guard
if (process.env.NODE_ENV === 'production') {
  console.error('================================================================');
  console.error('FATAL: seed-dummy-team is development-only and cannot run in production!');
  console.error('================================================================');
  process.exit(1);
}

const prisma = new PrismaClient();

const COMMON_PASSWORD = 'Password123!';

interface SeedUserDef {
  email: string;
  fullName: string;
  phone: string;
  role: Role;
  avatarUrl: string;
}

// Exactly 1 Admin, 2 Managers, 1 Team Leader, 2 Members
const dummyUsers: SeedUserDef[] = [
  // 1 Admin
  {
    email: 'admin1@flowtrack.dev',
    fullName: 'System Administrator (Admin 1)',
    phone: '+919811000000',
    role: Role.ADMIN,
    avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=96&q=80',
  },

  // 2 Managers
  {
    email: 'manager1@flowtrack.dev',
    fullName: 'Rajesh Verma (Manager 1)',
    phone: '+919811000001',
    role: Role.MANAGER,
    avatarUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=96&q=80',
  },
  {
    email: 'manager2@flowtrack.dev',
    fullName: 'Priya Nair (Manager 2)',
    phone: '+919811000002',
    role: Role.MANAGER,
    avatarUrl: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=96&q=80',
  },

  // 1 Team Leader
  {
    email: 'lead1@flowtrack.dev',
    fullName: 'Rohan Mehta (Team Lead 1)',
    phone: '+919811000011',
    role: Role.TEAM_LEAD,
    avatarUrl: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=96&q=80',
  },

  // 2 Members
  {
    email: 'member1@flowtrack.dev',
    fullName: 'Amit Kumar (Member 1)',
    phone: '+919811000021',
    role: Role.MEMBER,
    avatarUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=96&q=80',
  },
  {
    email: 'member2@flowtrack.dev',
    fullName: 'Sunita Sharma (Member 2)',
    phone: '+919811000022',
    role: Role.MEMBER,
    avatarUrl: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=96&q=80',
  },
];

async function main() {
  console.log('🚀 Starting scenario seeding (1 Admin, 2 Managers, 1 Team Leader, 2 Members)...');

  // Find all workspaces
  const workspaces = await prisma.workspace.findMany();
  if (workspaces.length === 0) {
    console.error('❌ No workspaces found in database! Creating default workspace...');
    const defaultWs = await prisma.workspace.create({
      data: {
        name: 'Acme Developments',
        slug: 'acme-developments',
      },
    });
    workspaces.push(defaultWs);
  }

  // Find all projects
  const projects = await prisma.project.findMany();

  // Hash password once for top speed
  console.log('🔒 Generating password hash...');
  const passwordHash = await bcrypt.hash(COMMON_PASSWORD, 10);

  console.log(`👥 Upserting ${dummyUsers.length} users and linking to ${workspaces.length} workspace(s) and ${projects.length} project(s)...`);

  for (const userDef of dummyUsers) {
    // 1. Upsert User
    const user = await prisma.user.upsert({
      where: { email: userDef.email },
      update: {
        fullName: userDef.fullName,
        phone: userDef.phone,
        passwordHash,
        avatarUrl: userDef.avatarUrl,
        isActive: true,
      },
      create: {
        email: userDef.email,
        fullName: userDef.fullName,
        phone: userDef.phone,
        passwordHash,
        avatarUrl: userDef.avatarUrl,
        isActive: true,
      },
    });

    // 2. Link User to all Workspaces
    for (const ws of workspaces) {
      await prisma.membership.upsert({
        where: {
          workspaceId_userId: {
            workspaceId: ws.id,
            userId: user.id,
          },
        },
        update: {
          role: userDef.role,
        },
        create: {
          workspaceId: ws.id,
          userId: user.id,
          role: userDef.role,
        },
      });
    }

    // 3. Link User to all Projects
    for (const proj of projects) {
      await prisma.projectMember.upsert({
        where: {
          projectId_userId: {
            projectId: proj.id,
            userId: user.id,
          },
        },
        update: {
          role: userDef.role,
        },
        create: {
          projectId: proj.id,
          userId: user.id,
          role: userDef.role,
        },
      });
    }

    console.log(`  ✓ Created/Updated [${userDef.role.padEnd(9)}] ${userDef.email} -> ${userDef.fullName}`);
  }

  console.log('\n🎉 ALL 6 SCENARIO USERS (1 Admin, 2 Managers, 1 Team Lead, 2 Members) SUCCESSFULLY CREATED AND SYNCED TO DATABASE!');
  console.log(`🔑 Standard Password for all accounts: ${COMMON_PASSWORD}`);
}

main()
  .catch((e) => {
    console.error('❌ Error during seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
