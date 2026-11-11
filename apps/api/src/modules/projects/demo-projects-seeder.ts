import { PrismaClient, Role, Priority, ConfidentialityLevel } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

export const DEMO_AVATARS = {
  sandeep: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=256&h=256&fit=crop&crop=faces',
  admin: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=256&h=256&fit=crop&crop=faces',
  manager1: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=256&h=256&fit=crop&crop=faces',
  manager2: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=256&h=256&fit=crop&crop=faces',
  lead3: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=256&h=256&fit=crop&crop=faces',
  lead1: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=256&h=256&fit=crop&crop=faces',
  member1: 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=256&h=256&fit=crop&crop=faces',
  member4: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=256&h=256&fit=crop&crop=faces',
};

export async function ensureDemoUsers(prisma: any) {
  const sandeepPasswordHash = await bcrypt.hash('sandeep@1234', 10);
  const defaultPasswordHash = await bcrypt.hash('Admin@12345', 10);

  const sandeep = await prisma.user.upsert({
    where: { email: 'sandeep@gmail.com' },
    update: {
      fullName: 'Sandeep Raichur',
      phone: '+919606019427',
      avatarUrl: DEMO_AVATARS.sandeep,
      avatarThumbnailUrl: DEMO_AVATARS.sandeep,
      isActive: true,
      phoneVerified: true,
    },
    create: {
      email: 'sandeep@gmail.com',
      fullName: 'Sandeep Raichur',
      phone: '+919606019427',
      passwordHash: sandeepPasswordHash,
      avatarUrl: DEMO_AVATARS.sandeep,
      avatarThumbnailUrl: DEMO_AVATARS.sandeep,
      isActive: true,
      phoneVerified: true,
    },
  });

  const admin = await prisma.user.upsert({
    where: { email: 'admin@flowtrack.dev' },
    update: {
      fullName: 'System Administrator',
      avatarUrl: DEMO_AVATARS.admin,
      avatarThumbnailUrl: DEMO_AVATARS.admin,
      isActive: true,
      phoneVerified: true,
    },
    create: {
      email: 'admin@flowtrack.dev',
      fullName: 'System Administrator',
      phone: '+919876543210',
      passwordHash: defaultPasswordHash,
      avatarUrl: DEMO_AVATARS.admin,
      avatarThumbnailUrl: DEMO_AVATARS.admin,
      isActive: true,
      phoneVerified: true,
    },
  });

  const manager1 = await prisma.user.upsert({
    where: { email: 'manager1@flowtrack.dev' },
    update: {
      fullName: 'Rajesh Verma',
      jobTitle: 'Operations Director',
      avatarUrl: DEMO_AVATARS.manager1,
      avatarThumbnailUrl: DEMO_AVATARS.manager1,
      isActive: true,
    },
    create: {
      email: 'manager1@flowtrack.dev',
      fullName: 'Rajesh Verma',
      jobTitle: 'Operations Director',
      phone: '+919876500001',
      passwordHash: defaultPasswordHash,
      avatarUrl: DEMO_AVATARS.manager1,
      avatarThumbnailUrl: DEMO_AVATARS.manager1,
      isActive: true,
    },
  });

  const manager2 = await prisma.user.upsert({
    where: { email: 'manager2@flowtrack.dev' },
    update: {
      fullName: 'Priya Nair',
      jobTitle: 'VP of Engineering',
      avatarUrl: DEMO_AVATARS.manager2,
      avatarThumbnailUrl: DEMO_AVATARS.manager2,
      isActive: true,
    },
    create: {
      email: 'manager2@flowtrack.dev',
      fullName: 'Priya Nair',
      jobTitle: 'VP of Engineering',
      phone: '+919876500002',
      passwordHash: defaultPasswordHash,
      avatarUrl: DEMO_AVATARS.manager2,
      avatarThumbnailUrl: DEMO_AVATARS.manager2,
      isActive: true,
    },
  });

  const lead3 = await prisma.user.upsert({
    where: { email: 'lead3@flowtrack.dev' },
    update: {
      fullName: 'Arjun Reddy',
      jobTitle: 'Civil & Tech Lead',
      avatarUrl: DEMO_AVATARS.lead3,
      avatarThumbnailUrl: DEMO_AVATARS.lead3,
      isActive: true,
    },
    create: {
      email: 'lead3@flowtrack.dev',
      fullName: 'Arjun Reddy',
      jobTitle: 'Civil & Tech Lead',
      phone: '+919876500003',
      passwordHash: defaultPasswordHash,
      avatarUrl: DEMO_AVATARS.lead3,
      avatarThumbnailUrl: DEMO_AVATARS.lead3,
      isActive: true,
    },
  });

  const member1 = await prisma.user.upsert({
    where: { email: 'member1@flowtrack.dev' },
    update: {
      fullName: 'Rahul Yadav',
      jobTitle: 'Senior Site Engineer',
      avatarUrl: DEMO_AVATARS.member1,
      avatarThumbnailUrl: DEMO_AVATARS.member1,
      isActive: true,
    },
    create: {
      email: 'member1@flowtrack.dev',
      fullName: 'Rahul Yadav',
      jobTitle: 'Senior Site Engineer',
      phone: '+919876500004',
      passwordHash: defaultPasswordHash,
      avatarUrl: DEMO_AVATARS.member1,
      avatarThumbnailUrl: DEMO_AVATARS.member1,
      isActive: true,
    },
  });

  const member4 = await prisma.user.upsert({
    where: { email: 'member4@flowtrack.dev' },
    update: {
      fullName: 'Swati Kulkarni',
      jobTitle: 'Creative & Fit-Out Specialist',
      avatarUrl: DEMO_AVATARS.member4,
      avatarThumbnailUrl: DEMO_AVATARS.member4,
      isActive: true,
    },
    create: {
      email: 'member4@flowtrack.dev',
      fullName: 'Swati Kulkarni',
      jobTitle: 'Creative & Fit-Out Specialist',
      phone: '+919876500005',
      passwordHash: defaultPasswordHash,
      avatarUrl: DEMO_AVATARS.member4,
      avatarThumbnailUrl: DEMO_AVATARS.member4,
      isActive: true,
    },
  });

  return { sandeep, admin, manager1, manager2, lead3, member1, member4 };
}

