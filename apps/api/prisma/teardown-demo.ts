import * as dotenv from 'dotenv';
dotenv.config();

// Strict Production Guard
if (process.env.NODE_ENV === 'production') {
  console.error('===================================================================');
  console.error('FATAL: teardown-demo is development-only and cannot run in production!');
  console.error('===================================================================');
  process.exit(1);
}

import { PrismaClient } from '@prisma/client';

const DEMO_EMAILS = [
  'cara@acme.dev',
  'dan@acme.dev',
  'mia@acme.dev',
  'omar@acme.dev',
  'tom@acme.dev',
  'maya@acme.dev',
  'sam@acme.dev',
  'nina@acme.dev',
  'alex@acme.dev',
  'zoe@rival.dev',
];

const DEMO_WORKSPACES = ['acme-motors', 'rival-corp'];

async function runTeardown() {
  console.log('\n🧹 Starting FlowTrack Demo Dataset Teardown...\n');
  const prisma = new PrismaClient();

  try {
    // 1. Locate Demo Workspaces
    const workspaces = await prisma.workspace.findMany({
      where: { slug: { in: DEMO_WORKSPACES } },
      select: { id: true, name: true, slug: true },
    });
    const wsIds = workspaces.map((w) => w.id);

    // 2. Locate Demo Users
    const users = await prisma.user.findMany({
      where: { email: { in: DEMO_EMAILS } },
      select: { id: true, email: true },
    });
    const userIds = users.map((u) => u.id);

    console.log(`Found ${workspaces.length} demo workspace(s) and ${users.length} demo user(s) to remove.`);

    if (wsIds.length > 0) {
      // Find all projects in demo workspaces
      const projects = await prisma.project.findMany({
        where: { workspaceId: { in: wsIds } },
        select: { id: true },
      });
      const projectIds = projects.map((p) => p.id);

      // Find all nodes in these projects
      const nodes = await prisma.node.findMany({
        where: { projectId: { in: projectIds } },
        select: { id: true },
      });
      const nodeIds = nodes.map((n) => n.id);

      // Temporarily disable the immutable audit trigger for demo cleanup
      try {
        await prisma.$executeRawUnsafe(`ALTER TABLE "audit_events" DISABLE TRIGGER trg_audit_events_immutable;`);
      } catch (err: any) {
        // Trigger might not exist in some environments
      }

      console.log('   🗑️ Cleaning up audit events for demo workspaces & users...');
      await prisma.auditEvent.deleteMany({
        where: {
          OR: [
            { workspaceId: { in: wsIds } },
            { actorId: { in: userIds } },
          ],
        },
      });

      // Re-enable trigger
      try {
        await prisma.$executeRawUnsafe(`ALTER TABLE "audit_events" ENABLE TRIGGER trg_audit_events_immutable;`);
      } catch (err: any) {
        // Ignore
      }

      console.log('   🗑️ Cleaning up approval requests & decisions...');
      await prisma.approvalDecision.deleteMany({
        where: {
          OR: [
            { approvalRequest: { workspaceId: { in: wsIds } } },
            { approverId: { in: userIds } },
          ],
        },
      });
      await prisma.approvalStageInstance.deleteMany({
        where: { approvalRequest: { workspaceId: { in: wsIds } } },
      });
      await prisma.approvalRequest.deleteMany({
        where: { workspaceId: { in: wsIds } },
      });

      console.log('   🗑️ Cleaning up approval policies & stages...');
      await prisma.policyStage.deleteMany({
        where: { policy: { workspaceId: { in: wsIds } } },
      });
      await prisma.approvalPolicy.deleteMany({
        where: { workspaceId: { in: wsIds } },
      });

      console.log('   🗑️ Cleaning up evidence, submissions, and work updates...');
      await prisma.evidence.deleteMany({
        where: { workspaceId: { in: wsIds } },
      });
      await prisma.workSubmission.deleteMany({
        where: { workspaceId: { in: wsIds } },
      });
      await prisma.workUpdate.deleteMany({
        where: { workspaceId: { in: wsIds } },
      });

      console.log('   🗑️ Cleaning up edges and nodes...');
      await prisma.edge.deleteMany({
        where: { workspaceId: { in: wsIds } },
      });
      await prisma.node.deleteMany({
        where: { workspaceId: { in: wsIds } },
      });

      console.log('   🗑️ Cleaning up project members & projects...');
      await prisma.projectMember.deleteMany({
        where: { projectId: { in: projectIds } },
      });
      await prisma.project.deleteMany({
        where: { id: { in: projectIds } },
      });

      console.log('   🗑️ Cleaning up organizational hierarchy (positions, departments, roles)...');
      // Break position self-relations first
      await prisma.position.updateMany({
        where: { workspaceId: { in: wsIds } },
        data: { reportsToPositionId: null, userId: null },
      });
      await prisma.position.deleteMany({
        where: { workspaceId: { in: wsIds } },
      });

      // Break department self-relations
      await prisma.department.updateMany({
        where: { workspaceId: { in: wsIds } },
        data: { parentDepartmentId: null, managerId: null },
      });
      await prisma.department.deleteMany({
        where: { workspaceId: { in: wsIds } },
      });

      await prisma.scopedRoleAssignment.deleteMany({
        where: { workspaceId: { in: wsIds } },
      });
      await prisma.accessGrant.deleteMany({
        where: { workspaceId: { in: wsIds } },
      });

      console.log('   🗑️ Cleaning up metadata, node types, status sets...');
      await prisma.nodeType.deleteMany({
        where: { workspaceId: { in: wsIds } },
      });
      await prisma.status.deleteMany({
        where: { statusSet: { workspaceId: { in: wsIds } } },
      });
      await prisma.statusSet.deleteMany({
        where: { workspaceId: { in: wsIds } },
      });

      await prisma.auditLog.deleteMany({
        where: { workspaceId: { in: wsIds } },
      });
      await prisma.notification.deleteMany({
        where: { workspaceId: { in: wsIds } },
      });

      console.log('   🗑️ Cleaning up memberships and workspace containers...');
      await prisma.membership.deleteMany({
        where: { workspaceId: { in: wsIds } },
      });
      await prisma.workspace.deleteMany({
        where: { id: { in: wsIds } },
      });
    }

    // 3. Delete Demo Users
    if (userIds.length > 0) {
      console.log('   🗑️ Removing demo users...');
      // Clean up any remaining memberships or scoped roles
      await prisma.membership.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.scopedRoleAssignment.deleteMany({
        where: {
          OR: [{ userId: { in: userIds } }, { grantedById: { in: userIds } }],
        },
      });
      await prisma.notification.deleteMany({
        where: {
          OR: [{ userId: { in: userIds } }, { actorId: { in: userIds } }],
        },
      });
      await prisma.user.deleteMany({
        where: { id: { in: userIds } },
      });
    }

    console.log('\n✔ Teardown completed cleanly. Non-demo records remain unaffected.\n');
  } catch (error: any) {
    console.error('❌ Error during demo teardown:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

runTeardown();

