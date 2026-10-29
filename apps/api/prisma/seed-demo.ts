import * as dotenv from 'dotenv';
dotenv.config();

// Strict Production Guard
if (process.env.NODE_ENV === 'production') {
  console.error('================================================================');
  console.error('FATAL: seed-demo is development-only and cannot run in production!');
  console.error('================================================================');
  process.exit(1);
}

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { WorkspacesService } from '../src/modules/workspaces/workspaces.service';
import { ApprovalsService } from '../src/modules/approvals/approvals.service';
import { AuditService } from '../src/modules/audit/audit.service';
import { Role, ConfidentialityLevel, RoleScopeType, Priority } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const DEMO_PASSWORD = 'Demo@12345';

interface DemoUserSpec {
  key: string;
  email: string;
  fullName: string;
  jobTitle: string;
  org: 'acme' | 'rival';
  orgRole: Role;
  notes: string;
}

const DEMO_USERS: DemoUserSpec[] = [
  { key: 'cara', email: 'cara@acme.dev', fullName: 'Cara Vance', jobTitle: 'Chief Executive Officer (CEO)', org: 'acme', orgRole: Role.ADMIN, notes: 'Executive Head & Project Owner' },
  { key: 'dan', email: 'dan@acme.dev', fullName: 'Dan Miller', jobTitle: 'Engineering Director', org: 'acme', orgRole: Role.MANAGER, notes: 'Reports to Cara' },
  { key: 'mia', email: 'mia@acme.dev', fullName: 'Mia Wong', jobTitle: 'Engineering Manager', org: 'acme', orgRole: Role.MANAGER, notes: 'Reports to Dan; Manager for P1 & P2' },
  { key: 'omar', email: 'omar@acme.dev', fullName: 'Omar Farooq', jobTitle: 'Operations Manager', org: 'acme', orgRole: Role.MANAGER, notes: 'Peer Manager in Acme' },
  { key: 'tom', email: 'tom@acme.dev', fullName: 'Tom Hayes', jobTitle: 'Technical Team Lead', org: 'acme', orgRole: Role.TEAM_LEAD, notes: 'Reports to Mia; P1 Member & Approver' },
  { key: 'maya', email: 'maya@acme.dev', fullName: 'Maya Patel', jobTitle: 'Senior Software Engineer', org: 'acme', orgRole: Role.MEMBER, notes: 'Reports to Tom; Assignee A1.1, A2, B1' },
  { key: 'sam', email: 'sam@acme.dev', fullName: 'Sam Taylor', jobTitle: 'DevOps & Systems Engineer', org: 'acme', orgRole: Role.MEMBER, notes: 'Reports to Tom; Assignee A1.2, B2, Atlas' },
  { key: 'nina', email: 'nina@acme.dev', fullName: 'Nina Simone', jobTitle: 'QA Engineer', org: 'acme', orgRole: Role.MEMBER, notes: 'Reports to Tom; Acme Member' },
  { key: 'alex', email: 'alex@acme.dev', fullName: 'Alex Mercer', jobTitle: 'System Administrator', org: 'acme', orgRole: Role.ADMIN, notes: 'Technical Admin Only (No Business Content)' },
  { key: 'zoe', email: 'zoe@rival.dev', fullName: 'Zoe Saldana', jobTitle: 'General Manager', org: 'rival', orgRole: Role.MANAGER, notes: 'Rival Corp Manager' },
];