async function cleanProjectByKey(prisma: any, workspaceId: string, projectKey: string) {
  const existing = await prisma.project.findFirst({
    where: { workspaceId, key: projectKey },
  });
  if (existing) {
    const nodes = await prisma.node.findMany({ where: { projectId: existing.id }, select: { id: true } });
    const nodeIds = nodes.map((n: any) => n.id);

    if (nodeIds.length > 0) {
      await prisma.remark.deleteMany({ where: { nodeId: { in: nodeIds } } }).catch(() => null);
      await prisma.evidence.deleteMany({ where: { nodeId: { in: nodeIds } } }).catch(() => null);
      await prisma.document.deleteMany({ where: { nodeId: { in: nodeIds } } }).catch(() => null);
      await prisma.workSubmission.deleteMany({ where: { nodeId: { in: nodeIds } } }).catch(() => null);
      await prisma.approvalRequest.deleteMany({ where: { nodeId: { in: nodeIds } } }).catch(() => null);
      await prisma.chatThread.deleteMany({ where: { nodeId: { in: nodeIds } } }).catch(() => null);
    }

    await prisma.edge.deleteMany({ where: { projectId: existing.id } }).catch(() => null);
    await prisma.node.deleteMany({ where: { projectId: existing.id } }).catch(() => null);
    await prisma.projectMember.deleteMany({ where: { projectId: existing.id } }).catch(() => null);
    await prisma.project.delete({ where: { id: existing.id } }).catch(() => null);
  }
}

