# FlowTrack Production Operations & Deployment Guide

This document details the repeatable deployment process, environment specifications, security configurations, and monitoring for the FlowTrack platform.

---

## Deployment Architecture

```
[ Client Browser ]
        │
        ├── HTTPS (Port 443) ──> [ Reverse Proxy / Nginx / Cloudflare ]
        │                                  │
        │                                  ├── /api/v1/* ──> [ NestJS API Service (Port 3001) ]
        │                                  │                        │
        │                                  │                        ├── PostgreSQL 15+ (Data Persistence)
        │                                  │                        ├── Redis 7+ (BullMQ Jobs & Cache)
        │                                  │                        └── Vault Storage (Encrypted / Protected Files)
        │                                  │
        │                                  └── /* ──────────> [ Static Web Frontend (Vite Build) ]
        │
        └── WSS (WebSockets) ──> [ Socket.io Collaboration Gateway (Port 3001) ]
```

---

## Required Environment Variables

### Backend Service (`apps/api/.env`)

| Variable | Description | Production Example |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://user:pass@db.internal:5432/flowtrack?sslmode=require` |
| `PORT` | API listening port | `3001` |
| `NODE_ENV` | Environment mode | `production` |
| `JWT_SECRET` | Strong crypto key for user tokens | `crypto.randomBytes(32).toString('hex')` (min 64 chars) |
| `CORS_ORIGIN` | Allowed web origins (comma-separated) | `https://app.flowtrack.io,https://admin.flowtrack.io` |
| `REDIS_HOST` | Redis cache & queue host | `redis.internal` |
| `REDIS_PORT` | Redis port | `6379` |
| `REDIS_PASSWORD` | Redis authentication password | `your-secure-redis-password` |
| `VAULT_STORAGE_PATH` | Secure directory for uploaded files | `/var/flowtrack/vault_storage` |

### Frontend Web (`apps/web/.env`)

| Variable | Description | Production Example |
|---|---|---|
| `VITE_API_URL` | Base REST API URL | `https://app.flowtrack.io/api/v1` |
| `VITE_SOCKET_URL` | Socket.io server URL | `https://app.flowtrack.io` |

---

## Repeatable Database Migration Workflow

In production, migrations should execute automatically during deployment pipelines prior to traffic redirection:

```bash
# 1. Generate Prisma Client bindings
pnpm --filter @flowtrack/api prisma:generate

# 2. Apply pending schema migrations safely
pnpm --filter @flowtrack/api prisma:deploy

# (For non-migration schema syncs in containerized environments)
# pnpm --filter @flowtrack/api prisma:push
```

---

## Health Checks & Liveness Probes

The API exposes a comprehensive health probe for Kubernetes liveness/readiness probes or external monitors:

- **Endpoint**: `GET /api/v1/health` (also accessible at `GET /health`)
- **Status Codes**:
  - `200 OK`: Database connected, memory within bounds.
  - `503 Service Unavailable`: Database unreachable or fatal condition.
- **Response Payload**:
  ```json
  {
    "status": "healthy",
    "timestamp": "2026-10-24T13:00:00.000Z",
    "uptimeSeconds": 1420,
    "version": "1.0.0",
    "database": {
      "status": "connected",
      "latencyMs": 4
    },
    "memory": {
      "rssMb": 85,
      "heapUsedMb": 42,
      "heapTotalMb": 68
    },
    "environment": "production"
  }
  ```

---

## Security Hardening Checklist

1. **Role Escalation Protection**:
   - Only users with `ADMIN` role in a workspace can assign or elevate users to `ADMIN`.
   - Members and Viewers cannot invite or change role memberships.
2. **Self-Approval Prevention**:
   - `approvalStatus: approved` cannot be set by unprivileged members via generic task updates. Approvals require explicit sign-off from designated reviewers or Managers.
3. **File Vault Security**:
   - Executable scripts and binaries (`.exe`, `.bat`, `.cmd`, `.sh`, `.vbs`, `.msi`, `.jar`, `.ps1`) are strictly rejected.
   - Max document size limit is enforced at 25MB.
   - Vault files are stored outside the public web root and retrieved only through authenticated workspace authorization checks.
4. **Data Isolation**:
   - All database queries filter strictly on `workspaceId`. Cross-workspace data leakage is prevented at both controller and service levels.
5. **Secrets Management**:
   - Never commit `.env` files. Secrets must be injected via secret managers (AWS Secrets Manager, HashiCorp Vault, Kubernetes Secrets).

---

## Remaining Limitations & Future Considerations

1. **Object Storage Providers**: The current vault storage implementation utilizes local/mounted filesystem storage. For distributed multi-region deployments, an S3/GCS presigned-URL adapter can be plugged into `DocumentsService`.
2. **SSO / SAML 2.0 / OAuth**: The current authentication supports email/password and phone OTP. Enterprise SAML/Okta integration can be added to `AuthModule`.
3. **Complex Custom Script Calculations**: FlowTrack deliberately avoids arbitrary executable JavaScript in custom field formulas to prevent code injection vulnerabilities.