async function runSeed() {
  console.log('\n🚀 Starting FlowTrack Idempotent Demo Seeder...\n');

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  const prisma = app.get(PrismaService);
  const workspacesService = app.get(WorkspacesService);
  const approvalsService = app.get(ApprovalsService);
  const auditService = app.get(AuditService);

  try {
    const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

    // =========================================================================
    // 1. SEED USERS (Idempotent)
    // =========================================================================
    console.log('👤 Seeding Demo Users...');
    const userMap = new Map<string, any>();

    for (const spec of DEMO_USERS) {
      const user = await prisma.user.upsert({
        where: { email: spec.email },
        update: {
          fullName: spec.fullName,
          jobTitle: spec.jobTitle,
          passwordHash,
          isActive: true,
          deletedAt: null,
        },
        create: {
          email: spec.email,
          fullName: spec.fullName,
          jobTitle: spec.jobTitle,
          passwordHash,
          isActive: true,
        },
      });
      userMap.set(spec.key, user);
    }
    console.log(`   ✔ ${DEMO_USERS.length} Demo Users ready.`);

    const cara = userMap.get('cara');
    const dan = userMap.get('dan');
    const mia = userMap.get('mia');
    const omar = userMap.get('omar');
    const tom = userMap.get('tom');
    const maya = userMap.get('maya');
    const sam = userMap.get('sam');
    const nina = userMap.get('nina');
    const alex = userMap.get('alex');
    const zoe = userMap.get('zoe');

    // =========================================================================
    // 2. SEED WORKSPACES (Acme Motors & Rival Corp)
    // =========================================================================
    console.log('🏢 Seeding Organizations (Workspaces)...');

    // Acme Motors
    let acmeWs = await prisma.workspace.findUnique({ where: { slug: 'acme-motors' } });
    if (!acmeWs) {
      acmeWs = await workspacesService.createWorkspace(cara.id, {
        name: 'Acme Motors',
        slug: 'acme-motors',
        logoUrl: 'https://images.unsplash.com/photo-1549399542-7e3f8b79c341?w=128&q=80',
        themeSettings: { accentColour: '#0284c7', density: 'comfortable' },
      });
      console.log('   ✔ Created workspace: Acme Motors (acme-motors)');
    } else {
      console.log('   ✔ Reusing existing workspace: Acme Motors');
    }

    // Rival Corp
    let rivalWs = await prisma.workspace.findUnique({ where: { slug: 'rival-corp' } });
    if (!rivalWs) {
      rivalWs = await workspacesService.createWorkspace(zoe.id, {
        name: 'Rival Corp',
        slug: 'rival-corp',
        logoUrl: 'https://images.unsplash.com/photo-1551836022-d5d88e9218df?w=128&q=80',
        themeSettings: { accentColour: '#dc2626', density: 'comfortable' },
      });
      console.log('   ✔ Created workspace: Rival Corp (rival-corp)');
    } else {
      console.log('   ✔ Reusing existing workspace: Rival Corp');
    }

    // Ensure Default NodeTypes and StatusSets exist for Acme
    let taskType = await prisma.nodeType.findFirst({ where: { workspaceId: acmeWs.id, key: 'task' } });
    let stageType = await prisma.nodeType.findFirst({ where: { workspaceId: acmeWs.id, key: 'stage' } });
    let defaultStatusSet = await prisma.statusSet.findFirst({ where: { workspaceId: acmeWs.id, isDefault: true } });

    if (!defaultStatusSet) {
      defaultStatusSet = await prisma.statusSet.create({
        data: {
          workspaceId: acmeWs.id,
          name: 'Default Status Set',
          isDefault: true,
          statuses: {
            create: [
              { key: 'not_started', labelI18n: { en: 'Not Started' }, colour: '#94a3b8', icon: 'Circle', category: 'not_started', displayOrder: 0 },
              { key: 'in_progress', labelI18n: { en: 'In Progress' }, colour: '#3b82f6', icon: 'Clock', category: 'active', displayOrder: 1 },
              { key: 'blocked', labelI18n: { en: 'Blocked' }, colour: '#f59e0b', icon: 'AlertTriangle', category: 'blocked', displayOrder: 2 },
              { key: 'done', labelI18n: { en: 'Done' }, colour: '#10b981', icon: 'CheckCircle2', category: 'done', displayOrder: 3 },
            ],
          },
        },
      });
    }

    if (!taskType) {
      taskType = await prisma.nodeType.create({
        data: {
          workspaceId: acmeWs.id,
          key: 'task',
          name: 'Task',
          icon: 'CheckSquare',
          colour: '#3b82f6',
          isGroup: false,
          isSystem: true,
          defaultStatusSetId: defaultStatusSet.id,
        },
      });
    }

    if (!stageType) {
      stageType = await prisma.nodeType.create({
        data: {
          workspaceId: acmeWs.id,
          key: 'stage',
          name: 'Stage / Group',
          icon: 'Layers',
          colour: '#8b5cf6',
          isGroup: true,
          isSystem: true,
          defaultStatusSetId: defaultStatusSet.id,
        },
      });
    }

    // =========================================================================
    // 3. SEED MEMBERSHIPS
    // =========================================================================
    console.log('🤝 Assigning Workspace Memberships...');
    for (const spec of DEMO_USERS) {
      const user = userMap.get(spec.key);
      const wsId = spec.org === 'acme' ? acmeWs.id : rivalWs.id;
      await prisma.membership.upsert({
        where: { workspaceId_userId: { workspaceId: wsId, userId: user.id } },
        update: { role: spec.orgRole },
        create: { workspaceId: wsId, userId: user.id, role: spec.orgRole },
      });
    }
    console.log('   ✔ Workspace memberships assigned.');

    // =========================================================================
    // 4. SEED DEPARTMENTS & POSITIONS (Reporting Chain: Maya, Sam -> Tom -> Mia -> Dan -> Cara)
    // =========================================================================
    console.log('📊 Configuring Organizational Hierarchy & Positions...');

    // Departments
    let execDept = await prisma.department.findFirst({ where: { workspaceId: acmeWs.id, name: 'Executive Leadership' } });
    if (!execDept) {
      execDept = await prisma.department.create({
        data: { workspaceId: acmeWs.id, name: 'Executive Leadership', code: 'EXEC', managerId: cara.id },
      });
    }

    let engDept = await prisma.department.findFirst({ where: { workspaceId: acmeWs.id, name: 'Engineering & Operations' } });
    if (!engDept) {
      engDept = await prisma.department.create({
        data: {
          workspaceId: acmeWs.id,
          name: 'Engineering & Operations',
          code: 'ENG',
          parentDepartmentId: execDept.id,
          managerId: mia.id,
        },
      });
    }

    // Positions & Reporting Hierarchy
    // CEO: Cara
    let posCara = await prisma.position.findFirst({ where: { workspaceId: acmeWs.id, userId: cara.id } });
    if (!posCara) {
      posCara = await prisma.position.create({
        data: { workspaceId: acmeWs.id, departmentId: execDept.id, title: 'Chief Executive Officer', userId: cara.id },
      });
    }

    // Director: Dan -> Cara
    let posDan = await prisma.position.findFirst({ where: { workspaceId: acmeWs.id, userId: dan.id } });
    if (!posDan) {
      posDan = await prisma.position.create({
        data: {
          workspaceId: acmeWs.id,
          departmentId: engDept.id,
          title: 'Engineering Director',
          userId: dan.id,
          reportsToPositionId: posCara.id,
        },
      });
    } else if (posDan.reportsToPositionId !== posCara.id) {
      posDan = await prisma.position.update({ where: { id: posDan.id }, data: { reportsToPositionId: posCara.id } });
    }

    // Manager: Mia -> Dan
    let posMia = await prisma.position.findFirst({ where: { workspaceId: acmeWs.id, userId: mia.id } });
    if (!posMia) {
      posMia = await prisma.position.create({
        data: {
          workspaceId: acmeWs.id,
          departmentId: engDept.id,
          title: 'Software Engineering Manager',
          userId: mia.id,
          reportsToPositionId: posDan.id,
        },
      });
    } else if (posMia.reportsToPositionId !== posDan.id) {
      posMia = await prisma.position.update({ where: { id: posMia.id }, data: { reportsToPositionId: posDan.id } });
    }

    // Team Leader: Tom -> Mia
    let posTom = await prisma.position.findFirst({ where: { workspaceId: acmeWs.id, userId: tom.id } });
    if (!posTom) {
      posTom = await prisma.position.create({
        data: {
          workspaceId: acmeWs.id,
          departmentId: engDept.id,
          title: 'Technical Team Lead',
          userId: tom.id,
          reportsToPositionId: posMia.id,
        },
      });
    } else if (posTom.reportsToPositionId !== posMia.id) {
      posTom = await prisma.position.update({ where: { id: posTom.id }, data: { reportsToPositionId: posMia.id } });
    }

    // Senior Engineer: Maya -> Tom
    let posMaya = await prisma.position.findFirst({ where: { workspaceId: acmeWs.id, userId: maya.id } });
    if (!posMaya) {
      posMaya = await prisma.position.create({
        data: {
          workspaceId: acmeWs.id,
          departmentId: engDept.id,
          title: 'Senior Software Engineer',
          userId: maya.id,
          reportsToPositionId: posTom.id,
        },
      });
    } else if (posMaya.reportsToPositionId !== posTom.id) {
      posMaya = await prisma.position.update({ where: { id: posMaya.id }, data: { reportsToPositionId: posTom.id } });
    }

    // Systems Engineer: Sam -> Tom
    let posSam = await prisma.position.findFirst({ where: { workspaceId: acmeWs.id, userId: sam.id } });
    if (!posSam) {
      posSam = await prisma.position.create({
        data: {
          workspaceId: acmeWs.id,
          departmentId: engDept.id,
          title: 'DevOps & Systems Engineer',
          userId: sam.id,
          reportsToPositionId: posTom.id,
        },
      });
    } else if (posSam.reportsToPositionId !== posTom.id) {
      posSam = await prisma.position.update({ where: { id: posSam.id }, data: { reportsToPositionId: posTom.id } });
    }

    console.log('   ✔ Reporting hierarchy established: Maya, Sam -> Tom -> Mia -> Dan -> Cara');

    // =========================================================================
    // 5. GRANT ALEX ONLY TECHNICAL-ADMIN PERMISSIONS (NO BUSINESS CONTENT)
    // =========================================================================
    console.log('🔒 Configuring Technical Administrator Isolation for Alex...');
    const existingAlexScoped = await prisma.scopedRoleAssignment.findFirst({
      where: { workspaceId: acmeWs.id, userId: alex.id, scope: RoleScopeType.ORGANIZATION },
    });
    if (!existingAlexScoped) {
      await prisma.scopedRoleAssignment.create({
        data: {
          workspaceId: acmeWs.id,
          userId: alex.id,
          role: 'SYSTEM_ADMINISTRATOR',
          scope: RoleScopeType.ORGANIZATION,
          resourceId: acmeWs.id,
          grantedById: cara.id,
        },
      });
    }
    // Alex is not given project memberships or access grants to Project 1 or Project 2!
    console.log('   ✔ Alex configured with workspace technical-admin role; business content access isolated.');

    // =========================================================================
    // 6. SEED APPROVAL POLICIES
    // =========================================================================
    console.log('📋 Configuring Versioned Approval Policies...');

    // A. Normal: Tom (Default)
    const existingNormal = await prisma.approvalPolicy.findFirst({
      where: { workspaceId: acmeWs.id, name: 'Normal' },
    });
    if (!existingNormal) {
      await approvalsService.createPolicy(acmeWs.id, cara.id, {
        name: 'Normal',
        description: 'Standard single-stage approval by Technical Team Lead',
        isDefault: true,
        operationType: 'TASK_COMPLETION',
        stages: [
          {
            stageOrder: 1,
            name: 'Team Leader Review',
            mode: 'SEQUENTIAL',
            rule: 'ANY_ONE_APPROVES',
            specificApproverId: tom.id,
            allowDelegation: true,
            dueDurationHours: 48,
          },
        ],
      });
      console.log('   ✔ Created policy: Normal (Tom)');
    }

    // B. Important: Tom then Mia (for A1 and B1)
    const existingImportant = await prisma.approvalPolicy.findFirst({
      where: { workspaceId: acmeWs.id, name: 'Important' },
    });
    if (!existingImportant) {
      await approvalsService.createPolicy(acmeWs.id, cara.id, {
        name: 'Important',
        description: 'Two-stage sequential approval (Tom then Mia) for architectural core modules',
        isDefault: false,
        operationType: 'TASK_COMPLETION',
        riskImpact: 'HIGH',
        stages: [
          {
            stageOrder: 1,
            name: 'Stage 1: Team Leader Review',
            mode: 'SEQUENTIAL',
            rule: 'ANY_ONE_APPROVES',
            specificApproverId: tom.id,
            allowDelegation: true,
            dueDurationHours: 48,
          },
          {
            stageOrder: 2,
            name: 'Stage 2: Engineering Manager Approval',
            mode: 'SEQUENTIAL',
            rule: 'ANY_ONE_APPROVES',
            specificApproverId: mia.id,
            allowDelegation: true,
            dueDurationHours: 48,
          },
        ],
      });
      console.log('   ✔ Created policy: Important (Tom -> Mia)');
    }

    // C. Critical: Tom, Mia, Cara (for A2 and Confidential work)
    const existingCritical = await prisma.approvalPolicy.findFirst({
      where: { workspaceId: acmeWs.id, name: 'Critical' },
    });
    if (!existingCritical) {
      await approvalsService.createPolicy(acmeWs.id, cara.id, {
        name: 'Critical',
        description: 'Three-stage sequential approval (Tom -> Mia -> Cara) for critical security reviews',
        isDefault: false,
        operationType: 'TASK_COMPLETION',
        riskImpact: 'CRITICAL',
        stages: [
          { stageOrder: 1, name: 'Stage 1: Team Leader Review', mode: 'SEQUENTIAL', rule: 'ANY_ONE_APPROVES', specificApproverId: tom.id, allowDelegation: false },
          { stageOrder: 2, name: 'Stage 2: Manager Review', mode: 'SEQUENTIAL', rule: 'ANY_ONE_APPROVES', specificApproverId: mia.id, allowDelegation: false },
          { stageOrder: 3, name: 'Stage 3: Executive Sign-Off', mode: 'SEQUENTIAL', rule: 'ANY_ONE_APPROVES', specificApproverId: cara.id, allowDelegation: false },
        ],
      });
      console.log('   ✔ Created policy: Critical (Tom -> Mia -> Cara)');
    }

    // C2. Critical Confidential: Tom, Mia, Cara for Confidential work
    const existingCriticalConfidential = await prisma.approvalPolicy.findFirst({
      where: { workspaceId: acmeWs.id, name: 'Critical (Confidential Work)' },
    });
    if (!existingCriticalConfidential) {
      await approvalsService.createPolicy(acmeWs.id, cara.id, {
        name: 'Critical (Confidential Work)',
        description: 'Three-stage sequential approval (Tom -> Mia -> Cara) for confidential initiatives',
        isDefault: false,
        operationType: 'TASK_COMPLETION',
        confidentiality: ConfidentialityLevel.CONFIDENTIAL,
        stages: [
          { stageOrder: 1, name: 'Stage 1: Team Leader Review', mode: 'SEQUENTIAL', rule: 'ANY_ONE_APPROVES', specificApproverId: tom.id, allowDelegation: false },
          { stageOrder: 2, name: 'Stage 2: Manager Review', mode: 'SEQUENTIAL', rule: 'ANY_ONE_APPROVES', specificApproverId: mia.id, allowDelegation: false },
          { stageOrder: 3, name: 'Stage 3: Executive Sign-Off', mode: 'SEQUENTIAL', rule: 'ANY_ONE_APPROVES', specificApproverId: cara.id, allowDelegation: false },
        ],
      });
      console.log('   ✔ Created policy: Critical (Confidential Work)');
    }

    // D. Project Deletion: Cara
    const existingDeletion = await prisma.approvalPolicy.findFirst({
      where: { workspaceId: acmeWs.id, name: 'Project Deletion' },
    });
    if (!existingDeletion) {
      await approvalsService.createPolicy(acmeWs.id, cara.id, {
        name: 'Project Deletion',
        description: 'Executive authorization required for project decommissioning',
        isDefault: false,
        operationType: 'PROJECT_DELETION',
        stages: [
          { stageOrder: 1, name: 'Executive Sign-Off', mode: 'SEQUENTIAL', rule: 'ANY_ONE_APPROVES', specificApproverId: cara.id, allowDelegation: false },
        ],
      });
      console.log('   ✔ Created policy: Project Deletion (Cara)');
    }

    // =========================================================================
    // 7. SEED PROJECT 1: "Dealership Portal Launch" (INTERNAL)
    // =========================================================================
    console.log('🚀 Seeding Project 1: Dealership Portal Launch (Internal)...');
    let p1 = await prisma.project.findFirst({
      where: { workspaceId: acmeWs.id, name: 'Dealership Portal Launch', deletedAt: null },
    });

    if (!p1) {
      p1 = await prisma.project.create({
        data: {
          workspaceId: acmeWs.id,
          name: 'Dealership Portal Launch',
          key: 'DPL',
          description: 'Enterprise dealership management portal replacing legacy extranet systems.',
          ownerId: cara.id,
          responsibleManagerId: mia.id,
          departmentId: engDept.id,
          classification: ConfidentialityLevel.INTERNAL,
          status: 'ACTIVE',
        },
      });

      await auditService.recordAuditEvent({
        workspaceId: acmeWs.id,
        actorId: cara.id,
        action: 'PROJECT_CREATED',
        targetType: 'project',
        targetId: p1.id,
        afterValues: { name: p1.name, key: p1.key, classification: p1.classification },
        outcome: 'SUCCESS',
      });
    }

    // Project 1 Members: Cara (Owner), Mia (Manager), Tom, Maya, Sam
    const p1Members = [
      { userId: cara.id, role: Role.ADMIN },
      { userId: mia.id, role: Role.MANAGER },
      { userId: tom.id, role: Role.TEAM_LEAD },
      { userId: maya.id, role: Role.MEMBER },
      { userId: sam.id, role: Role.MEMBER },
    ];
    for (const m of p1Members) {
      await prisma.projectMember.upsert({
        where: { projectId_userId: { projectId: p1.id, userId: m.userId } },
        update: { role: m.role },
        create: { projectId: p1.id, userId: m.userId, role: m.role },
      });
    }

    // Task Tree for Project 1:
    // A Infrastructure (A1 Set up servers (A1.1 Provision database, A1.2 Configure backups optional), A2 Security review)
    // B Application Development (B1 Login module, B2 Inventory module)
    // C Testing and Release

    // Node A: Infrastructure (Stage / Group)
    let nodeA = await prisma.node.findFirst({ where: { projectId: p1.id, title: 'A Infrastructure', deletedAt: null } });
    if (!nodeA) {
      nodeA = await prisma.node.create({
        data: {
          workspaceId: acmeWs.id,
          projectId: p1.id,
          nodeTypeId: stageType.id,
          title: 'A Infrastructure',
          description: 'Cloud environment, database architecture, and network security foundations.',
          depth: 1,
          path: '',
          isRequired: true,
          positionX: 50,
          positionY: 100,
        },
      });
      await prisma.node.update({ where: { id: nodeA.id }, data: { path: `/${nodeA.id}` } });
    }

    // Node A1: Set up servers (Parent: A) - Matches Important Policy
    let nodeA1 = await prisma.node.findFirst({ where: { projectId: p1.id, title: 'A1 Set up servers', deletedAt: null } });
    if (!nodeA1) {
      nodeA1 = await prisma.node.create({
        data: {
          workspaceId: acmeWs.id,
          projectId: p1.id,
          parentNodeId: nodeA.id,
          nodeTypeId: taskType.id,
          title: 'A1 Set up servers',
          description: 'Provision compute clusters, networking VPC, and container runtime.',
          depth: 2,
          path: `${nodeA.path}/${nodeA.id}`,
          isRequired: true,
          positionX: 100,
          positionY: 180,
          customData: { riskImpact: 'HIGH', policyName: 'Important' },
        },
      });
      await prisma.node.update({ where: { id: nodeA1.id }, data: { path: `/${nodeA.id}/${nodeA1.id}` } });
    }

    // Node A1.1: Provision database (Parent: A1, Assignee: Maya, Needs 1 Evidence & 2-Item Checklist)
    let nodeA1_1 = await prisma.node.findFirst({ where: { projectId: p1.id, title: 'A1.1 Provision database', deletedAt: null } });
    if (!nodeA1_1) {
      nodeA1_1 = await prisma.node.create({
        data: {
          workspaceId: acmeWs.id,
          projectId: p1.id,
          parentNodeId: nodeA1.id,
          nodeTypeId: taskType.id,
          title: 'A1.1 Provision database',
          description: 'Deploy PostgreSQL 15 cluster, execute initial schema migration, and verify SSL.',
          ownerId: maya.id,
          assignedById: mia.id,
          depth: 3,
          path: `${nodeA1.path}/${nodeA1_1?.id || 'temp'}`,
          isRequired: true,
          mandatoryEvidenceCount: 1,
          checklist: [
            { id: 'chk-db-1', text: 'Execute Prisma migration 20261029 on production replica', completed: false },
            { id: 'chk-db-2', text: 'Verify connection pooling limits and SSL encryption handshakes', completed: false },
          ],
          positionX: 120,
          positionY: 260,
        },
      });
      await prisma.node.update({ where: { id: nodeA1_1.id }, data: { path: `/${nodeA.id}/${nodeA1.id}/${nodeA1_1.id}` } });
    }

    // Node A1.2: Configure backups (optional) (Parent: A1, Assignee: Sam)
    let nodeA1_2 = await prisma.node.findFirst({ where: { projectId: p1.id, title: 'A1.2 Configure backups (optional)', deletedAt: null } });
    if (!nodeA1_2) {
      nodeA1_2 = await prisma.node.create({
        data: {
          workspaceId: acmeWs.id,
          projectId: p1.id,
          parentNodeId: nodeA1.id,
          nodeTypeId: taskType.id,
          title: 'A1.2 Configure backups (optional)',
          description: 'Automated nightly snapshot replication to cold storage.',
          ownerId: sam.id,
          assignedById: mia.id,
          depth: 3,
          path: `/${nodeA.id}/${nodeA1.id}`,
          isRequired: false, // Optional
          positionX: 380,
          positionY: 260,
        },
      });
      await prisma.node.update({ where: { id: nodeA1_2.id }, data: { path: `/${nodeA.id}/${nodeA1.id}/${nodeA1_2.id}` } });
    }

    // Node A2: Security review (Parent: A, Assignee: Maya) - Matches Critical Policy
    let nodeA2 = await prisma.node.findFirst({ where: { projectId: p1.id, title: 'A2 Security review', deletedAt: null } });
    if (!nodeA2) {
      nodeA2 = await prisma.node.create({
        data: {
          workspaceId: acmeWs.id,
          projectId: p1.id,
          parentNodeId: nodeA.id,
          nodeTypeId: taskType.id,
          title: 'A2 Security review',
          description: 'Network perimeter penetration testing, RBAC verification, and secrets scanning.',
          ownerId: maya.id,
          assignedById: mia.id,
          depth: 2,
          path: `/${nodeA.id}`,
          isRequired: true,
          positionX: 420,
          positionY: 180,
          customData: { riskImpact: 'CRITICAL', policyName: 'Critical' },
        },
      });
      await prisma.node.update({ where: { id: nodeA2.id }, data: { path: `/${nodeA.id}/${nodeA2.id}` } });
    }

    // Node B: Application Development (Stage / Group)
    let nodeB = await prisma.node.findFirst({ where: { projectId: p1.id, title: 'B Application Development', deletedAt: null } });
    if (!nodeB) {
      nodeB = await prisma.node.create({
        data: {
          workspaceId: acmeWs.id,
          projectId: p1.id,
          nodeTypeId: stageType.id,
          title: 'B Application Development',
          description: 'Frontend portal interfaces and core microservice business logic.',
          depth: 1,
          path: '',
          isRequired: true,
          positionX: 50,
          positionY: 380,
        },
      });
      await prisma.node.update({ where: { id: nodeB.id }, data: { path: `/${nodeB.id}` } });
    }

    // Node B1: Login module (Parent: B, Assignee: Maya) - Matches Important Policy
    let nodeB1 = await prisma.node.findFirst({ where: { projectId: p1.id, title: 'B1 Login module', deletedAt: null } });
    if (!nodeB1) {
      nodeB1 = await prisma.node.create({
        data: {
          workspaceId: acmeWs.id,
          projectId: p1.id,
          parentNodeId: nodeB.id,
          nodeTypeId: taskType.id,
          title: 'B1 Login module',
          description: 'Implement JWT authentication, Google OAuth SSO, and MFA recovery codes.',
          ownerId: maya.id,
          assignedById: mia.id,
          depth: 2,
          path: `/${nodeB.id}`,
          isRequired: true,
          positionX: 100,
          positionY: 460,
          customData: { riskImpact: 'HIGH', policyName: 'Important' },
        },
      });
      await prisma.node.update({ where: { id: nodeB1.id }, data: { path: `/${nodeB.id}/${nodeB1.id}` } });
    }

    // Node B2: Inventory module (Parent: B, Assignee: Sam)
    let nodeB2 = await prisma.node.findFirst({ where: { projectId: p1.id, title: 'B2 Inventory module', deletedAt: null } });
    if (!nodeB2) {
      nodeB2 = await prisma.node.create({
        data: {
          workspaceId: acmeWs.id,
          projectId: p1.id,
          parentNodeId: nodeB.id,
          nodeTypeId: taskType.id,
          title: 'B2 Inventory module',
          description: 'Vehicle inventory ledger, live VIN lookup, and allocation workflows.',
          ownerId: sam.id,
          assignedById: mia.id,
          depth: 2,
          path: `/${nodeB.id}`,
          isRequired: true,
          positionX: 380,
          positionY: 460,
        },
      });
      await prisma.node.update({ where: { id: nodeB2.id }, data: { path: `/${nodeB.id}/${nodeB2.id}` } });
    }

    // Node C: Testing and Release (Assignee: Tom)
    let nodeC = await prisma.node.findFirst({ where: { projectId: p1.id, title: 'C Testing and Release', deletedAt: null } });
    if (!nodeC) {
      nodeC = await prisma.node.create({
        data: {
          workspaceId: acmeWs.id,
          projectId: p1.id,
          nodeTypeId: taskType.id,
          title: 'C Testing and Release',
          description: 'End-to-end integration test execution, canary deployment, and final rollout.',
          ownerId: tom.id,
          assignedById: mia.id,
          depth: 1,
          path: '',
          isRequired: true,
          positionX: 50,
          positionY: 580,
        },
      });
      await prisma.node.update({ where: { id: nodeC.id }, data: { path: `/${nodeC.id}` } });
    }

    // Add Edges / Dependencies: A -> B and B -> C
    const existingEdgeAB = await prisma.edge.findFirst({ where: { projectId: p1.id, sourceNodeId: nodeA.id, targetNodeId: nodeB.id } });
    if (!existingEdgeAB) {
      await prisma.edge.create({
        data: { workspaceId: acmeWs.id, projectId: p1.id, sourceNodeId: nodeA.id, targetNodeId: nodeB.id },
      });
    }
    const existingEdgeBC = await prisma.edge.findFirst({ where: { projectId: p1.id, sourceNodeId: nodeB.id, targetNodeId: nodeC.id } });
    if (!existingEdgeBC) {
      await prisma.edge.create({
        data: { workspaceId: acmeWs.id, projectId: p1.id, sourceNodeId: nodeB.id, targetNodeId: nodeC.id },
      });
    }

    console.log('   ✔ Project 1 Task Tree fully assembled.');

    // =========================================================================
    // 8. SEED PROJECT 2: "Project Atlas" (CONFIDENTIAL)
    // =========================================================================
    console.log('🔒 Seeding Project 2: Project Atlas (Confidential)...');
    let p2 = await prisma.project.findFirst({
      where: { workspaceId: acmeWs.id, name: 'Project Atlas', deletedAt: null },
    });

    if (!p2) {
      p2 = await prisma.project.create({
        data: {
          workspaceId: acmeWs.id,
          name: 'Project Atlas',
          key: 'ATLAS',
          description: 'Confidential strategic M&A evaluation and technology asset audit.',
          ownerId: cara.id,
          responsibleManagerId: mia.id,
          classification: ConfidentialityLevel.CONFIDENTIAL,
          status: 'ACTIVE',
        },
      });

      await auditService.recordAuditEvent({
        workspaceId: acmeWs.id,
        actorId: cara.id,
        action: 'PROJECT_CREATED',
        targetType: 'project',
        targetId: p2.id,
        afterValues: { name: p2.name, key: p2.key, classification: p2.classification },
        outcome: 'SUCCESS',
      });
    }

    // Project 2 Members: Owner Cara, Manager Mia, Member Sam ONLY!
    const p2Members = [
      { userId: cara.id, role: Role.ADMIN },
      { userId: mia.id, role: Role.MANAGER },
      { userId: sam.id, role: Role.MEMBER },
    ];
    for (const m of p2Members) {
      await prisma.projectMember.upsert({
        where: { projectId_userId: { projectId: p2.id, userId: m.userId } },
        update: { role: m.role },
        create: { projectId: p2.id, userId: m.userId, role: m.role },
      });
    }

    // Task in Project 2: Due diligence report (Assignee: Sam)
    let nodeAtlas = await prisma.node.findFirst({
      where: { projectId: p2.id, title: 'Due diligence report', deletedAt: null },
    });
    if (!nodeAtlas) {
      nodeAtlas = await prisma.node.create({
        data: {
          workspaceId: acmeWs.id,
          projectId: p2.id,
          nodeTypeId: taskType.id,
          title: 'Due diligence report',
          description: 'Comprehensive financial, regulatory, and proprietary codebase assessment.',
          ownerId: sam.id,
          assignedById: mia.id,
          classification: ConfidentialityLevel.CONFIDENTIAL,
          depth: 1,
          path: '',
          isRequired: true,
          positionX: 100,
          positionY: 100,
        },
      });
      await prisma.node.update({ where: { id: nodeAtlas.id }, data: { path: `/${nodeAtlas.id}` } });
    }
    console.log('   ✔ Project 2 (Confidential) created with single task assigned to Sam.');

    // =========================================================================
    // 9. PRINT DIRECTORY TABLE & LOGIN INSTRUCTIONS
    // =========================================================================
    console.log('\n========================================================================================================================');
    console.log('                                     FLOWTRACK DEMO DATASET DIRECTORY');
    console.log('========================================================================================================================');
    console.log(
      'Email'.padEnd(18) +
      'Password'.padEnd(14) +
      'Full Name'.padEnd(16) +
      'Org'.padEnd(14) +
      'Role (Title)'.padEnd(32) +
      'Reporting Line / Clearance'
    );
    console.log('------------------------------------------------------------------------------------------------------------------------');

    for (const u of DEMO_USERS) {
      const orgName = u.org === 'acme' ? 'Acme Motors' : 'Rival Corp';
      const roleStr = `${u.orgRole} (${u.jobTitle.split(' ')[0]})`;
      console.log(
        u.email.padEnd(18) +
        DEMO_PASSWORD.padEnd(14) +
        u.fullName.padEnd(16) +
        orgName.padEnd(14) +
        roleStr.padEnd(32) +
        u.notes
      );
    }
    console.log('========================================================================================================================\n');

    console.log('🔑 LOGIN & ACCESS DETAILS:');
    console.log('   • Web Application URL: http://localhost:5173');
    console.log('   • API Login Endpoint:  http://localhost:3001/auth/login');
    console.log('   • Common Password:     Demo@12345\n');

    console.log('📝 EXAMPLE LOGIN COMMAND:');
    console.log('   curl -X POST http://localhost:3001/auth/login \\');
    console.log('     -H "Content-Type: application/json" \\');
    console.log('     -d \'{"email":"cara@acme.dev","password":"Demo@12345"}\'\n');

    console.log('🛡️ SECURITY & GOVERNANCE NOTES:');
    console.log('   1. Alex (alex@acme.dev) has Technical-Admin permissions only: zero access to Project 1 or Project 2.');
    console.log('   2. Project Atlas is CONFIDENTIAL: hidden with HTTP 404 from non-members (Tom, Maya, Nina, Alex).');
    console.log('   3. Separation of duties is active on all approval requests: submitters cannot self-approve.\n');

    console.log('✨ Seed script completed successfully!\n');
  } catch (error: any) {
    console.error('\n❌ Error during demo seeding:', error);
    process.exit(1);
  } finally {
    await app.close();
  }
}

runSeed();