export async function seedAllDummyProjects(prisma: any, workspaceId: string, actorUserId?: string) {
  const users = await ensureDemoUsers(prisma);
  const { sandeep, admin, manager1, manager2, lead3, member1, member4 } = users;

  const primaryActorId = actorUserId || sandeep.id;

  // 1. Memberships
  for (const u of [sandeep, admin, manager1, manager2, lead3, member1, member4]) {
    await prisma.membership.upsert({
      where: { workspaceId_userId: { workspaceId, userId: u.id } },
      update: { role: u.id === sandeep.id || u.id === manager1.id || u.id === manager2.id ? Role.MANAGER : u.id === admin.id ? Role.ADMIN : u.id === lead3.id ? Role.TEAM_LEAD : Role.MEMBER },
      create: { workspaceId, userId: u.id, role: u.id === sandeep.id || u.id === manager1.id || u.id === manager2.id ? Role.MANAGER : u.id === admin.id ? Role.ADMIN : u.id === lead3.id ? Role.TEAM_LEAD : Role.MEMBER },
    });
  }

  // 2. Statuses
  let defaultStatusSet = await prisma.statusSet.findFirst({
    where: { workspaceId, isDefault: true },
    include: { statuses: true },
  });
  if (!defaultStatusSet || defaultStatusSet.statuses.length === 0) {
    defaultStatusSet = await prisma.statusSet.create({
      data: {
        workspaceId,
        name: 'Default Status Set',
        isDefault: true,
        statuses: {
          create: [
            { key: 'not_started', labelI18n: { en: 'Not Started' }, colour: '#94a3b8', category: 'not_started', displayOrder: 0 },
            { key: 'in_progress', labelI18n: { en: 'In Progress' }, colour: '#3b82f6', category: 'active', displayOrder: 1 },
            { key: 'waiting', labelI18n: { en: 'Waiting / Review' }, colour: '#f59e0b', category: 'blocked', displayOrder: 2 },
            { key: 'done', labelI18n: { en: 'Done / Approved' }, colour: '#10b981', category: 'done', displayOrder: 3 },
          ],
        },
      },
      include: { statuses: true },
    });
  }
  const statuses = defaultStatusSet.statuses;
  const statusDone = statuses.find((s: any) => s.category === 'done') || statuses[0];
  const statusActive = statuses.find((s: any) => s.category === 'active') || statuses[0];
  const statusWaiting = statuses.find((s: any) => s.category === 'blocked') || statuses[0];
  const statusNotStarted = statuses.find((s: any) => s.category === 'not_started') || statuses[0];

  // 3. Node Types
  let taskType = await prisma.nodeType.findFirst({ where: { workspaceId, key: 'task' } });
  if (!taskType) {
    taskType = await prisma.nodeType.create({
      data: { workspaceId, key: 'task', name: 'Task', icon: 'CheckSquare', colour: '#3b82f6', defaultStatusSetId: defaultStatusSet.id },
    });
  }
  let milestoneType = await prisma.nodeType.findFirst({ where: { workspaceId, key: 'milestone' } });
  if (!milestoneType) {
    milestoneType = await prisma.nodeType.create({
      data: { workspaceId, key: 'milestone', name: 'Milestone', icon: 'Flag', colour: '#8b5cf6', defaultStatusSetId: defaultStatusSet.id },
    });
  }

  // 4. Approval Policy
  let approvalPolicy = await prisma.approvalPolicy.findFirst({
    where: { workspaceId, isDefault: true },
    include: { stages: true },
  });
  if (!approvalPolicy) {
    approvalPolicy = await prisma.approvalPolicy.create({
      data: {
        workspaceId,
        name: 'Standard Operational Approval',
        description: 'Two-stage signoff: Lead validation followed by Manager authorization',
        isDefault: true,
        operationType: 'TASK_COMPLETION',
        stages: {
          create: [
            { stageOrder: 1, name: 'Lead Technical Review', mode: 'SEQUENTIAL', rule: 'ANY_ONE_APPROVES', specificApproverId: lead3.id },
            { stageOrder: 2, name: 'Executive Authorization', mode: 'SEQUENTIAL', rule: 'ANY_ONE_APPROVES', specificApproverId: manager1.id },
          ],
        },
      },
      include: { stages: true },
    });
  }

  // 5. Custom Field Definitions
  const customFieldsToEnsure = [
    { key: 'cost_center', label: 'Cost Center Code', targetType: 'node', type: 'text' },
    { key: 'risk_level', label: 'Operational Risk Level', targetType: 'node', type: 'text' },
  ];
  for (const cf of customFieldsToEnsure) {
    const existingCf = await prisma.fieldDefinition.findFirst({ where: { workspaceId, fieldKey: cf.key } });
    if (!existingCf) {
      await prisma.fieldDefinition.create({
        data: { workspaceId, fieldKey: cf.key, label: cf.label, targetType: cf.targetType, type: cf.type },
      });
    }
  }

  const now = new Date();

  // =========================================================================
  // PROJECT 1: HERO-01 (Commercial Construction & Dealership, INR ₹)
  // =========================================================================
  await cleanProjectByKey(prisma, workspaceId, 'HERO-01');
  const p1Start = new Date(now.getFullYear(), now.getMonth() - 2, 1);
  const p1Target = new Date(now.getFullYear(), now.getMonth() + 2, 15);

  const heroProject = await prisma.project.create({
    data: {
      workspaceId,
      name: 'Hero MotoCorp 3S Showroom Construction & Launch',
      key: 'HERO-01',
      description: 'Turnkey development of an authorized Hero MotoCorp Dealership & Service Workshop on National Highway (NH-44). Includes commercial land acquisition, structural pre-fab framing, showroom glass facade, 6-bay hydraulic workshop, and launch event.',
      objectives: 'Establish a premier 3S (Sales, Service, Spares) motorcycle dealership to deliver 150+ units monthly with full Hero corporate identity compliance.',
      scope: 'Plot registry, municipal clearances, civil construction, interior branding, service bay lifts, and inaugural ceremony.',
      ownerId: primaryActorId,
      responsibleManagerId: sandeep.id,
      status: 'ACTIVE',
      classification: ConfidentialityLevel.INTERNAL,
      startDate: p1Start,
      targetDate: p1Target,
      settings: {
        industry: 'construction_real_estate',
        currency: 'INR',
        financials: {
          isConfigured: true,
          approvedBudget: 18500000,
          actualExpenditure: 11800000,
          currencyCode: 'INR',
          currencySymbol: '₹',
        },
      },
      members: {
        create: [
          { userId: primaryActorId, role: 'MANAGER' },
          ...(primaryActorId !== sandeep.id ? [{ userId: sandeep.id, role: 'MANAGER' }] : []),
          { userId: admin.id, role: 'ADMIN' },
          { userId: manager1.id, role: 'MANAGER' },
          { userId: lead3.id, role: 'TEAM_LEAD' },
          { userId: member1.id, role: 'MEMBER' },
          { userId: member4.id, role: 'MEMBER' },
        ],
      },
    },
  });

  const p1Stages = [
    {
      title: 'Phase 1: Land Acquisition & Sub-Registrar Stamping',
      desc: 'Commercial highway plot revenue title clearance, registration with sub-registrar, and Hero dealership NOC.',
      posX: 80,
      posY: 180,
      status: statusDone,
      progressPct: 100,
      priority: Priority.HIGH,
      owner: manager1,
      collaborators: [sandeep.id, lead3.id],
      estimatedCost: 4500000,
      actualCost: 4450000,
      allocatedHours: 120,
      actualHours: 115,
      approvalStatus: 'approved',
      approvalFeedback: 'Land revenue deed and corporate NOC fully verified.',
      subtasks: [
        { title: 'NH-44 Highway Plot Survey & Boundary Wall', done: true, progress: 100, owner: member1 },
        { title: 'Title Deed Verification & Sub-Registrar Stamping', done: true, progress: 100, owner: manager1 },
        { title: 'Hero MotoCorp Corporate Location NOC Grant', done: true, progress: 100, owner: sandeep },
      ],
    },
    {
      title: 'Phase 2: Architectural Blueprints & Approvals',
      desc: 'Standardized Hero 3S showroom architectural drawings, structural load test, municipal sanction, and Fire/PHE clearances.',
      posX: 440,
      posY: 180,
      status: statusDone,
      progressPct: 100,
      priority: Priority.MEDIUM,
      owner: lead3,
      collaborators: [member1.id],
      estimatedCost: 1200000,
      actualCost: 1180000,
      allocatedHours: 90,
      actualHours: 85,
      approvalStatus: 'approved',
      approvalFeedback: 'Town planning building sanction granted without encumbrances.',
      subtasks: [
        { title: 'Hero 3S Showroom & Service Bay Floorplan CAD', done: true, progress: 100, owner: lead3 },
        { title: 'Municipal Commercial Building Sanction & Fire NOC', done: true, progress: 100, owner: lead3 },
        { title: '3-Phase Industrial Electric Connection Sanction', done: true, progress: 100, owner: member1 },
      ],
    },
    {
      title: 'Phase 3: Civil Construction & Workshop Bays',
      desc: 'RCC foundation, structural steel framing, composite roof sheeting, toughened glass display facade, and 6 service bays with lift pits.',
      posX: 800,
      posY: 180,
      status: statusActive,
      progressPct: 70,
      priority: Priority.URGENT,
      owner: member1,
      collaborators: [lead3.id, member4.id],
      estimatedCost: 7500000,
      actualCost: 5020000,
      allocatedHours: 320,
      actualHours: 220,
      approvalStatus: 'pending',
      subtasks: [
        { title: 'Foundation Piling & Steel Pre-Engineered Structure', done: true, progress: 100, owner: member1 },
        { title: 'Toughened Glass Display Facade & Brick Masonry', done: true, progress: 90, owner: member1 },
        { title: '6-Bay Hydraulic Lift Installation & Trenching', done: false, progress: 30, owner: member4 },
      ],
    },
    {
      title: 'Phase 4: Interior Fit-out & Brand Identity Branding',
      desc: 'Hero corporate identity red/black wall panelling, outdoor 3D LED pylon, AC customer lounge, spare parts racks, and dealer DMS IT system.',
      posX: 1160,
      posY: 180,
      status: statusActive,
      progressPct: 25,
      priority: Priority.HIGH,
      owner: member4,
      collaborators: [sandeep.id],
      estimatedCost: 3000000,
      actualCost: 1150000,
      allocatedHours: 160,
      actualHours: 40,
      approvalStatus: 'not_required',
      subtasks: [
        { title: 'Exterior 3D Hero Corporate Pylon & Illuminated Facia', done: false, progress: 50, owner: member4 },
        { title: 'Customer Lounge, Executive Desks & Billing Counters', done: false, progress: 20, owner: member4 },
        { title: 'Hero Dealer Management System (DMS) & Server Setup', done: false, progress: 0, owner: sandeep },
      ],
    },
    {
      title: 'Phase 5: Stocking & Grand Showroom Opening',
      desc: 'Delivery of initial 50 bikes stock, service technician training, inaugural pooja ceremony, and first 15 customer keys handover.',
      posX: 1520,
      posY: 180,
      status: statusNotStarted,
      progressPct: 0,
      priority: Priority.HIGH,
      owner: sandeep,
      collaborators: [manager1.id, lead3.id, member1.id, member4.id],
      estimatedCost: 2300000,
      actualCost: 0,
      allocatedHours: 100,
      actualHours: 0,
      approvalStatus: 'not_required',
      subtasks: [
        { title: 'Initial 50 Bikes Stocking (Splendor, HF Deluxe, Vida EV)', done: false, progress: 0, owner: sandeep },
        { title: 'Hero Certified Sales & Technical Staff Onboarding', done: false, progress: 0, owner: manager1 },
        { title: 'Grand Ribbon-Cutting Ceremony & 15 Bike Deliveries', done: false, progress: 0, owner: sandeep },
      ],
    },
  ];

  const p1Nodes = [];
  for (let i = 0; i < p1Stages.length; i++) {
    const s = p1Stages[i];
    const nStart = new Date(p1Start.getTime() + i * 20 * 86400000);
    const nDue = new Date(nStart.getTime() + 18 * 86400000);

    const checklist = s.subtasks.map((st, idx) => ({
      id: `hero-check-${i + 1}-${idx + 1}`,
      text: st.title,
      completed: st.done,
    }));

    const mainNode = await prisma.node.create({
      data: {
        workspaceId,
        projectId: heroProject.id,
        nodeTypeId: milestoneType.id,
        statusId: s.status.id,
        ownerId: s.owner.id,
        reviewerId: sandeep.id,
        title: s.title,
        description: s.desc,
        positionX: s.posX,
        positionY: s.posY,
        width: 300,
        height: 170,
        priority: s.priority,
        isMilestone: true,
        progressPct: s.progressPct,
        startDate: nStart,
        dueDate: nDue,
        estimatedCost: s.estimatedCost,
        actualCost: s.actualCost,
        allocatedHours: s.allocatedHours,
        actualHours: s.actualHours,
        currency: 'INR',
        checklist,
        collaboratorIds: s.collaborators,
        depth: 1,
        path: `/${i + 1}`,
        approvalStatus: s.approvalStatus,
        approvedAt: s.approvalStatus === 'approved' ? nDue : null,
        approvalFeedback: s.approvalFeedback,
        customData: {
          cost_center: `CC-HERO-0${i + 1}`,
          risk_level: i === 2 ? 'HIGH' : 'MEDIUM',
        },
      },
    });
    p1Nodes.push(mainNode);

    for (let c = 0; c < s.subtasks.length; c++) {
      const child = s.subtasks[c];
      const childStatus = child.done ? statusDone : child.progress > 0 ? statusActive : statusNotStarted;

      await prisma.node.create({
        data: {
          workspaceId,
          projectId: heroProject.id,
          parentNodeId: mainNode.id,
          nodeTypeId: taskType.id,
          statusId: childStatus.id,
          ownerId: child.owner.id,
          reviewerId: s.owner.id,
          title: child.title,
          description: `Deliverable task for ${s.title}`,
          positionX: s.posX,
          positionY: s.posY + 220 + c * 135,
          width: 280,
          height: 115,
          priority: s.priority,
          isMilestone: false,
          progressPct: child.progress,
          startDate: nStart,
          dueDate: nDue,
          depth: 2,
          path: `/${mainNode.id}/${c + 1}`,
          approvalStatus: child.done ? 'approved' : 'not_required',
        },
      });
    }

    // Remark with photo
    await prisma.remark.create({
      data: {
        workspaceId,
        nodeId: mainNode.id,
        authorId: sandeep.id,
        body: `Civil site inspection report for ${s.title}: Sub-structure quality standards and safety norms strictly validated on site.`,
        photoUrl: i % 2 === 0 ? 'https://images.unsplash.com/photo-1541888946425-d0fbb186156f?w=600' : 'https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=600',
      },
    });

    // Remark with voice note
    await prisma.remark.create({
      data: {
        workspaceId,
        nodeId: mainNode.id,
        authorId: lead3.id,
        body: `Engineering audio memo for morning standup: Contractor has deployed additional crew for structural steel welding.`,
        voiceUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
      },
    });

    // Work Submission & Approval Request on Phase 3
    if (i === 2) {
      const sub = await prisma.workSubmission.create({
        data: {
          workspaceId,
          nodeId: mainNode.id,
          version: 1,
          submitterId: member1.id,
          summary: 'Civil framing and glass facade 70% completed. Ready for mid-term structural audit and progress signoff.',
          deliverables: '1. Foundation integrity report\n2. Steel truss ultrasonic weld testing certification\n3. Workshop lift pit dimensions diagram',
          status: 'submitted',
        },
      });

      await prisma.approvalRequest.create({
        data: {
          workspaceId,
          projectId: heroProject.id,
          nodeId: mainNode.id,
          submissionId: sub.id,
          submissionVersion: 1,
          operationType: 'TASK_COMPLETION',
          policyId: approvalPolicy.id,
          policyVersion: 1,
          submitterId: member1.id,
          status: 'PENDING',
          currentStageIndex: 0,
          payload: { title: mainNode.title, summary: sub.summary },
        },
      });
    }
  }

  // Connect sequence edges
  for (let i = 0; i < p1Nodes.length - 1; i++) {
    await prisma.edge.create({
      data: {
        workspaceId,
        projectId: heroProject.id,
        sourceNodeId: p1Nodes[i].id,
        targetNodeId: p1Nodes[i + 1].id,
        kind: 'sequence',
        label: `Phase ${i + 1} ➔ Phase ${i + 2}`,
      },
    });
  }

  // =========================================================================
  // PROJECT 2: SAAS-02 (Enterprise Software Microservices, USD $)
  // =========================================================================
  await cleanProjectByKey(prisma, workspaceId, 'SAAS-02');
  const p2Start = new Date(now.getFullYear(), now.getMonth() - 1, 10);
  const p2Target = new Date(now.getFullYear(), now.getMonth() + 3, 1);

  const saasProject = await prisma.project.create({
    data: {
      workspaceId,
      name: 'CloudScale AI: Microservices & Event Stream Engine',
      key: 'SAAS-02',
      description: 'Distributed cloud migration from legacy monolith to Kubernetes microservices, Kafka event streaming, Redis distributed cache, and multi-region failover handling 100K requests/sec.',
      objectives: 'Achieve 99.99% uptime, reduce P99 latency below 35ms, and pass SOC-2 Type II audit.',
      scope: 'Architecture RFC, database sharding, WebSocket gateway, pen testing, and zero-downtime deployment.',
      ownerId: manager2.id,
      responsibleManagerId: manager2.id,
      status: 'ACTIVE',
      classification: ConfidentialityLevel.RESTRICTED,
      startDate: p2Start,
      targetDate: p2Target,
      settings: {
        industry: 'software_saas',
        currency: 'USD',
        financials: {
          isConfigured: true,
          approvedBudget: 450000,
          actualExpenditure: 290000,
          currencyCode: 'USD',
          currencySymbol: '$',
        },
      },
      members: {
        create: [
          { userId: primaryActorId, role: 'MANAGER' },
          { userId: manager2.id, role: 'MANAGER' },
          { userId: lead3.id, role: 'TEAM_LEAD' },
          { userId: member1.id, role: 'MEMBER' },
          { userId: admin.id, role: 'ADMIN' },
        ],
      },
    },
  });

  const p2Stages = [
    {
      title: 'Milestone 1: Distributed Architecture RFC & Schema Design',
      desc: 'Microservices domain decomposition, gRPC interface contracts, and multi-tenant PostgreSQL schema sharding.',
      posX: 80,
      posY: 180,
      status: statusDone,
      progressPct: 100,
      priority: Priority.HIGH,
      owner: manager2,
      collaborators: [lead3.id, sandeep.id],
      estimatedCost: 80000,
      actualCost: 78000,
      allocatedHours: 160,
      actualHours: 155,
      approvalStatus: 'approved',
      approvalFeedback: 'RFC approved by architecture committee with full consensus.',
      subtasks: [
        { title: 'gRPC Protocol Buffer Interface Specifications', done: true, progress: 100, owner: lead3 },
        { title: 'PostgreSQL Citus Distributed Sharding Model', done: true, progress: 100, owner: member1 },
        { title: 'Kafka Event Topic Taxonomy & Partition Plan', done: true, progress: 100, owner: manager2 },
      ],
    },
    {
      title: 'Milestone 2: Real-Time Event Streaming & WebSocket Gateway',
      desc: 'High-throughput event broker processing 100K msg/sec with sub-50ms latency and automatic backpressure.',
      posX: 440,
      posY: 180,
      status: statusActive,
      progressPct: 75,
      priority: Priority.URGENT,
      owner: lead3,
      collaborators: [member1.id],
      estimatedCost: 140000,
      actualCost: 110000,
      allocatedHours: 280,
      actualHours: 210,
      approvalStatus: 'pending',
      subtasks: [
        { title: 'Kafka Cluster Provisioning on Kubernetes with Strimzi', done: true, progress: 100, owner: lead3 },
        { title: 'Socket.IO Horizontal Scaling with Redis Streams Adapter', done: true, progress: 90, owner: member1 },
        { title: 'Synthetic Load Testing to 100,000 Concurrent Connections', done: false, progress: 35, owner: lead3 },
      ],
    },
    {
      title: 'Milestone 3: Zero-Trust Security Audit & SOC-2 Compliance',
      desc: 'Penetration testing, mTLS service mesh, static code analysis (SAST), and automated vulnerability patching.',
      posX: 800,
      posY: 180,
      status: statusWaiting,
      progressPct: 30,
      priority: Priority.HIGH,
      owner: member1,
      collaborators: [manager2.id],
      estimatedCost: 110000,
      actualCost: 52000,
      allocatedHours: 190,
      actualHours: 65,
      approvalStatus: 'not_required',
      subtasks: [
        { title: 'Istio Service Mesh mTLS Enforcement & Secret Rotation', done: true, progress: 100, owner: member1 },
        { title: 'Third-Party Penetration Testing & Threat Modeling', done: false, progress: 40, owner: member1 },
        { title: 'SOC-2 Type II Automated Evidence Collector Bots', done: false, progress: 0, owner: manager2 },
      ],
    },
    {
      title: 'Milestone 4: Multi-Region Production Canary Deployment',
      desc: 'Automated ArgoCD GitOps deployment across US-East, EU-Central, and AP-South with progressive traffic routing.',
      posX: 1160,
      posY: 180,
      status: statusNotStarted,
      progressPct: 0,
      priority: Priority.URGENT,
      owner: sandeep,
      collaborators: [manager2.id, lead3.id, member1.id],
      estimatedCost: 120000,
      actualCost: 0,
      allocatedHours: 200,
      actualHours: 0,
      approvalStatus: 'not_required',
      subtasks: [
        { title: 'ArgoCD Blue/Green Progressive Delivery Rollout', done: false, progress: 0, owner: lead3 },
        { title: 'Global Cloudflare Anycast CDN & DNS Failover', done: false, progress: 0, owner: sandeep },
        { title: 'Executive Launch Cockpit & Datadog Alert Routing', done: false, progress: 0, owner: manager2 },
      ],
    },
  ];

  const p2Nodes = [];
  for (let i = 0; i < p2Stages.length; i++) {
    const s = p2Stages[i];
    const nStart = new Date(p2Start.getTime() + i * 18 * 86400000);
    const nDue = new Date(nStart.getTime() + 16 * 86400000);

    const checklist = s.subtasks.map((st, idx) => ({
      id: `saas-check-${i + 1}-${idx + 1}`,
      text: st.title,
      completed: st.done,
    }));

    const mainNode = await prisma.node.create({
      data: {
        workspaceId,
        projectId: saasProject.id,
        nodeTypeId: milestoneType.id,
        statusId: s.status.id,
        ownerId: s.owner.id,
        reviewerId: manager2.id,
        title: s.title,
        description: s.desc,
        positionX: s.posX,
        positionY: s.posY,
        width: 300,
        height: 170,
        priority: s.priority,
        isMilestone: true,
        progressPct: s.progressPct,
        startDate: nStart,
        dueDate: nDue,
        estimatedCost: s.estimatedCost,
        actualCost: s.actualCost,
        allocatedHours: s.allocatedHours,
        actualHours: s.actualHours,
        currency: 'USD',
        checklist,
        collaboratorIds: s.collaborators,
        depth: 1,
        path: `/${i + 1}`,
        approvalStatus: s.approvalStatus,
        approvedAt: s.approvalStatus === 'approved' ? nDue : null,
        approvalFeedback: s.approvalFeedback,
        customData: {
          cost_center: `ENG-CLOUD-0${i + 1}`,
          risk_level: i === 1 ? 'CRITICAL' : 'HIGH',
        },
      },
    });
    p2Nodes.push(mainNode);

    for (let c = 0; c < s.subtasks.length; c++) {
      const child = s.subtasks[c];
      const childStatus = child.done ? statusDone : child.progress > 0 ? statusActive : statusNotStarted;

      await prisma.node.create({
        data: {
          workspaceId,
          projectId: saasProject.id,
          parentNodeId: mainNode.id,
          nodeTypeId: taskType.id,
          statusId: childStatus.id,
          ownerId: child.owner.id,
          reviewerId: s.owner.id,
          title: child.title,
          description: `Engineering subtask under ${s.title}`,
          positionX: s.posX,
          positionY: s.posY + 220 + c * 135,
          width: 280,
          height: 115,
          priority: s.priority,
          isMilestone: false,
          progressPct: child.progress,
          startDate: nStart,
          dueDate: nDue,
          depth: 2,
          path: `/${mainNode.id}/${c + 1}`,
          approvalStatus: child.done ? 'approved' : 'not_required',
        },
      });
    }

    // Remark with performance flamegraph screenshot
    await prisma.remark.create({
      data: {
        workspaceId,
        nodeId: mainNode.id,
        authorId: lead3.id,
        body: `Load test metrics for ${s.title}: Achieved 104,200 RPS across 3 regions with zero packet drop. CPU utilization steady at 62%.`,
        photoUrl: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=600',
      },
    });
  }

  // Connect sequence & dependency edges (creating critical path!)
  for (let i = 0; i < p2Nodes.length - 1; i++) {
    await prisma.edge.create({
      data: {
        workspaceId,
        projectId: saasProject.id,
        sourceNodeId: p2Nodes[i].id,
        targetNodeId: p2Nodes[i + 1].id,
        kind: i === 1 ? 'dependency' : 'sequence',
        label: i === 1 ? '🚨 Critical Dependency Blocker' : `Sprint ${i + 1} ➔ Sprint ${i + 2}`,
      },
    });
  }

  // =========================================================================
  // PROJECT 3: MKT-03 (Global Brand Relaunch, EUR €)
  // =========================================================================
  await cleanProjectByKey(prisma, workspaceId, 'MKT-03');
  const p3Start = new Date(now.getFullYear(), now.getMonth(), 1);
  const p3Target = new Date(now.getFullYear(), now.getMonth() + 4, 1);

  const mktProject = await prisma.project.create({
    data: {
      workspaceId,
      name: 'OmniBrand 2026: Global Digital & Media Relaunch',
      key: 'MKT-03',
      description: 'Comprehensive brand revitalization, 3D interactive design system, 4K television commercial, social media influencer campaign, and Times Square digital billboard takeover.',
      objectives: 'Drive 2.5B global impressions, lift brand recall by 40%, and achieve 500K app downloads in launch month.',
      scope: 'Brand identity, 4K film production, billboard media buying, influencer kit deliveries, and press conferences.',
      ownerId: member4.id,
      responsibleManagerId: sandeep.id,
      status: 'ACTIVE',
      classification: ConfidentialityLevel.PUBLIC_INTERNAL,
      startDate: p3Start,
      targetDate: p3Target,
      settings: {
        industry: 'marketing_media',
        currency: 'EUR',
        financials: {
          isConfigured: true,
          approvedBudget: 320000,
          actualExpenditure: 145000,
          currencyCode: 'EUR',
          currencySymbol: '€',
        },
      },
      members: {
        create: [
          { userId: primaryActorId, role: 'MANAGER' },
          { userId: member4.id, role: 'MANAGER' },
          { userId: lead3.id, role: 'TEAM_LEAD' },
          { userId: manager1.id, role: 'MANAGER' },
        ],
      },
    },
  });

  const p3Stages = [
    {
      title: 'Creative 1: 3D Visual Identity & Design Guidelines',
      desc: 'Dynamic adaptive logo system, typographic scale, 3D motion primitives, and complete Figma design kit.',
      posX: 80,
      posY: 180,
      status: statusDone,
      progressPct: 100,
      priority: Priority.HIGH,
      owner: member4,
      collaborators: [sandeep.id],
      estimatedCost: 65000,
      actualCost: 63000,
      allocatedHours: 140,
      actualHours: 135,
      approvalStatus: 'approved',
      approvalFeedback: 'Client and Brand Executive approved all color harmonies and 3D marks.',
      subtasks: [
        { title: 'Interactive 3D Glass Logo Primitives in Spline', done: true, progress: 100, owner: member4 },
        { title: 'Master Brand Style Guide & Font Licensing', done: true, progress: 100, owner: member4 },
        { title: 'Global UI Component Kit & Token Architecture', done: true, progress: 100, owner: lead3 },
      ],
    },
    {
      title: 'Creative 2: 4K Cinematic Ad Production & Grading',
      desc: '60-second broadcast TV commercial with color grading, Dolby Atmos sound design, and localized 6-language dubs.',
      posX: 440,
      posY: 180,
      status: statusActive,
      progressPct: 80,
      priority: Priority.HIGH,
      owner: member4,
      collaborators: [manager1.id],
      estimatedCost: 130000,
      actualCost: 82000,
      allocatedHours: 240,
      actualHours: 180,
      approvalStatus: 'pending',
      subtasks: [
        { title: 'Live-Action Filming in Iceland & Tokyo Locations', done: true, progress: 100, owner: member4 },
        { title: 'CGI VFX Integration & DaVinci Color Grading', done: true, progress: 85, owner: member4 },
        { title: 'Dolby Atmos Audio Mastering & Voiceover Dubs', done: false, progress: 50, owner: manager1 },
      ],
    },
    {
      title: 'Creative 3: Global Influencer PR & Media Gifting Kits',
      desc: 'Exclusive custom hardware unboxing kits distributed to 250 tier-1 tech & lifestyle creators under strict embargo.',
      posX: 800,
      posY: 180,
      status: statusActive,
      progressPct: 45,
      priority: Priority.MEDIUM,
      owner: lead3,
      collaborators: [member4.id],
      estimatedCost: 55000,
      actualCost: 28000,
      allocatedHours: 110,
      actualHours: 50,
      approvalStatus: 'not_required',
      subtasks: [
        { title: 'Creator Selection & Embargo Contract Signatures', done: true, progress: 100, owner: lead3 },
        { title: 'Bespoke Acrylic Gifting Box Manufacturing', done: false, progress: 60, owner: member4 },
        { title: 'Courier Dispatch with GPS Tracking & Embargo Protocol', done: false, progress: 0, owner: lead3 },
      ],
    },
    {
      title: 'Creative 4: Times Square 3D Billboard & Global Blast',
      desc: 'Illuminated 3D anamorphic billboard takeover in NYC Times Square, London Piccadilly, and Shibuya Tokyo.',
      posX: 1160,
      posY: 180,
      status: statusNotStarted,
      progressPct: 0,
      priority: Priority.URGENT,
      owner: sandeep,
      collaborators: [member4.id, manager1.id, lead3.id],
      estimatedCost: 70000,
      actualCost: 0,
      allocatedHours: 120,
      actualHours: 0,
      approvalStatus: 'not_required',
      subtasks: [
        { title: 'Times Square Curved LED 3D Anamorphic Render Export', done: false, progress: 0, owner: member4 },
        { title: 'Coordinated PR Wire Worldwide Press Release', done: false, progress: 0, owner: sandeep },
        { title: 'Digital Ad Campaigns on YouTube, Meta & TikTok', done: false, progress: 0, owner: manager1 },
      ],
    },
  ];

  const p3Nodes = [];
  for (let i = 0; i < p3Stages.length; i++) {
    const s = p3Stages[i];
    const nStart = new Date(p3Start.getTime() + i * 22 * 86400000);
    const nDue = new Date(nStart.getTime() + 20 * 86400000);

    const checklist = s.subtasks.map((st, idx) => ({
      id: `mkt-check-${i + 1}-${idx + 1}`,
      text: st.title,
      completed: st.done,
    }));

    const mainNode = await prisma.node.create({
      data: {
        workspaceId,
        projectId: mktProject.id,
        nodeTypeId: milestoneType.id,
        statusId: s.status.id,
        ownerId: s.owner.id,
        reviewerId: sandeep.id,
        title: s.title,
        description: s.desc,
        positionX: s.posX,
        positionY: s.posY,
        width: 300,
        height: 170,
        priority: s.priority,
        isMilestone: true,
        progressPct: s.progressPct,
        startDate: nStart,
        dueDate: nDue,
        estimatedCost: s.estimatedCost,
        actualCost: s.actualCost,
        allocatedHours: s.allocatedHours,
        actualHours: s.actualHours,
        currency: 'EUR',
        checklist,
        collaboratorIds: s.collaborators,
        depth: 1,
        path: `/${i + 1}`,
        approvalStatus: s.approvalStatus,
        approvedAt: s.approvalStatus === 'approved' ? nDue : null,
        approvalFeedback: s.approvalFeedback,
        customData: {
          cost_center: `MKT-GLOBAL-0${i + 1}`,
          risk_level: i === 1 ? 'HIGH' : 'LOW',
        },
      },
    });
    p3Nodes.push(mainNode);

    for (let c = 0; c < s.subtasks.length; c++) {
      const child = s.subtasks[c];
      const childStatus = child.done ? statusDone : child.progress > 0 ? statusActive : statusNotStarted;

      await prisma.node.create({
        data: {
          workspaceId,
          projectId: mktProject.id,
          parentNodeId: mainNode.id,
          nodeTypeId: taskType.id,
          statusId: childStatus.id,
          ownerId: child.owner.id,
          reviewerId: s.owner.id,
          title: child.title,
          description: `Creative asset deliverable under ${s.title}`,
          positionX: s.posX,
          positionY: s.posY + 220 + c * 135,
          width: 280,
          height: 115,
          priority: s.priority,
          isMilestone: false,
          progressPct: child.progress,
          startDate: nStart,
          dueDate: nDue,
          depth: 2,
          path: `/${mainNode.id}/${c + 1}`,
          approvalStatus: child.done ? 'approved' : 'not_required',
        },
      });
    }

    // Remark with billboard mockup
    await prisma.remark.create({
      data: {
        workspaceId,
        nodeId: mainNode.id,
        authorId: member4.id,
        body: `Creative review update for ${s.title}: High-resolution 3D billboard mockups rendered for Times Square curved LED. Passed color gamut tests.`,
        photoUrl: 'https://images.unsplash.com/photo-1542744094-3a31f272c490?w=600',
      },
    });
  }

  // Connect sequence edges
  for (let i = 0; i < p3Nodes.length - 1; i++) {
    await prisma.edge.create({
      data: {
        workspaceId,
        projectId: mktProject.id,
        sourceNodeId: p3Nodes[i].id,
        targetNodeId: p3Nodes[i + 1].id,
        kind: 'sequence',
        label: `Stage ${i + 1} ➔ Stage ${i + 2}`,
      },
    });
  }

  return {
    heroProject,
    saasProject,
    mktProject,
  };
}
