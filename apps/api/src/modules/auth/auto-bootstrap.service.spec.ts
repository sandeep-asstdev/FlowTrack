import { describe, it, expect, vi, afterEach } from 'vitest';
import { AutoBootstrapService } from './auto-bootstrap.service';

describe('AutoBootstrapService environment guards', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  function createMockPrisma() {
    return {
      user: { findUnique: vi.fn(), upsert: vi.fn() },
      workspace: { upsert: vi.fn() },
      membership: { upsert: vi.fn() },
    };
  }

  it('does nothing when NODE_ENV=production even if AUTO_BOOTSTRAP_ENABLED=true or disabled flag is missing', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.AUTO_BOOTSTRAP_DISABLED;
    process.env.AUTO_BOOTSTRAP_ENABLED = 'true';

    const mockPrisma = createMockPrisma();
    const service = new AutoBootstrapService(mockPrisma as any);
    await service.onModuleInit();

    expect(mockPrisma.workspace.upsert).not.toHaveBeenCalled();
    expect(mockPrisma.user.upsert).not.toHaveBeenCalled();
  });

  it('is off by default in development when AUTO_BOOTSTRAP_ENABLED is not set to true', async () => {
    process.env.NODE_ENV = 'development';
    delete process.env.AUTO_BOOTSTRAP_ENABLED;
    delete process.env.AUTO_BOOTSTRAP_DISABLED;

    const mockPrisma = createMockPrisma();
    const service = new AutoBootstrapService(mockPrisma as any);
    await service.onModuleInit();

    expect(mockPrisma.workspace.upsert).not.toHaveBeenCalled();
    expect(mockPrisma.user.upsert).not.toHaveBeenCalled();
  });

  it('never creates users with a hardcoded password when password env vars are missing', async () => {
    process.env.NODE_ENV = 'development';
    process.env.AUTO_BOOTSTRAP_ENABLED = 'true';
    delete process.env.AUTO_BOOTSTRAP_ADMIN_PASSWORD;
    delete process.env.DEFAULT_ADMIN_PASSWORD;
    delete process.env.AUTO_BOOTSTRAP_DEMO_PASSWORD;
    delete process.env.DEMO_USER_PASSWORD;

    const mockPrisma = createMockPrisma();
    const service = new AutoBootstrapService(mockPrisma as any);
    await service.onModuleInit();

    expect(mockPrisma.user.upsert).not.toHaveBeenCalled();
  });
});
