const { PrismaClient, Role, Priority, ConfidentialityLevel } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function seedHeroProject() {
  console.log('🚀 Seeding "Hero Bike Showroom Building" demo project...');

  // 1. Resolve or Create Primary Workspace
  let workspace = await prisma.workspace.findFirst({
    where: { name: 'Acme Developments', deletedAt: null },
  });
  if (!workspace) {
    workspace = await prisma.workspace.findFirst({ where: { deletedAt: null } });
  }
  if (!workspace) {
    workspace = await prisma.workspace.create({
      data: {
        name: 'Acme Developments',
        slug: 'acme-developments',
      },
    });
  }
  console.log(`🏢 Using Workspace: "${workspace.name}" (${workspace.id})`);

  // 2. Ensure sandeep@gmail.com exists with password sandeep@1234
  const sandeepPasswordHash = await bcrypt.hash('sandeep@1234', 10);
  const sandeepUser = await prisma.user.upsert({
    where: { email: 'sandeep@gmail.com' },
    update: {
      fullName: 'Sandeep Raichur',
      phone: '+919606019427',
      passwordHash: sandeepPasswordHash,
      isActive: true,
      phoneVerified: true,
    },
    create: {
      email: 'sandeep@gmail.com',
      fullName: 'Sandeep Raichur',
      phone: '+919606019427',
      passwordHash: sandeepPasswordHash,
      isActive: true,
      phoneVerified: true,
    },
  });

  // Ensure sandeep is a Manager in this workspace
  await prisma.membership.upsert({
    where: { workspaceId_userId: { workspaceId: workspace.id, userId: sandeepUser.id } },
    update: { role: Role.MANAGER },
    create: { workspaceId: workspace.id, userId: sandeepUser.id, role: Role.MANAGER },
  });
  console.log(`👤 Ensured Sandeep Raichur (sandeep@gmail.com) is MANAGER in ${workspace.name}`);

  // 3. Find existing users to assign
  const adminUser = (await prisma.user.findFirst({ where: { email: 'admin@flowtrack.dev' } })) || sandeepUser;
  const managerUser = (await prisma.user.findFirst({ where: { email: 'manager1@flowtrack.dev' } })) || sandeepUser;
  const leadUser = (await prisma.user.findFirst({ where: { email: 'lead3@flowtrack.dev' } })) || sandeepUser;
  const member1 = (await prisma.user.findFirst({ where: { email: 'member1@flowtrack.dev' } })) || sandeepUser;
  const member4 = (await prisma.user.findFirst({ where: { email: 'member4@flowtrack.dev' } })) || sandeepUser;

  // 4. Resolve Node Types & Statuses
  const taskType = await prisma.nodeType.findFirst({
    where: { workspaceId: workspace.id, key: 'task' },
  });
  const milestoneType = (await prisma.nodeType.findFirst({
    where: { workspaceId: workspace.id, key: 'milestone' },
  })) || taskType;

  const defaultStatusSet = await prisma.statusSet.findFirst({
    where: { workspaceId: workspace.id, isDefault: true },
    include: { statuses: true },
  });

  const statuses = defaultStatusSet?.statuses || [];
  const statusDone = statuses.find((s) => s.category === 'done') || statuses[0];
  const statusActive = statuses.find((s) => s.category === 'active') || statuses[0];
  const statusNotStarted = statuses.find((s) => s.category === 'not_started') || statuses[0];

  // 5. Delete existing Hero demo project if it exists (for clean idempotency)
  const existingProject = await prisma.project.findFirst({
    where: { workspaceId: workspace.id, key: 'HERO-01' },
  });
  if (existingProject) {
    console.log('♻ Cleaning up previous HERO-01 project for clean demonstration...');
    await prisma.edge.deleteMany({ where: { projectId: existingProject.id } });
    await prisma.node.deleteMany({ where: { projectId: existingProject.id } });
    await prisma.projectMember.deleteMany({ where: { projectId: existingProject.id } });
    await prisma.project.delete({ where: { id: existingProject.id } });
  }

  // 6. Create Hero Bike Showroom Project
  const now = new Date();
  const startDate = new Date(now.getFullYear(), now.getMonth() - 2, 1);
  const targetDate = new Date(now.getFullYear(), now.getMonth() + 2, 15);

  const heroProject = await prisma.project.create({
    data: {
      workspaceId: workspace.id,
      name: 'Hero MotoCorp 3S Showroom Construction & Launch',
      key: 'HERO-01',
      description: 'Turnkey development of an authorized Hero MotoCorp Dealership & Service Workshop on National Highway (NH-44). Includes commercial land purchase, steel pre-fab structure, showroom glass facade, 6-bay hydraulic workshop, and launch event.',
      objectives: 'Establish a premier 3S (Sales, Service, Spares) motorcycle showroom to deliver 150+ units monthly with full Hero brand compliance.',
      scope: 'Plot registration, municipal sanctions, civil structure, Hero CI branding, and inaugural customer deliveries.',
      ownerId: adminUser.id,
      responsibleManagerId: sandeepUser.id,
      status: 'ACTIVE',
      classification: ConfidentialityLevel.INTERNAL,
      startDate,
      targetDate,
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
          { userId: adminUser.id, role: 'ADMIN' },
          { userId: sandeepUser.id, role: 'MANAGER' },
          { userId: managerUser.id, role: 'MANAGER' },
          { userId: leadUser.id, role: 'TEAM_LEAD' },
          { userId: member1.id, role: 'MEMBER' },
          { userId: member4.id, role: 'MEMBER' },
        ],
      },
    },
  });
  console.log(`🏍 Created Project: "${heroProject.name}" (ID: ${heroProject.id})`);

  // 7. Seed exactly 5 Main Milestone Nodes with max 3 child nodes each
  const milestonesData = [
    {
      title: 'Phase 1: Land Acquisition & Legal Registry',
      desc: 'Commercial plot selection on NH-44 highway, revenue title clearance, registration with sub-registrar, and Hero dealership NOC.',
      posX: 80,
      posY: 180,
      status: statusDone,
      progressPct: 100,
      priority: Priority.HIGH,
      owner: managerUser,
      estimatedCost: 4500000,
      actualCost: 4450000,
      allocatedHours: 120,
      actualHours: 115,
      subtasks: [
        { title: 'NH-44 Highway Plot Identification & Survey', done: true, progress: 100, owner: sandeepUser },
        { title: 'Title Deed Verification & Sub-Registrar Stamping', done: true, progress: 100, owner: managerUser },
        { title: 'Hero MotoCorp Corporate Location NOC Grant', done: true, progress: 100, owner: sandeepUser },
      ],
    },
    {
      title: 'Phase 2: Architectural Blueprints & Approvals',
      desc: 'Standardized Hero 3S showroom architectural drawings, structural engineering, municipal sanction, and Fire/PHE clearances.',
      posX: 440,
      posY: 180,
      status: statusDone,
      progressPct: 100,
      priority: Priority.MEDIUM,
      owner: leadUser,
      estimatedCost: 1200000,
      actualCost: 1180000,
      allocatedHours: 90,
      actualHours: 85,
      subtasks: [
        { title: 'Hero 3S Showroom & Service Bay Floorplan CAD', done: true, progress: 100, owner: leadUser },
        { title: 'Municipal Commercial Building Sanction & Fire NOC', done: true, progress: 100, owner: leadUser },
        { title: '3-Phase Industrial Electric Connection Sanction', done: true, progress: 100, owner: member1 },
      ],
    },
    {
      title: 'Phase 3: Civil Construction & Workshop Bays',
      desc: 'RCC foundation, structural steel framing, composite roof sheeting, toughened glass display facade, and 6 service bays with lift pits.',
      posX: 800,
      posY: 180,
      status: statusActive,
      progressPct: 65,
      priority: Priority.URGENT,
      owner: member1,
      estimatedCost: 7500000,
      actualCost: 5020000,
      allocatedHours: 320,
      actualHours: 210,
      subtasks: [
        { title: 'Foundation Piling & Steel Pre-Engineered Structure', done: true, progress: 100, owner: member1 },
        { title: 'Toughened Glass Display Facade & Brick Masonry', done: false, progress: 70, owner: member1 },
        { title: '6-Bay Hydraulic Lift Installation & Trenching', done: false, progress: 25, owner: member4 },
      ],
    },
    {
      title: 'Phase 4: Interior Fit-out & Brand Identity Branding',
      desc: 'Hero corporate identity red/black wall panelling, outdoor 3D LED pylon, AC customer lounge, spare parts racks, and dealer DMS IT system.',
      posX: 1160,
      posY: 180,
      status: statusActive,
      progressPct: 20,
      priority: Priority.HIGH,
      owner: member4,
      estimatedCost: 3000000,
      actualCost: 1150000,
      allocatedHours: 160,
      actualHours: 35,
      subtasks: [
        { title: 'Exterior 3D Hero Corporate Pylon & Illuminated Facia', done: false, progress: 40, owner: member4 },
        { title: 'Customer Lounge, Executive Desks & Billing Counters', done: false, progress: 15, owner: member4 },
        { title: 'Hero Dealer Management System (DMS) & Server Setup', done: false, progress: 0, owner: sandeepUser },
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
      owner: sandeepUser,
      estimatedCost: 2300000,
      actualCost: 0,
      allocatedHours: 100,
      actualHours: 0,
      subtasks: [
        { title: 'Initial 50 Bikes Stocking (Splendor, HF Deluxe, Vida EV)', done: false, progress: 0, owner: sandeepUser },
        { title: 'Hero Certified Sales & Technical Staff Onboarding', done: false, progress: 0, owner: managerUser },
        { title: 'Grand Ribbon-Cutting Ceremony & 15 Bike Deliveries', done: false, progress: 0, owner: sandeepUser },
      ],
    },
  ];

  const createdMainNodes = [];

  for (let i = 0; i < milestonesData.length; i++) {
    const data = milestonesData[i];
    const nodeDate = new Date(startDate.getTime() + i * 20 * 24 * 60 * 60 * 1000);
    const dueDate = new Date(nodeDate.getTime() + 18 * 24 * 60 * 60 * 1000);

    // Format checklist for UI task details
    const checklist = data.subtasks.map((st, idx) => ({
      id: `check-${i + 1}-${idx + 1}`,
      text: st.title,
      completed: st.done,
    }));

    // 7.1 Create Main Node
    const mainNode = await prisma.node.create({
      data: {
        workspaceId: workspace.id,
        projectId: heroProject.id,
        nodeTypeId: milestoneType.id,
        statusId: data.status.id,
        ownerId: data.owner.id,
        reviewerId: sandeepUser.id,
        title: data.title,
        description: data.desc,
        positionX: data.posX,
        positionY: data.posY,
        width: 300,
        height: 170,
        priority: data.priority,
        isMilestone: true,
        progressPct: data.progressPct,
        startDate: nodeDate,
        dueDate: dueDate,
        estimatedCost: data.estimatedCost,
        actualCost: data.actualCost,
        allocatedHours: data.allocatedHours,
        actualHours: data.actualHours,
        currency: 'INR',
        checklist,
        depth: 1,
        path: `/${i + 1}`,
        approvalStatus: data.progressPct === 100 ? 'approved' : 'not_required',
      },
    });
    createdMainNodes.push(mainNode);
    console.log(`   📌 Node ${i + 1}: ${mainNode.title} (${data.progressPct}% - ${data.status.key})`);

    // 7.2 Create up to 3 Child Nodes for each Main Node
    for (let c = 0; c < data.subtasks.length; c++) {
      const child = data.subtasks[c];
      const childStatus = child.done ? statusDone : child.progress > 0 ? statusActive : statusNotStarted;

      await prisma.node.create({
        data: {
          workspaceId: workspace.id,
          projectId: heroProject.id,
          parentNodeId: mainNode.id,
          nodeTypeId: taskType.id,
          statusId: childStatus.id,
          ownerId: child.owner.id,
          reviewerId: sandeepUser.id,
          title: child.title,
          description: `Deliverable ${i + 1}.${c + 1} under ${mainNode.title}`,
          positionX: data.posX,
          positionY: data.posY + 220 + c * 140,
          width: 280,
          height: 120,
          priority: data.priority,
          isMilestone: false,
          progressPct: child.progress,
          startDate: nodeDate,
          dueDate: dueDate,
          depth: 2,
          path: `/${mainNode.id}/${c + 1}`,
          approvalStatus: child.done ? 'approved' : 'not_required',
        },
      });
    }
  }

  // 8. Create Sequential Edges connecting Node 1 -> Node 2 -> Node 3 -> Node 4 -> Node 5
  console.log('🔗 Connecting Sequential Dependency Edges (CPM)...');
  for (let i = 0; i < createdMainNodes.length - 1; i++) {
    const source = createdMainNodes[i];
    const target = createdMainNodes[i + 1];

    await prisma.edge.create({
      data: {
        workspaceId: workspace.id,
        projectId: heroProject.id,
        sourceNodeId: source.id,
        targetNodeId: target.id,
        kind: 'sequence',
        label: `Stage ${i + 1} ➔ Stage ${i + 2}`,
      },
    });
  }
  console.log(`   ✔ 4 Sequential Edges linked.`);

  console.log('\n======================================================');
  console.log('✨ Demo Project Created Successfully!');
  console.log(`Project: "${heroProject.name}" (Key: HERO-01)`);
  console.log(`Workspace: "${workspace.name}"`);
  console.log(`Nodes: 5 Main Milestone Nodes (with max 3 Child Subtasks each)`);
  console.log(`Demo Credentials:`);
  console.log(`  - Sandeep Raichur: sandeep@gmail.com / sandeep@1234 (MANAGER)`);
  console.log(`  - Platform Admin: admin@flowtrack.dev / Admin@12345 (ADMIN)`);
  console.log('======================================================\n');
}

seedHeroProject()
  .catch((err) => {
    console.error('❌ Failed to seed demo project:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

