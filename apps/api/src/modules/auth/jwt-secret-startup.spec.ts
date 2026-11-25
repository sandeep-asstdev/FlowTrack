import { describe, it, expect, afterEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { AuthModule, getRequiredJwtSecret } from './auth.module';

describe('JWT_SECRET startup validation', () => {
  const originalSecret = process.env.JWT_SECRET;

  afterEach(() => {
    if (originalSecret === undefined) {
      delete process.env.JWT_SECRET;
    } else {
      process.env.JWT_SECRET = originalSecret;
    }
  });

  it('refuses to start when JWT_SECRET is missing or shorter than 32 characters', async () => {
    delete process.env.JWT_SECRET;
    await expect(
      Test.createTestingModule({ imports: [AuthModule] }).compile(),
    ).rejects.toThrow(/JWT_SECRET/);

    process.env.JWT_SECRET = 'too-short-secret-123';
    expect(() => getRequiredJwtSecret()).toThrow(/JWT_SECRET/);

    process.env.JWT_SECRET = 'a'.repeat(32);
    expect(getRequiredJwtSecret()).toBe('a'.repeat(32));
  });
});
