const BASE_URL = 'https://flowtrack-api-rss4.onrender.com/api/v1';
const COMMON_PASSWORD = 'Password123!';

const dummyUsers = [
  // 10 Managers
  { email: 'manager1@flowtrack.dev', fullName: 'Rajesh Verma (Manager 1)', phone: '+919811000001', role: 'MANAGER' },
  { email: 'manager2@flowtrack.dev', fullName: 'Priya Nair (Manager 2)', phone: '+919811000002', role: 'MANAGER' },
  { email: 'manager3@flowtrack.dev', fullName: 'Amit Singhal (Manager 3)', phone: '+919811000003', role: 'MANAGER' },
  { email: 'manager4@flowtrack.dev', fullName: 'Sunita Rao (Manager 4)', phone: '+919811000004', role: 'MANAGER' },
  { email: 'manager5@flowtrack.dev', fullName: 'Vikram Malhotra (Manager 5)', phone: '+919811000005', role: 'MANAGER' },
  { email: 'manager6@flowtrack.dev', fullName: 'Ananya Deshmukh (Manager 6)', phone: '+919811000006', role: 'MANAGER' },
  { email: 'manager7@flowtrack.dev', fullName: 'Sanjay Patel (Manager 7)', phone: '+919811000007', role: 'MANAGER' },
  { email: 'manager8@flowtrack.dev', fullName: 'Kavita Menon (Manager 8)', phone: '+919811000008', role: 'MANAGER' },
  { email: 'manager9@flowtrack.dev', fullName: 'Deepak Chopra (Manager 9)', phone: '+919811000009', role: 'MANAGER' },
  { email: 'manager10@flowtrack.dev', fullName: 'Meera Joshi (Manager 10)', phone: '+919811000010', role: 'MANAGER' },

  // 10 Team Leads
  { email: 'lead1@flowtrack.dev', fullName: 'Rohan Mehta (Team Lead 1)', phone: '+919811000011', role: 'TEAM_LEAD' },
  { email: 'lead2@flowtrack.dev', fullName: 'Sneha Kapoor (Team Lead 2)', phone: '+919811000012', role: 'TEAM_LEAD' },
  { email: 'lead3@flowtrack.dev', fullName: 'Arjun Reddy (Team Lead 3)', phone: '+919811000013', role: 'TEAM_LEAD' },
  { email: 'lead4@flowtrack.dev', fullName: 'Pooja Hegde (Team Lead 4)', phone: '+919811000014', role: 'TEAM_LEAD' },
  { email: 'lead5@flowtrack.dev', fullName: 'Karthik Iyer (Team Lead 5)', phone: '+919811000015', role: 'TEAM_LEAD' },
  { email: 'lead6@flowtrack.dev', fullName: 'Neha Sharma (Team Lead 6)', phone: '+919811000016', role: 'TEAM_LEAD' },
  { email: 'lead7@flowtrack.dev', fullName: 'Varun Dhawan (Team Lead 7)', phone: '+919811000017', role: 'TEAM_LEAD' },
  { email: 'lead8@flowtrack.dev', fullName: 'Divya Pillai (Team Lead 8)', phone: '+919811000018', role: 'TEAM_LEAD' },
  { email: 'lead9@flowtrack.dev', fullName: 'Manish Gupta (Team Lead 9)', phone: '+919811000019', role: 'TEAM_LEAD' },
  { email: 'lead10@flowtrack.dev', fullName: 'Ritu Saxena (Team Lead 10)', phone: '+919811000020', role: 'TEAM_LEAD' },

  // 10 Members
  { email: 'member1@flowtrack.dev', fullName: 'Rahul Yadav (Member 1)', phone: '+919811000021', role: 'MEMBER' },
  { email: 'member2@flowtrack.dev', fullName: 'Tanvi Shah (Member 2)', phone: '+919811000022', role: 'MEMBER' },
  { email: 'member3@flowtrack.dev', fullName: 'Nikhil Pandey (Member 3)', phone: '+919811000023', role: 'MEMBER' },
  { email: 'member4@flowtrack.dev', fullName: 'Swati Kulkarni (Member 4)', phone: '+919811000024', role: 'MEMBER' },
  { email: 'member5@flowtrack.dev', fullName: 'Akash Roy (Member 5)', phone: '+919811000025', role: 'MEMBER' },
  { email: 'member6@flowtrack.dev', fullName: 'Isha Sen (Member 6)', phone: '+919811000026', role: 'MEMBER' },
  { email: 'member7@flowtrack.dev', fullName: 'Gaurav Jain (Member 7)', phone: '+919811000027', role: 'MEMBER' },
  { email: 'member8@flowtrack.dev', fullName: 'Shreya Bose (Member 8)', phone: '+919811000028', role: 'MEMBER' },
  { email: 'member9@flowtrack.dev', fullName: 'Aditya Nambiar (Member 9)', phone: '+919811000029', role: 'MEMBER' },
  { email: 'member10@flowtrack.dev', fullName: 'Pallavi Joshi (Member 10)', phone: '+919811000030', role: 'MEMBER' },
];

async function main() {
  console.log('Logging in as Admin on Render...');
  const loginRes = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@flowtrack.dev', password: 'Password123!' }),
  }).then(r => r.json());

  if (!loginRes.accessToken) {
    throw new Error('Admin login failed: ' + JSON.stringify(loginRes));
  }

  const token = loginRes.accessToken;
  const workspaceId = loginRes.activeWorkspaceId || 'a8b7072d-bd7f-41c6-ab42-7ecbe2a221d3';
  const projectId = '7fe40b0c-11e0-4f24-a132-45cbea0eaddb';
  console.log(`Using Admin token. Workspace: ${workspaceId}, Project: ${projectId}`);

  for (let i = 0; i < dummyUsers.length; i++) {
    const u = dummyUsers[i];
    console.log(`[${i + 1}/${dummyUsers.length}] Provisioning ${u.email} (${u.role})...`);

    let userId = null;

    // 1. Register User
    try {
      const regRes = await fetch(`${BASE_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: u.email,
          fullName: u.fullName,
          password: COMMON_PASSWORD,
          phone: u.phone,
          requestedRole: u.role,
        }),
      }).then(r => r.json());

      if (regRes.user?.id) {
        userId = regRes.user.id;
      }
    } catch (e) {
      // Ignored
    }

    // 2. Add / Invite into Workspace
    try {
      const invRes = await fetch(`${BASE_URL}/workspaces/${workspaceId}/members/invite`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'x-workspace-id': workspaceId,
        },
        body: JSON.stringify({
          email: u.email,
          role: u.role,
        }),
      }).then(r => r.json());

      if (invRes.userId || invRes.user?.id) {
        userId = invRes.userId || invRes.user?.id;
      }
    } catch (e) {
      // Ignored
    }

    // 3. Add to Project
    if (userId) {
      try {
        await fetch(`${BASE_URL}/projects/${projectId}/members`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
            'x-workspace-id': workspaceId,
          },
          body: JSON.stringify({
            userId,
            role: u.role,
          }),
        }).then(r => r.json());
      } catch (e) {
        // Ignored
      }
    }

    console.log(`  ✓ Synced ${u.email} -> Workspace & Project`);
  }

  // Verify
  const members = await fetch(`${BASE_URL}/workspaces/${workspaceId}/members`, {
    headers: { 'Authorization': `Bearer ${token}` },
  }).then(r => r.json());

  console.log(`\n🎉 PROVISIONING COMPLETE! Workspace now has ${members.length} members!`);
}

main().catch(console.error);
