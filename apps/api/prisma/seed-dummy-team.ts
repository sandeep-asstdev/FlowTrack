import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const COMMON_PASSWORD = 'Password123!';

interface SeedUserDef {
  email: string;
  fullName: string;
  phone: string;
  role: Role;
  avatarUrl: string;
}

const dummyUsers: SeedUserDef[] = [
  // 10 Managers
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
  {
    email: 'manager3@flowtrack.dev',
    fullName: 'Amit Singhal (Manager 3)',
    phone: '+919811000003',
    role: Role.MANAGER,
    avatarUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=96&q=80',
  },
  {
    email: 'manager4@flowtrack.dev',
    fullName: 'Sunita Rao (Manager 4)',
    phone: '+919811000004',
    role: Role.MANAGER,
    avatarUrl: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=96&q=80',
  },
  {
    email: 'manager5@flowtrack.dev',
    fullName: 'Vikram Malhotra (Manager 5)',
    phone: '+919811000005',
    role: Role.MANAGER,
    avatarUrl: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=96&q=80',
  },
  {
    email: 'manager6@flowtrack.dev',
    fullName: 'Ananya Deshmukh (Manager 6)',
    phone: '+919811000006',
    role: Role.MANAGER,
    avatarUrl: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=96&q=80',
  },
  {
    email: 'manager7@flowtrack.dev',
    fullName: 'Sanjay Patel (Manager 7)',
    phone: '+919811000007',
    role: Role.MANAGER,
    avatarUrl: 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=96&q=80',
  },
  {
    email: 'manager8@flowtrack.dev',
    fullName: 'Kavita Menon (Manager 8)',
    phone: '+919811000008',
    role: Role.MANAGER,
    avatarUrl: 'https://images.unsplash.com/photo-1567532939604-b6b5b0db2604?w=96&q=80',
  },
  {
    email: 'manager9@flowtrack.dev',
    fullName: 'Deepak Chopra (Manager 9)',
    phone: '+919811000009',
    role: Role.MANAGER,
    avatarUrl: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=96&q=80',
  },
  {
    email: 'manager10@flowtrack.dev',
    fullName: 'Meera Joshi (Manager 10)',
    phone: '+919811000010',
    role: Role.MANAGER,
    avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=96&q=80',
  },

  // 10 Team Leads
  {
    email: 'lead1@flowtrack.dev',
    fullName: 'Rohan Mehta (Team Lead 1)',
    phone: '+919811000011',
    role: Role.TEAM_LEAD,
    avatarUrl: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=96&q=80',
  },
  {
    email: 'lead2@flowtrack.dev',
    fullName: 'Sneha Kapoor (Team Lead 2)',
    phone: '+919811000012',
    role: Role.TEAM_LEAD,
    avatarUrl: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=96&q=80',
  },
  {
    email: 'lead3@flowtrack.dev',
    fullName: 'Arjun Reddy (Team Lead 3)',
    phone: '+919811000013',
    role: Role.TEAM_LEAD,
    avatarUrl: 'https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?w=96&q=80',
  },
  {
    email: 'lead4@flowtrack.dev',
    fullName: 'Pooja Hegde (Team Lead 4)',
    phone: '+919811000014',
    role: Role.TEAM_LEAD,
    avatarUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=96&q=80',
  },
  {
    email: 'lead5@flowtrack.dev',
    fullName: 'Karthik Iyer (Team Lead 5)',
    phone: '+919811000015',
    role: Role.TEAM_LEAD,
    avatarUrl: 'https://images.unsplash.com/photo-1492562080023-ab3db95bfbce?w=96&q=80',
  },
  {
    email: 'lead6@flowtrack.dev',
    fullName: 'Neha Sharma (Team Lead 6)',
    phone: '+919811000016',
    role: Role.TEAM_LEAD,
    avatarUrl: 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=96&q=80',
  },
  {
    email: 'lead7@flowtrack.dev',
    fullName: 'Varun Dhawan (Team Lead 7)',
    phone: '+919811000017',
    role: Role.TEAM_LEAD,
    avatarUrl: 'https://images.unsplash.com/photo-1513956589380-bad6acb9b9d4?w=96&q=80',
  },
  {
    email: 'lead8@flowtrack.dev',
    fullName: 'Divya Pillai (Team Lead 8)',
    phone: '+919811000018',
    role: Role.TEAM_LEAD,
    avatarUrl: 'https://images.unsplash.com/photo-1529626455594-4ff0802cfb7e?w=96&q=80',
  },
  {
    email: 'lead9@flowtrack.dev',
    fullName: 'Manish Gupta (Team Lead 9)',
    phone: '+919811000019',
    role: Role.TEAM_LEAD,
    avatarUrl: 'https://images.unsplash.com/photo-1463453091185-61582044d556?w=96&q=80',
  },
  {
    email: 'lead10@flowtrack.dev',
    fullName: 'Ritu Saxena (Team Lead 10)',
    phone: '+919811000020',
    role: Role.TEAM_LEAD,
    avatarUrl: 'https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?w=96&q=80',
  },

  // 10 Members
  {
    email: 'member1@flowtrack.dev',
    fullName: 'Rahul Yadav (Member 1)',
    phone: '+919811000021',
    role: Role.MEMBER,
    avatarUrl: 'https://images.unsplash.com/photo-1501196354995-cbb51c65aaea?w=96&q=80',
  },
  {
    email: 'member2@flowtrack.dev',
    fullName: 'Tanvi Shah (Member 2)',
    phone: '+919811000022',
    role: Role.MEMBER,
    avatarUrl: 'https://images.unsplash.com/photo-1548142813-c348350df52b?w=96&q=80',
  },
  {
    email: 'member3@flowtrack.dev',
    fullName: 'Nikhil Pandey (Member 3)',
    phone: '+919811000023',
    role: Role.MEMBER,
    avatarUrl: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=96&q=80',
  },
  {
    email: 'member4@flowtrack.dev',
    fullName: 'Swati Kulkarni (Member 4)',
    phone: '+919811000024',
    role: Role.MEMBER,
    avatarUrl: 'https://images.unsplash.com/photo-1554151228-14d9def656e4?w=96&q=80',
  },
  {
    email: 'member5@flowtrack.dev',
    fullName: 'Akash Roy (Member 5)',
    phone: '+919811000025',
    role: Role.MEMBER,
    avatarUrl: 'https://images.unsplash.com/photo-1527980965255-d3b416303d12?w=96&q=80',
  },
  {
    email: 'member6@flowtrack.dev',
    fullName: 'Isha Sen (Member 6)',
    phone: '+919811000026',
    role: Role.MEMBER,
    avatarUrl: 'https://images.unsplash.com/photo-1508214751196-bcfd4ca60f91?w=96&q=80',
  },
  {
    email: 'member7@flowtrack.dev',
    fullName: 'Gaurav Jain (Member 7)',
    phone: '+919811000027',
    role: Role.MEMBER,
    avatarUrl: 'https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?w=96&q=80',
  },
  {
    email: 'member8@flowtrack.dev',
    fullName: 'Shreya Bose (Member 8)',
    phone: '+919811000028',
    role: Role.MEMBER,
    avatarUrl: 'https://images.unsplash.com/photo-1573497019940-1c28c88b4f3e?w=96&q=80',
  },
  {
    email: 'member9@flowtrack.dev',
    fullName: 'Aditya Nambiar (Member 9)',
    phone: '+919811000029',
    role: Role.MEMBER,
    avatarUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=96&q=80',
  },
  {
    email: 'member10@flowtrack.dev',
    fullName: 'Pallavi Joshi (Member 10)',
    phone: '+919811000030',
    role: Role.MEMBER,
    avatarUrl: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=96&q=80',
  },
];

async function main() {
  console.log('🚀 Starting super-fast seeding of 30 dummy users (10 Managers, 10 Team Leads, 10 Members)...');

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

  console.log(`👥 Upserting 30 users and linking to ${workspaces.length} workspace(s) and ${projects.length} project(s)...`);

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

  console.log('\n🎉 ALL 30 USERS SUCCESSFULLY CREATED AND SYNCED TO DATABASE!');
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
