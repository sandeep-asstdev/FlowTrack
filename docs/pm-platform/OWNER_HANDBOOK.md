# FlowTrack Owner & Administrator Handbook

## 1. Authentication & Security Operations

FlowTrack employs a zero-trust, enterprise-grade authentication model. This handbook guides administrators and workspace owners on configuring authentication providers, Reltigrow WhatsApp Business OTP integration, key rotation, and user role management. Note: SMS has been completely deprecated and removed in favor of WhatsApp Business messaging.

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

## 3. Reltigrow WhatsApp Business API Setup (Phone OTP Verification)

FlowTrack enforces phone verification with single-use cryptographic proofs (+91 Indian numbers) delivered exclusively via the Reltigrow WhatsApp Business API.

> [!IMPORTANT]
> **Real Delivery Notice**: Outbound WhatsApp delivery is tested and verified with mocked endpoints and simulated console delivery. **Real WhatsApp delivery is NOT verified** until you provide your active Reltigrow API credentials, exact endpoint request sample, and Meta-approved template in your environment.

### Environment Variables
Configure the following in your production `.env` (or Render dashboard):

```env
# Reltigrow WhatsApp Business API
RELTIGROW_API_URL=https://whatsapp.reltigrow.com/api/v2
RELTIGROW_API_KEY=your_actual_reltigrow_api_key_here
RELTIGROW_OTP_TEMPLATE=flowtrack_signup_otp
RELTIGROW_OTP_LANGUAGE=en
ALLOW_CONSOLE_OTP_IN_PRODUCTION=false
```

### Development Environment
In local development (`NODE_ENV=development`), FlowTrack defaults to `ConsoleChannel`. Dispatched OTP codes are displayed with masked phone numbers (`+91******3210`) in the server log for instantaneous testing.

### Testing With a Real Mobile Number
1. Ensure the destination number is an active WhatsApp account on a valid Indian mobile network (+91).
2. Set `RELTIGROW_API_KEY` to your valid Reltigrow API key in `.env`.
3. Verify that `flowtrack_signup_otp` is approved in your Reltigrow dashboard (see `docs/pm-platform/WHATSAPP_TEMPLATE_SETUP.md`).
4. Trigger registration in the UI: enter your 10-digit number and click **Send code on WhatsApp**.
5. Check your WhatsApp inbox for the 6-digit code.

### Rotating the Reltigrow API Key
1. Generate a new API token in your [Reltigrow Dashboard](https://whatsapp.reltigrow.com/).
2. Update `RELTIGROW_API_KEY` in your production environment settings (Render environment secrets).
3. Trigger a redeploy. The NestJS backend reads the updated key on boot and validates it immediately.
4. Revoke the old API key in the Reltigrow portal once the deployment is verified.
5. *Note: API keys are strictly masked in application logs and error traces (`...${key.slice(-4)}`); keys never appear in log files or error responses.*

### Action Checklist for Workspace Owner
To finalize live production WhatsApp delivery, please complete the following:
- [ ] Paste your official Reltigrow API request specification (endpoint path, auth header format, body structure).
- [ ] Create and obtain Meta approval for template `flowtrack_signup_otp` in Reltigrow (follow `docs/pm-platform/WHATSAPP_TEMPLATE_SETUP.md`).
- [ ] Add `RELTIGROW_API_KEY` to your live Render environment variables.
- [ ] Send a live test message to your personal WhatsApp number.

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

