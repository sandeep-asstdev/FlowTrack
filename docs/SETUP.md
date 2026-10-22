# FlowTrack Setup & Architecture Guide

## Quick Start Guide

### Prerequisites
- Node.js >= 20
- pnpm >= 9
- PostgreSQL >= 15 (running on port 5432)
- Redis >= 7 (optional for real-time clustering, fallback in-memory)

### Local Development Commands

1. **Install Dependencies**:
   ```bash
   pnpm install
   ```

2. **Build Shared Library**:
   ```bash
   pnpm --filter @flowtrack/shared build
   ```

3. **Setup Database & Migrations**:
   ```bash
   cd apps/api
   npx prisma db push
   npx prisma generate
   npx ts-node prisma/seed.ts
   ```

4. **Start NestJS API** (Port 3001):
   ```bash
   pnpm --filter @flowtrack/api start:dev
   ```
   - REST API: `http://localhost:3001/api/v1`
   - Swagger OpenAPI Docs: `http://localhost:3001/api/docs`

5. **Start React Web App** (Port 5173):
   ```bash
   pnpm --filter @flowtrack/web dev
   ```
   - Application: `http://localhost:5173/`

### Default Credentials
- **Admin Email**: `admin@flowtrack.dev`
- **Password**: `Password123!`
- **Development Mock Phone OTP**: `123456`
