import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ReltigrowWhatsAppChannel } from './reltigrow-whatsapp.channel';
import { ConsoleChannel } from './console.channel';

describe('Reltigrow WhatsApp Channel & Security Suite', () => {
  const dummyApiKey = 'test_reltigrow_secret_key_8899';
  const dummyApiUrl = 'https://whatsapp.reltigrow.com/api/v2';
  const dummyTemplate = 'flowtrack_signup_otp';

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. Configuration & Validation', () => {
    it('fails fast on startup if RELTIGROW_API_KEY is missing', () => {
      expect(() => {
        new ReltigrowWhatsAppChannel({
          apiUrl: dummyApiUrl,
          apiKey: '',
          templateName: dummyTemplate,
        });
      }).toThrow(/RELTIGROW_API_KEY is missing/i);
    });

    it('fails fast on startup if placeholder key is detected', () => {
      expect(() => {
        new ReltigrowWhatsAppChannel({
          apiUrl: dummyApiUrl,
          apiKey: 'your_reltigrow_api_key_here',
          templateName: dummyTemplate,
        });
      }).toThrow(/placeholder/i);
    });

    it('masks API key in logs, never exposing more than last 4 characters', async () => {
      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ success: true, messageId: 'msg-123' }),
      });

      const channel = new ReltigrowWhatsAppChannel(
        { apiUrl: dummyApiUrl, apiKey: dummyApiKey, templateName: dummyTemplate },
        mockFetch as any
      );

      await channel.send('+919876543210', '481920');

      // Assert full secret key is never in any console output
      for (const call of consoleLogSpy.mock.calls) {
        const text = call.join(' ');
        expect(text).not.toContain(dummyApiKey);
      }
    });

    it('masks phone numbers in logs and never prints full phone', async () => {
      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ success: true, messageId: 'msg-123' }),
      });

      const channel = new ReltigrowWhatsAppChannel(
        { apiUrl: dummyApiUrl, apiKey: dummyApiKey, templateName: dummyTemplate },
        mockFetch as any
      );

      await channel.send('+919876543210', '481920');

      // Target phone should be masked (e.g. +91******3210)
      for (const call of consoleLogSpy.mock.calls) {
        const text = call.join(' ');
        expect(text).not.toContain('+919876543210');
      }
    });
  });

  describe('2. Request Formatting & Template Parameters', () => {
    it('uses Content-Type application/json, auth header, and correct template payload', async () => {
      let capturedUrl = '';
      let capturedOptions: any = null;

      const mockFetch = vi.fn().mockImplementation((url, options) => {
        capturedUrl = url;
        capturedOptions = options;
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ success: true, messageId: 'wa-msg-888' }),
        });
      });

      const channel = new ReltigrowWhatsAppChannel(
        { apiUrl: dummyApiUrl, apiKey: dummyApiKey, templateName: dummyTemplate, templateLanguage: 'en' },
        mockFetch as any
      );

      const result = await channel.send('+919876543210', '951753', 'SIGNUP');

      expect(result.success).toBe(true);
      expect(result.messageId).toBe('wa-msg-888');

      expect(capturedUrl).toBe('https://whatsapp.reltigrow.com/api/v2/messages/template');
      expect(capturedOptions.method).toBe('POST');
      expect(capturedOptions.headers['Content-Type']).toBe('application/json');
      expect(capturedOptions.headers['Authorization']).toBe(`Bearer ${dummyApiKey}`);

      const body = JSON.parse(capturedOptions.body);
      expect(body.to).toBe('+919876543210');
      expect(body.template.name).toBe('flowtrack_signup_otp');
      expect(body.template.language.code).toBe('en');
      // Contains the 6-digit code in the body component
      const bodyComponent = body.template.components.find((c: any) => c.type === 'body');
      expect(bodyComponent.parameters[0].text).toBe('951753');
    });
  });

  describe('3. Error Mapping & Email Fallback Trigger', () => {
    it('maps 400 invalid number error to friendly message without exposing raw payload', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ message: 'Invalid recipient phone number format' }),
      });

      const channel = new ReltigrowWhatsAppChannel(
        { apiUrl: dummyApiUrl, apiKey: dummyApiKey, templateName: dummyTemplate },
        mockFetch as any
      );

      const res = await channel.send('+919876543210', '123456');
      expect(res.success).toBe(false);
      expect(res.errorCode).toBe('INVALID_NUMBER');
      expect(res.error).toContain('Please check your 10-digit number');
      expect(res.canFallbackToEmail).toBe(true);
    });

    it('maps unregistered / not on WhatsApp to friendly message and email fallback', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ message: 'User not on WhatsApp' }),
      });

      const channel = new ReltigrowWhatsAppChannel(
        { apiUrl: dummyApiUrl, apiKey: dummyApiKey, templateName: dummyTemplate },
        mockFetch as any
      );

      const res = await channel.send('+919876543210', '123456');
      expect(res.success).toBe(false);
      expect(res.errorCode).toBe('NOT_ON_WHATSAPP');
      expect(res.error).toContain('could not be reached on WhatsApp');
      expect(res.canFallbackToEmail).toBe(true);
    });

    it('maps 401/403 authentication failures to internal support message', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ error: { message: 'Invalid API token provided' } }),
      });

      const channel = new ReltigrowWhatsAppChannel(
        { apiUrl: dummyApiUrl, apiKey: dummyApiKey, templateName: dummyTemplate },
        mockFetch as any
      );

      const res = await channel.send('+919876543210', '123456');
      expect(res.success).toBe(false);
      expect(res.errorCode).toBe('AUTH_FAILED');
      expect(res.error).toContain('gateway authentication failed');
      expect(res.canFallbackToEmail).toBe(true);
    });

    it('maps 404 / template unapproved error', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({ message: 'Template not approved or inactive' }),
      });

      const channel = new ReltigrowWhatsAppChannel(
        { apiUrl: dummyApiUrl, apiKey: dummyApiKey, templateName: dummyTemplate },
        mockFetch as any
      );

      const res = await channel.send('+919876543210', '123456');
      expect(res.success).toBe(false);
      expect(res.errorCode).toBe('TEMPLATE_NOT_APPROVED');
      expect(res.error).toContain('not active or approved');
      expect(res.canFallbackToEmail).toBe(true);
    });

    it('maps 429 rate limit error', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        json: async () => ({ message: 'Rate limit exceeded' }),
      });

      const channel = new ReltigrowWhatsAppChannel(
        { apiUrl: dummyApiUrl, apiKey: dummyApiKey, templateName: dummyTemplate },
        mockFetch as any
      );

      const res = await channel.send('+919876543210', '123456');
      expect(res.success).toBe(false);
      expect(res.errorCode).toBe('RATE_LIMITED');
      expect(res.error).toContain('Too many WhatsApp messages sent');
    });
  });

  describe('4. Transient Retry Mechanism', () => {
    it('retries on transient 500 error and succeeds on 2nd attempt', async () => {
      let callCount = 0;
      const mockFetch = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({
            ok: false,
            status: 502,
            json: async () => ({ message: 'Bad Gateway' }),
          });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ messageId: 'wa-success-retry' }),
        });
      });

      const channel = new ReltigrowWhatsAppChannel(
        { apiUrl: dummyApiUrl, apiKey: dummyApiKey, templateName: dummyTemplate },
        mockFetch as any
      );

      const res = await channel.send('+919876543210', '777888');
      expect(callCount).toBe(2);
      expect(res.success).toBe(true);
      expect(res.messageId).toBe('wa-success-retry');
    });

    it('does NOT retry non-transient 4xx errors', async () => {
      let callCount = 0;
      const mockFetch = vi.fn().mockImplementation(() => {
        callCount++;
        return Promise.resolve({
          ok: false,
          status: 400,
          json: async () => ({ message: 'Invalid recipient' }),
        });
      });

      const channel = new ReltigrowWhatsAppChannel(
        { apiUrl: dummyApiUrl, apiKey: dummyApiKey, templateName: dummyTemplate },
        mockFetch as any
      );

      const res = await channel.send('+919876543210', '777888');
      expect(callCount).toBe(1); // Exactly 1 attempt, no redundant retry
      expect(res.success).toBe(false);
    });
  });
});
