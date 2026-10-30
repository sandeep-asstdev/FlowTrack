import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { ConsoleChannel } from './console.channel';

describe('Zero SMS Remnants & Production Protection Suite', () => {
  it('confirms the auth/sms directory has been completely deleted', () => {
    const smsDirPath = path.resolve(__dirname, '../sms');
    expect(fs.existsSync(smsDirPath)).toBe(false);
  });

  it('confirms no file in auth/channels or auth/otp contains SMS providers or classes', () => {
    const channelsDir = path.resolve(__dirname, '../channels');
    const otpDir = path.resolve(__dirname, '../otp');

    const channelFiles = fs.readdirSync(channelsDir).filter((f) => !f.endsWith('.spec.ts'));
    const otpFiles = fs.readdirSync(otpDir).filter((f) => !f.endsWith('.spec.ts'));

    expect(channelFiles).not.toContain('sms.channel.ts');
    expect(channelFiles).not.toContain('sms-provider.interface.ts');
    expect(channelFiles).not.toContain('msg91.provider.ts');

    for (const file of channelFiles) {
      const content = fs.readFileSync(path.join(channelsDir, file), 'utf-8');
      expect(content).not.toContain('class SmsProvider');
      expect(content).not.toContain('class SmsChannel');
      expect(content).not.toContain('Msg91Provider');
    }

    for (const file of otpFiles) {
      const content = fs.readFileSync(path.join(otpDir, file), 'utf-8');
      expect(content).not.toContain('class SmsProvider');
      expect(content).not.toContain('class SmsChannel');
      expect(content).not.toContain('Msg91Provider');
      expect(content).not.toContain('setSmsProvider');
    }
  });

  it('refuses to instantiate ConsoleChannel in production environment without explicit override', () => {
    const origEnv = process.env.NODE_ENV;
    const origOverride = process.env.ALLOW_CONSOLE_OTP_IN_PRODUCTION;
    const origSmsOverride = process.env.ALLOW_CONSOLE_SMS_IN_PRODUCTION;

    try {
      process.env.NODE_ENV = 'production';
      delete process.env.ALLOW_CONSOLE_OTP_IN_PRODUCTION;
      delete process.env.ALLOW_CONSOLE_WHATSAPP_IN_PRODUCTION;
      delete process.env.ALLOW_CONSOLE_SMS_IN_PRODUCTION;

      expect(() => {
        new ConsoleChannel();
      }).toThrow(/CRITICAL SECURITY ERROR: ConsoleChannel cannot be used in production environment/i);
    } finally {
      process.env.NODE_ENV = origEnv;
      if (origOverride) process.env.ALLOW_CONSOLE_OTP_IN_PRODUCTION = origOverride;
      if (origSmsOverride) process.env.ALLOW_CONSOLE_SMS_IN_PRODUCTION = origSmsOverride;
    }
  });

  it('allows ConsoleChannel in production ONLY when explicit override flag is true', () => {
    const origEnv = process.env.NODE_ENV;
    const origOverride = process.env.ALLOW_CONSOLE_OTP_IN_PRODUCTION;

    try {
      process.env.NODE_ENV = 'production';
      process.env.ALLOW_CONSOLE_OTP_IN_PRODUCTION = 'true';

      const channel = new ConsoleChannel();
      expect(channel.name).toBe('console');
    } finally {
      process.env.NODE_ENV = origEnv;
      if (origOverride) {
        process.env.ALLOW_CONSOLE_OTP_IN_PRODUCTION = origOverride;
      } else {
        delete process.env.ALLOW_CONSOLE_OTP_IN_PRODUCTION;
      }
    }
  });
});
