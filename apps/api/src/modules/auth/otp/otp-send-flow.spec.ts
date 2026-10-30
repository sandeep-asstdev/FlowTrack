import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OtpService } from './otp.service';
import { ConsoleChannel } from '../channels/console.channel';
import { HttpException, HttpStatus } from '@nestjs/common';

describe('Bug C Reproduction & Verification — Real Server Response & Channel Detection', () => {
  let otpService: OtpService;
  let prismaMock: any;

  beforeEach(() => {
    prismaMock = {
      otpChallenge: {
        findFirst: vi.fn().mockResolvedValue(null),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        create: vi.fn().mockResolvedValue({ id: 'challenge-1' }),
      },
    };
    otpService = new OtpService(prismaMock);
  });

  it('fails and throws when primary channel fails, so UI never shows false success', async () => {
    // Mock channel to fail (e.g. WhatsApp down)
    const failingChannel = {
      name: 'failing',
      send: vi.fn().mockResolvedValue({
        success: false,
        error: "WhatsApp delivery is temporarily unavailable. Please try email verification.",
        errorCode: 'PROVIDER_OUTAGE',
        canFallbackToEmail: true,
      }),
    };
    otpService.setChannel(failingChannel as any);

    await expect(
      otpService.requestOtp('+919876543210')
    ).rejects.toThrow();
  });

  it('identifies ConsoleChannel as development simulation and returns dev simulation metadata', async () => {
    const consoleChannel = new ConsoleChannel();
    otpService.setChannel(consoleChannel);

    const res = await otpService.requestOtp('+919876543210');
    expect(res.success).toBe(true);
    expect(res.isDevSimulation).toBe(true);
    expect(res.channel).toBe('console');
  });

  it('exposes dev OTP code ONLY when DEV_EXPOSE_OTP=true and NODE_ENV !== "production"', async () => {
    const origDevExpose = process.env.DEV_EXPOSE_OTP;
    const origNodeEnv = process.env.NODE_ENV;

    try {
      process.env.DEV_EXPOSE_OTP = 'true';
      process.env.NODE_ENV = 'development';

      const res = await otpService.requestOtp('+919876543210');
      expect(res.devOtpCode).toBeDefined();
      expect(res.devOtpCode).toMatch(/^\d{6}$/);

      // In production, server strictly refuses to expose devOtpCode even if flag is set
      process.env.NODE_ENV = 'production';
      process.env.ALLOW_CONSOLE_OTP_IN_PRODUCTION = 'true';
      const prodRes = await otpService.requestOtp('+919876543210');
      expect(prodRes.devOtpCode).toBeUndefined();
    } finally {
      process.env.DEV_EXPOSE_OTP = origDevExpose;
      process.env.NODE_ENV = origNodeEnv;
      delete process.env.ALLOW_CONSOLE_OTP_IN_PRODUCTION;
    }
  });
});

