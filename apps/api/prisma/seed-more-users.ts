import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables (.env from apps/api and root)
dotenv.config();
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// Strict Production Guard
if (process.env.NODE_ENV === 'production') {
  console.error('================================================================');
  console.error('FATAL: seed-more-users is development/test only and cannot run in production (NODE_ENV=production)!');
  console.error('================================================================');
  process.exit(1);
}

// Password variable check
const demoPassword = process.env.DEMO_USER_PASSWORD;
if (!demoPassword || demoPassword.trim() === '') {
  console.error('================================================================');
  console.error('FATAL: Environment variable DEMO_USER_PASSWORD is missing or empty.');
  console.error('Please define DEMO_USER_PASSWORD in your environment or .env file before running.');
  console.error('================================================================');
  process.exit(1);
}

import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const TARGET_WORKSPACE_NAME = 'Acme Developments';

interface SeedUserDef {
  fullName: string;
  email: string;
  role: Role;
  roleDisplay: string;
}

const USERS_TO_ADD: SeedUserDef[] = [
  { fullName: 'Ravi Kumar', email: 'ravi@acme.dev', role: Role.MANAGER, roleDisplay: 'Manager' },
  { fullName: 'Anita Rao', email: 'anita@acme.dev', role: Role.MANAGER, roleDisplay: 'Manager' },
  { fullName: 'Kiran Shetty', email: 'kiran@acme.dev', role: Role.TEAM_LEAD, roleDisplay: 'Team Leader' },
  { fullName: 'Divya Nair', email: 'divya@acme.dev', role: Role.TEAM_LEAD, roleDisplay: 'Team Leader' },
  { fullName: 'Mohan Gowda', email: 'mohan@acme.dev', role: Role.MEMBER, roleDisplay: 'Member' },
  { fullName: 'Priya Hegde', email: 'priya@acme.dev', role: Role.MEMBER, roleDisplay: 'Member' },
  { fullName: 'Arjun Patil', email: 'arjun@acme.dev', role: Role.MEMBER, roleDisplay: 'Member' },
  { fullName: 'Sneha Desai', email: 'sneha@acme.dev', role: Role.MEMBER, roleDisplay: 'Member' },
  { fullName: 'Vikram Joshi', email: 'vikram@acme.dev', role: Role.MEMBER, roleDisplay: 'Member' },
  { fullName: 'Lakshmi Bhat', email: 'lakshmi@acme.dev', role: Role.MEMBER, roleDisplay: 'Member' },
];

interface ResultRow {
  fullName: string;
  email: string;
  role: string;
  result: string;
}

async function main() {
  console.log(`\n🔍 Looking up workspace "${TARGET_WORKSPACE_NAME}"...`);

  const workspace = await prisma.workspace.findFirst({
    where: { name: TARGET_WORKSPACE_NAME, deletedAt: null },
  });

  if (!workspace) {
    const existingWorkspaces = await prisma.workspace.findMany({
      where: { deletedAt: null },
      select: { name: true, slug: true },
    });

    console.error('================================================================');
    console.error(`FATAL: Workspace "${TARGET_WORKSPACE_NAME}" does not exist!`);
    console.error('Existing workspaces in database:');
    for (const ws of existingWorkspaces) {
      console.error(` - "${ws.name}" (slug: ${ws.slug})`);
    }
    console.error('================================================================');
    process.exit(1);
  }

  console.log(`✔ Found workspace "${workspace.name}" (id: ${workspace.id})`);

  // Hash password using bcryptjs cost 10 (standard across the app)
  const passwordHash = await bcrypt.hash(demoPassword.trim(), 10);

  const results: ResultRow[] = [];
  let createdCount = 0;
  let skippedCount = 0;

  for (const userDef of USERS_TO_ADD) {
    const cleanEmail = userDef.email.toLowerCase().trim();

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: cleanEmail },
    });

    if (existingUser) {
      // Check if they are in Acme Developments
      const membership = await prisma.membership.findUnique({
        where: {
          workspaceId_userId: {
            workspaceId: workspace.id,
            userId: existingUser.id,
          },
        },
      });

      if (membership) {
        results.push({
          fullName: userDef.fullName,
          email: userDef.email,
          role: userDef.roleDisplay,
          result: 'skipped (already exists)',
        });
        skippedCount++;
      } else {
        console.warn(`⚠️ User "${userDef.email}" already exists but is NOT in "${TARGET_WORKSPACE_NAME}". Skipping (not adding automatically).`);
        results.push({
          fullName: userDef.fullName,
          email: userDef.email,
          role: userDef.roleDisplay,
          result: 'skipped (already exists, not in Acme Developments)',
        });
        skippedCount++;
      }
      continue;
    }

    // Create user with verified email and phone so they can log in without OTP
    const newUser = await prisma.user.create({
      data: {
        email: cleanEmail,
        fullName: userDef.fullName,
        passwordHash,
        emailVerified: true,
        phoneVerified: true,
        isActive: true,
      },
    });

    // Add user to Acme Developments with stated role (no project or task assignment)
    await prisma.membership.create({
      data: {
        workspaceId: workspace.id,
        userId: newUser.id,
        role: userDef.role,
      },
    });

    results.push({
      fullName: userDef.fullName,
      email: userDef.email,
      role: userDef.roleDisplay,
      result: 'created',
    });
    createdCount++;
  }

  // Print results
  console.log('\n================ User Seeding Results ================');
  console.table(
    results.map((r) => ({
      'Full Name': r.fullName,
      Email: r.email,
      Role: r.role,
      Result: r.result,
    }))
  );
  console.log(`Total: ${results.length} | Created: ${createdCount} | Skipped: ${skippedCount}\n`);
}

main()
  .catch((err) => {
    console.error('Unexpected error executing seed-more-users:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
