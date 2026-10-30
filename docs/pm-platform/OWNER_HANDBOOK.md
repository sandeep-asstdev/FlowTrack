# FlowTrack Owner & Administrator Handbook

## 1. Authentication & Security Operations

FlowTrack employs a zero-trust, enterprise-grade authentication model. This handbook guides administrators and workspace owners on configuring authentication providers, regulatory SMS compliance, and user role management.

---

## 2. Google OAuth 2.0 Configuration

To enable "Continue with Google" for workspace users:

1. **Google Cloud Console Setup**:
   - Navigate to [Google Cloud Console](https://console.cloud.google.com/).
   - Create or select an existing project.
   - Go to **APIs & Services > OAuth consent screen**.
   - Configure the consent screen with your Application Name (`FlowTrack`) and support email.
   - Authorized Domains: Add your production frontend domain (e.g., `workers.dev` or your custom domain).
2. **Create Web Application Credentials**:
   - Go to **Credentials > Create Credentials > OAuth client ID**.
   - Select **Web application**.
   - Set **Authorized JavaScript origins**:
     - `http://localhost:5173` (for local development)
     - `https://flowtrack.asstitdev3.workers.dev` (production frontend)
3. **Environment Variables**:
   - Copy the Client ID and configure it in your environment:
     ```env
     GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
     VITE_GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
     ```
   - Both backend and frontend use this Client ID to verify ID token claims (`iss`, `aud`, `email_verified`).

---

## 3. SMS & OTP Provider Setup (TRAI / DLT Regulations)

FlowTrack enforces phone verification with single-use cryptographic proofs (+91 Indian numbers).

### Development Environment
In development (`NODE_ENV=development`), FlowTrack automatically uses the `ConsoleProvider`. Dispatched OTP codes are printed to the terminal console and NestJS server logs for immediate testing.

### Production Environment (MSG91 / Indian DLT Compliance)
Under Telecom Regulatory Authority of India (TRAI) regulations, commercial transactional SMS requires DLT (Distributed Ledger Technology) registration.

1. **DLT Registration**:
   - Register your enterprise on a TRAI-approved DLT portal (e.g., Vilpower / Jio DLT / Airtel DLT).
   - Register your Principal Entity (PE) ID and Sender ID (Header, e.g. `FLWTRK`).
   - Register the OTP Content Template:
     ```text
     {#var#} is your FlowTrack verification code. Valid for 10 minutes. Do not share this OTP with anyone.
     ```
2. **MSG91 Integration**:
   - Obtain your Auth Key from [MSG91](https://msg91.com/).
   - Create a Flow with your approved DLT Template ID and Sender ID.
   - Configure environment variables:
     ```env
     SMS_PROVIDER=msg91
     MSG91_AUTH_KEY=your_msg91_auth_key
     MSG91_FLOW_ID=your_dlt_template_flow_id
     MSG91_SENDER_ID=FLWTRK
     ```
3. **Emergency Production Override**:
   - If deploying to a staging or sandbox environment where live SMS is not configured, you may explicitly set:
     ```env
     ALLOW_CONSOLE_SMS_IN_PRODUCTION=true
     ```
   - *Warning: Never leave this enabled on public production instances.*

---

## 4. User Role Management & Privileges

FlowTrack strictly isolates public self-registration from privileged role assignments.

### Public Registration Role Lock
- All users signing up via Email/Password or Google OAuth are assigned the `MEMBER` role.
- Request payloads containing `role` or `requestedRole` are discarded by the server.

### Role Hierarchy & Capabilities
- **Platform Admin (`ADMIN`)**:
  - Full system governance, audit export, project permanent purge, user role modifications.
  - Cannot be demoted if they are the last active platform administrator.
- **Manager (`MANAGER`)**:
  - Create and configure projects, design approval workflows, approve work submissions, manage department tasks.
- **Member (`MEMBER`)**:
  - Execute assigned tasks, submit work and evidence, complete checklists, request approvals.
  - Read-only access to project configuration and canvas settings.

### Administrative Role Assignment
Workspace administrators can elevate a user's role via the authenticated API:

```http
PATCH /api/v1/users/:userId/role
Authorization: Bearer <ADMIN_JWT_TOKEN>
Content-Type: application/json

{
  "role": "MANAGER"
}
```

*All role elevations are immutably recorded in the system audit log with actor ID and timestamp.*

---

## 5. Default Development & Demo Accounts

For local evaluation and automated verification, FlowTrack auto-provisions the following pre-configured accounts on boot:

| Name | Email | Password | Role | Organization |
| :--- | :--- | :--- | :--- | :--- |
| **System Admin** | `admin@flowtrack.dev` | `Password123!` | System Admin | System Root |
| **Alex Mercer** | `alex@acme.dev` | `Demo@12345` | System Admin | Acme Motors |
| **Cara Vance** | `cara@acme.dev` | `Demo@12345` | CEO / Director | Acme Motors |
| **Dan Brooks** | `dan@acme.dev` | `Demo@12345` | Director | Acme Motors |
| **Mia Chang** | `mia@acme.dev` | `Demo@12345` | Manager | Acme Motors |
| **Omar Silva** | `omar@acme.dev` | `Demo@12345` | Manager | Acme Motors |
| **Tom Nelson** | `tom@acme.dev` | `Demo@12345` | Team Leader | Acme Motors |
| **Maya Patel** | `maya@acme.dev` | `Demo@12345` | Member | Acme Motors |
| **Sam Rivera** | `sam@acme.dev` | `Demo@12345` | Member | Acme Motors |
| **Nina Bell** | `nina@acme.dev` | `Demo@12345` | Member | Acme Motors |
| **Zoe Ross** | `zoe@rival.dev` | `Demo@12345` | Manager | Rival Corp |
