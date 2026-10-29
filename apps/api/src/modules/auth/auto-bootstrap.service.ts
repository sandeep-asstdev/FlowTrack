import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Role, ConfidentialityLevel, RoleScopeType } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const DEMO_PASSWORD = 'Demo@12345';
const DEFAULT_ADMIN_PASSWORD = 'Password123!';

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

@Injectable()
export class AutoBootstrapService implements OnModuleInit {
  private readonly logger = new Logger(AutoBootstrapService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    if (process.env.AUTO_BOOTSTRAP_DISABLED === 'true') {
      this.logger.log('Auto-bootstrap disabled via AUTO_BOOTSTRAP_DISABLED=true');
      return;
    }

    try {
      await this.ensureBootstrapData();
    } catch (err: any) {
      this.logger.error(`Bootstrap check failed: ${err.message}`, err.stack);
    }
  }

  async ensureBootstrapData() {
    this.logger.log('Checking database initialization state...');

    // 1. Ensure Default Admin exists
    await this.ensureDefaultAdmin();

    // 2. Ensure Demo Users & Workspaces exist
    await this.ensureDemoDataset();

    this.logger.log('Database initialization check complete.');
  }

  private async ensureDefaultAdmin() {
    const adminEmail = 'admin@flowtrack.dev';
    const existing = await this.prisma.user.findUnique({ where: { email: adminEmail } });

    if (!existing) {
      this.logger.log(`Provisioning default platform admin (${adminEmail})...`);
      const passwordHash = await bcrypt.hash(DEFAULT_ADMIN_PASSWORD, 10);

      // Create default workspace
      const defaultWs = await this.prisma.workspace.upsert({
        where: { slug: 'acme-developments' },
        update: {},
        create: {
          name: 'Acme Developments',
          slug: 'acme-developments',
          logoUrl: 'https://images.unsplash.com/photo-1541888946425-d0fbb18615f8?w=128&q=80',
          themeSettings: { accentColour: '#3b82f6', density: 'comfortable' },
        },
      });

      const admin = await this.prisma.user.create({
        data: {
          email: adminEmail,
          fullName: 'System Administrator',
          phone: '+919876543210',
          passwordHash,
          avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=96&q=80',
          isActive: true,
        },
      });

      await this.prisma.membership.upsert({
        where: { workspaceId_userId: { workspaceId: defaultWs.id, userId: admin.id } },
        update: { role: Role.ADMIN },
        create: { workspaceId: defaultWs.id, userId: admin.id, role: Role.ADMIN },
      });

      this.logger.log(`Default admin created: ${adminEmail}`);
    }
  }

