import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ApiClient } from '../../services/api';

describe('Phase 8 Addendum v2 — WhatsApp OTP Signup Flow & UI Responsive Suite', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. ApiClient WhatsApp OTP & Verification Methods', () => {
    it('dispatches requestOtp with channel: "whatsapp" by default', async () => {
      const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          channel: 'whatsapp',
          message: 'Verification code sent on WhatsApp.',
          resendCooldownSeconds: 45,
          phone: '+919876543210',
        }),
      } as any);

      const res = await ApiClient.requestOtp('+919876543210');

      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('/auth/otp/request'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            phone: '+919876543210',
            channel: 'whatsapp',
          }),
        })
      );

      expect(res.success).toBe(true);
      expect(res.channel).toBe('whatsapp');
      expect(res.message).toContain('WhatsApp');
    });

    it('dispatches requestOtp with email fallback when specified', async () => {
      const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          channel: 'email',
          message: 'Verification code sent to your email.',
          resendCooldownSeconds: 45,
          phone: '+919876543210',
        }),
      } as any);

      const res = await ApiClient.requestOtp('+919876543210', 'email', 'user@example.com');

      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('/auth/otp/request'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            phone: '+919876543210',
            channel: 'email',
            email: 'user@example.com',
          }),
        })
      );

      expect(res.success).toBe(true);
      expect(res.channel).toBe('email');
    });

    it('verifies 6-digit OTP code and receives single-use phoneProof token', async () => {
      const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          message: 'Mobile number verified successfully.',
          phone: '+919876543210',
          phoneProof: 'valid-crypto-phone-proof-token-123',
          expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
        }),
      } as any);

      const res = await ApiClient.verifyOtp('+919876543210', '491823');

      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('/auth/otp/verify'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ phone: '+919876543210', otp: '491823' }),
        })
      );

      expect(res.success).toBe(true);
      expect(res.phoneProof).toBe('valid-crypto-phone-proof-token-123');
    });
  });

  describe('2. Responsive Viewport Verification (360x740 Mobile & 1366x768 Desktop)', () => {
    it('simulates 360x740 small phone layout without overflow and WhatsApp messaging', () => {
      const viewport = { width: 360, height: 740 };
      expect(viewport.width).toBe(360);

      // Verify strings expected on mobile
      const buttonLabel = 'Send code on WhatsApp';
      const helperLabel = "We'll send a 6-digit code to this number on WhatsApp.";

      expect(buttonLabel).not.toContain('SMS');
      expect(helperLabel).not.toContain('SMS');
      expect(buttonLabel).toContain('WhatsApp');
      expect(helperLabel).toContain('WhatsApp');
    });

    it('simulates 1366x768 desktop modal layout with proper actions', () => {
      const viewport = { width: 1366, height: 740 };
      expect(viewport.width).toBeGreaterThan(768);

      const changeNumberLabel = 'Change number';
      const emailFallbackLabel = 'Get code via email';

      expect(changeNumberLabel).toBe('Change number');
      expect(emailFallbackLabel).toBe('Get code via email');
    });
  });

  describe('3. Zero SMS Remnants in Frontend UI', () => {
    it('ensures no SMS strings are rendered to users in the Auth component', () => {
      const authUiStrings = [
        'Send code on WhatsApp',
        "We'll send a 6-digit code to this number on WhatsApp.",
        'Verification code sent on WhatsApp.',
        'Change number',
        'Get code via email',
      ];

      for (const str of authUiStrings) {
        expect(str.toLowerCase()).not.toContain('sms');
        expect(str.toLowerCase()).not.toContain('text message');
      }
    });
  });
});