  async ensureDemoDataset() {
    // Check if demo users already exist
    const sampleUser = await this.prisma.user.findUnique({ where: { email: 'maya@acme.dev' } });
    if (sampleUser) {
      // Already primed
      return;
    }

    this.logger.log('Seeding demo dataset (Acme Motors, Rival Corp, users, projects, tasks, approval policies)...');
    const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
    const userMap = new Map<string, any>();

    // 1. Seed Users
    for (const spec of DEMO_USERS) {
      const user = await this.prisma.user.upsert({
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

    const cara = userMap.get('cara');
    const dan = userMap.get('dan');
    const mia = userMap.get('mia');
    const tom = userMap.get('tom');
    const maya = userMap.get('maya');
    const sam = userMap.get('sam');
    const alex = userMap.get('alex');
    const zoe = userMap.get('zoe');

    // 2. Seed Workspaces
    const acmeWs = await this.prisma.workspace.upsert({
      where: { slug: 'acme-motors' },
      update: {},
      create: {
        name: 'Acme Motors',
        slug: 'acme-motors',
        logoUrl: 'https://images.unsplash.com/photo-1549399542-7e3f8b79c341?w=128&q=80',
        themeSettings: { accentColour: '#0284c7', density: 'comfortable' },
      },
    });

    const rivalWs = await this.prisma.workspace.upsert({
      where: { slug: 'rival-corp' },
      update: {},
      create: {
        name: 'Rival Corp',
        slug: 'rival-corp',
        logoUrl: 'https://images.unsplash.com/photo-1551836022-d5d88e9218df?w=128&q=80',
        themeSettings: { accentColour: '#dc2626', density: 'comfortable' },
      },
    });

    // 3. StatusSet & NodeTypes for Acme Motors
    let defaultStatusSet = await this.prisma.statusSet.findFirst({ where: { workspaceId: acmeWs.id, isDefault: true } });
    if (!defaultStatusSet) {
      defaultStatusSet = await this.prisma.statusSet.create({
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

    let taskType = await this.prisma.nodeType.findFirst({ where: { workspaceId: acmeWs.id, key: 'task' } });
    if (!taskType) {
      taskType = await this.prisma.nodeType.create({
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

    let stageType = await this.prisma.nodeType.findFirst({ where: { workspaceId: acmeWs.id, key: 'stage' } });
    if (!stageType) {
      stageType = await this.prisma.nodeType.create({
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

    // 4. Assign Memberships
    for (const spec of DEMO_USERS) {
      const user = userMap.get(spec.key);
      const wsId = spec.org === 'acme' ? acmeWs.id : rivalWs.id;
      await this.prisma.membership.upsert({
        where: { workspaceId_userId: { workspaceId: wsId, userId: user.id } },
        update: { role: spec.orgRole },
        create: { workspaceId: wsId, userId: user.id, role: spec.orgRole },
      });
    }

    // 5. Departments & Positions
    const execDept = await this.prisma.department.upsert({
      where: { workspaceId_name: { workspaceId: acmeWs.id, name: 'Executive Leadership' } },
      update: {},
      create: { workspaceId: acmeWs.id, name: 'Executive Leadership', code: 'EXEC', managerId: cara.id },
    });

    const engDept = await this.prisma.department.upsert({
      where: { workspaceId_name: { workspaceId: acmeWs.id, name: 'Engineering & Operations' } },
      update: {},
      create: {
        workspaceId: acmeWs.id,
        name: 'Engineering & Operations',
        code: 'ENG',
        parentDepartmentId: execDept.id,
        managerId: mia.id,
      },
    });

    // Positions reporting chain: Maya, Sam -> Tom -> Mia -> Dan -> Cara
    let posCara = await this.prisma.position.findFirst({ where: { workspaceId: acmeWs.id, userId: cara.id } });
    if (!posCara) {
      posCara = await this.prisma.position.create({
        data: { workspaceId: acmeWs.id, departmentId: execDept.id, title: 'Chief Executive Officer', userId: cara.id },
      });
    }

    let posDan = await this.prisma.position.findFirst({ where: { workspaceId: acmeWs.id, userId: dan.id } });
    if (!posDan) {
      posDan = await this.prisma.position.create({
        data: {
          workspaceId: acmeWs.id,
          departmentId: engDept.id,
          title: 'Engineering Director',
          userId: dan.id,
          reportsToPositionId: posCara.id,
        },
      });
    }

    let posMia = await this.prisma.position.findFirst({ where: { workspaceId: acmeWs.id, userId: mia.id } });
    if (!posMia) {
      posMia = await this.prisma.position.create({
        data: {
          workspaceId: acmeWs.id,
          departmentId: engDept.id,
          title: 'Software Engineering Manager',
          userId: mia.id,
          reportsToPositionId: posDan.id,
        },
      });
    }

    let posTom = await this.prisma.position.findFirst({ where: { workspaceId: acmeWs.id, userId: tom.id } });
    if (!posTom) {
      posTom = await this.prisma.position.create({
        data: {
          workspaceId: acmeWs.id,
          departmentId: engDept.id,
          title: 'Technical Team Lead',
          userId: tom.id,
          reportsToPositionId: posMia.id,
        },
      });
    }

    let posMaya = await this.prisma.position.findFirst({ where: { workspaceId: acmeWs.id, userId: maya.id } });
    if (!posMaya) {
      posMaya = await this.prisma.position.create({
        data: {
          workspaceId: acmeWs.id,
          departmentId: engDept.id,
          title: 'Senior Software Engineer',
          userId: maya.id,
          reportsToPositionId: posTom.id,
        },
      });
    }

    let posSam = await this.prisma.position.findFirst({ where: { workspaceId: acmeWs.id, userId: sam.id } });
    if (!posSam) {
      posSam = await this.prisma.position.create({
        data: {
          workspaceId: acmeWs.id,
          departmentId: engDept.id,
          title: 'DevOps & Systems Engineer',
          userId: sam.id,
          reportsToPositionId: posTom.id,
        },
      });
    }

    // 6. Alex Scoped Role (Technical Admin Isolation)
    const existingAlexScoped = await this.prisma.scopedRoleAssignment.findFirst({
      where: { workspaceId: acmeWs.id, userId: alex.id, scope: RoleScopeType.ORGANIZATION },
    });
    if (!existingAlexScoped) {
      await this.prisma.scopedRoleAssignment.create({
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

    // 7. Approval Policies
    const existingNormal = await this.prisma.approvalPolicy.findFirst({ where: { workspaceId: acmeWs.id, name: 'Normal' } });
    if (!existingNormal) {
      await this.prisma.approvalPolicy.create({
        data: {
          workspaceId: acmeWs.id,
          name: 'Normal',
          description: 'Standard single-stage approval by Technical Team Lead',
          isDefault: true,
          operationType: 'TASK_COMPLETION',
          stages: {
            create: [
              { stageOrder: 1, name: 'Team Leader Review', mode: 'SEQUENTIAL', rule: 'ANY_ONE_APPROVES', specificApproverId: tom.id, allowDelegation: true, dueDurationHours: 48 },
            ],
          },
        },
      });
    }

    const existingImportant = await this.prisma.approvalPolicy.findFirst({ where: { workspaceId: acmeWs.id, name: 'Important' } });
    if (!existingImportant) {
      await this.prisma.approvalPolicy.create({
        data: {
          workspaceId: acmeWs.id,
          name: 'Important',
          description: 'Two-stage sequential approval (Tom then Mia) for architectural core modules',
          isDefault: false,
          operationType: 'TASK_COMPLETION',
          riskImpact: 'HIGH',
          stages: {
            create: [
              { stageOrder: 1, name: 'Stage 1: Team Leader Review', mode: 'SEQUENTIAL', rule: 'ANY_ONE_APPROVES', specificApproverId: tom.id, allowDelegation: true, dueDurationHours: 48 },
              { stageOrder: 2, name: 'Stage 2: Engineering Manager Approval', mode: 'SEQUENTIAL', rule: 'ANY_ONE_APPROVES', specificApproverId: mia.id, allowDelegation: true, dueDurationHours: 48 },
            ],
          },
        },
      });
    }

    const existingCritical = await this.prisma.approvalPolicy.findFirst({ where: { workspaceId: acmeWs.id, name: 'Critical' } });
    if (!existingCritical) {
      await this.prisma.approvalPolicy.create({
        data: {
          workspaceId: acmeWs.id,
          name: 'Critical',
          description: 'Three-stage sequential approval (Tom -> Mia -> Cara) for critical security reviews',
          isDefault: false,
          operationType: 'TASK_COMPLETION',
          riskImpact: 'CRITICAL',
          stages: {
            create: [
              { stageOrder: 1, name: 'Stage 1: Team Leader Review', mode: 'SEQUENTIAL', rule: 'ANY_ONE_APPROVES', specificApproverId: tom.id, allowDelegation: false },
              { stageOrder: 2, name: 'Stage 2: Manager Review', mode: 'SEQUENTIAL', rule: 'ANY_ONE_APPROVES', specificApproverId: mia.id, allowDelegation: false },
              { stageOrder: 3, name: 'Stage 3: Executive Sign-Off', mode: 'SEQUENTIAL', rule: 'ANY_ONE_APPROVES', specificApproverId: cara.id, allowDelegation: false },
            ],
          },
        },
      });
    }

    const existingCriticalConfidential = await this.prisma.approvalPolicy.findFirst({ where: { workspaceId: acmeWs.id, name: 'Critical (Confidential Work)' } });
    if (!existingCriticalConfidential) {
      await this.prisma.approvalPolicy.create({
        data: {
          workspaceId: acmeWs.id,
          name: 'Critical (Confidential Work)',
          description: 'Three-stage sequential approval (Tom -> Mia -> Cara) for confidential initiatives',
          isDefault: false,
          operationType: 'TASK_COMPLETION',
          confidentiality: ConfidentialityLevel.CONFIDENTIAL,
          stages: {
            create: [
              { stageOrder: 1, name: 'Stage 1: Team Leader Review', mode: 'SEQUENTIAL', rule: 'ANY_ONE_APPROVES', specificApproverId: tom.id, allowDelegation: false },
              { stageOrder: 2, name: 'Stage 2: Manager Review', mode: 'SEQUENTIAL', rule: 'ANY_ONE_APPROVES', specificApproverId: mia.id, allowDelegation: false },
              { stageOrder: 3, name: 'Stage 3: Executive Sign-Off', mode: 'SEQUENTIAL', rule: 'ANY_ONE_APPROVES', specificApproverId: cara.id, allowDelegation: false },
            ],
          },
        },
      });
    }

    const existingDeletion = await this.prisma.approvalPolicy.findFirst({ where: { workspaceId: acmeWs.id, name: 'Project Deletion' } });
    if (!existingDeletion) {
      await this.prisma.approvalPolicy.create({
        data: {
          workspaceId: acmeWs.id,
          name: 'Project Deletion',
          description: 'Executive authorization required for project decommissioning',
          isDefault: false,
          operationType: 'PROJECT_DELETION',
          stages: {
            create: [
              { stageOrder: 1, name: 'Executive Sign-Off', mode: 'SEQUENTIAL', rule: 'ANY_ONE_APPROVES', specificApproverId: cara.id, allowDelegation: false },
            ],
          },
        },
      });
    }

    // 8. Project 1: "Dealership Portal Launch" (INTERNAL)
    let p1 = await this.prisma.project.findFirst({ where: { workspaceId: acmeWs.id, name: 'Dealership Portal Launch', deletedAt: null } });
    if (!p1) {
      p1 = await this.prisma.project.create({
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
    }

    const p1Members = [
      { userId: cara.id, role: Role.ADMIN },
      { userId: mia.id, role: Role.MANAGER },
      { userId: tom.id, role: Role.TEAM_LEAD },
      { userId: maya.id, role: Role.MEMBER },
      { userId: sam.id, role: Role.MEMBER },
    ];
    for (const m of p1Members) {
      await this.prisma.projectMember.upsert({
        where: { projectId_userId: { projectId: p1.id, userId: m.userId } },
        update: { role: m.role },
        create: { projectId: p1.id, userId: m.userId, role: m.role },
      });
    }

    // Task Tree for Project 1:
    let nodeA = await this.prisma.node.findFirst({ where: { projectId: p1.id, title: 'A Infrastructure', deletedAt: null } });
    if (!nodeA) {
      nodeA = await this.prisma.node.create({
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
      await this.prisma.node.update({ where: { id: nodeA.id }, data: { path: `/${nodeA.id}` } });
    }

    let nodeA1 = await this.prisma.node.findFirst({ where: { projectId: p1.id, title: 'A1 Set up servers', deletedAt: null } });
    if (!nodeA1) {
      nodeA1 = await this.prisma.node.create({
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
      await this.prisma.node.update({ where: { id: nodeA1.id }, data: { path: `/${nodeA.id}/${nodeA1.id}` } });
    }

    let nodeA1_1 = await this.prisma.node.findFirst({ where: { projectId: p1.id, title: 'A1.1 Provision database', deletedAt: null } });
    if (!nodeA1_1) {
      nodeA1_1 = await this.prisma.node.create({
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
      await this.prisma.node.update({ where: { id: nodeA1_1.id }, data: { path: `/${nodeA.id}/${nodeA1.id}/${nodeA1_1.id}` } });
    }

    let nodeA1_2 = await this.prisma.node.findFirst({ where: { projectId: p1.id, title: 'A1.2 Configure backups (optional)', deletedAt: null } });
    if (!nodeA1_2) {
      nodeA1_2 = await this.prisma.node.create({
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
          isRequired: false,
          positionX: 380,
          positionY: 260,
        },
      });
      await this.prisma.node.update({ where: { id: nodeA1_2.id }, data: { path: `/${nodeA.id}/${nodeA1.id}/${nodeA1_2.id}` } });
    }

    let nodeA2 = await this.prisma.node.findFirst({ where: { projectId: p1.id, title: 'A2 Security review', deletedAt: null } });
    if (!nodeA2) {
      nodeA2 = await this.prisma.node.create({
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
      await this.prisma.node.update({ where: { id: nodeA2.id }, data: { path: `/${nodeA.id}/${nodeA2.id}` } });
    }

    let nodeB = await this.prisma.node.findFirst({ where: { projectId: p1.id, title: 'B Application Development', deletedAt: null } });
    if (!nodeB) {
      nodeB = await this.prisma.node.create({
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
      await this.prisma.node.update({ where: { id: nodeB.id }, data: { path: `/${nodeB.id}` } });
    }

    let nodeB1 = await this.prisma.node.findFirst({ where: { projectId: p1.id, title: 'B1 Login module', deletedAt: null } });
    if (!nodeB1) {
      nodeB1 = await this.prisma.node.create({
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
      await this.prisma.node.update({ where: { id: nodeB1.id }, data: { path: `/${nodeB.id}/${nodeB1.id}` } });
    }

    let nodeB2 = await this.prisma.node.findFirst({ where: { projectId: p1.id, title: 'B2 Inventory module', deletedAt: null } });
    if (!nodeB2) {
      nodeB2 = await this.prisma.node.create({
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
      await this.prisma.node.update({ where: { id: nodeB2.id }, data: { path: `/${nodeB.id}/${nodeB2.id}` } });
    }

    let nodeC = await this.prisma.node.findFirst({ where: { projectId: p1.id, title: 'C Testing and Release', deletedAt: null } });
    if (!nodeC) {
      nodeC = await this.prisma.node.create({
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
      await this.prisma.node.update({ where: { id: nodeC.id }, data: { path: `/${nodeC.id}` } });
    }

    const existingEdgeAB = await this.prisma.edge.findFirst({ where: { projectId: p1.id, sourceNodeId: nodeA.id, targetNodeId: nodeB.id } });
    if (!existingEdgeAB) {
      await this.prisma.edge.create({
        data: { workspaceId: acmeWs.id, projectId: p1.id, sourceNodeId: nodeA.id, targetNodeId: nodeB.id },
      });
    }
    const existingEdgeBC = await this.prisma.edge.findFirst({ where: { projectId: p1.id, sourceNodeId: nodeB.id, targetNodeId: nodeC.id } });
    if (!existingEdgeBC) {
      await this.prisma.edge.create({
        data: { workspaceId: acmeWs.id, projectId: p1.id, sourceNodeId: nodeB.id, targetNodeId: nodeC.id },
      });
    }

    // 9. Project 2: "Project Atlas" (CONFIDENTIAL)
    let p2 = await this.prisma.project.findFirst({ where: { workspaceId: acmeWs.id, name: 'Project Atlas', deletedAt: null } });
    if (!p2) {
      p2 = await this.prisma.project.create({
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
    }

    const p2Members = [
      { userId: cara.id, role: Role.ADMIN },
      { userId: mia.id, role: Role.MANAGER },
      { userId: sam.id, role: Role.MEMBER },
    ];
    for (const m of p2Members) {
      await this.prisma.projectMember.upsert({
        where: { projectId_userId: { projectId: p2.id, userId: m.userId } },
        update: { role: m.role },
        create: { projectId: p2.id, userId: m.userId, role: m.role },
      });
    }

    let nodeAtlas = await this.prisma.node.findFirst({ where: { projectId: p2.id, title: 'Due diligence report', deletedAt: null } });
    if (!nodeAtlas) {
      nodeAtlas = await this.prisma.node.create({
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
      await this.prisma.node.update({ where: { id: nodeAtlas.id }, data: { path: `/${nodeAtlas.id}` } });
    }

    this.logger.log('Demo dataset successfully initialized and ready for manual testing!');
  }
}
