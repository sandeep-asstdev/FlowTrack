import { Logger } from '@nestjs/common';
import { SmsProvider, SendOtpResult } from './sms-provider.interface';

export class Msg91Provider implements SmsProvider {
  private readonly logger = new Logger('Msg91Provider');
  private readonly authKey: string;
  private readonly templateId: string;
  private readonly senderId: string;

  constructor() {
    this.authKey = process.env.MSG91_AUTH_KEY || '';
    this.templateId = process.env.MSG91_FLOW_ID || process.env.MSG91_TEMPLATE_ID || '';
    this.senderId = process.env.MSG91_SENDER_ID || '';

    if (!this.authKey || !this.templateId) {
      this.logger.warn(
        'MSG91 configuration is incomplete. Required: MSG91_AUTH_KEY and MSG91_FLOW_ID (or MSG91_TEMPLATE_ID). Outbound SMS calls may fail.'
      );
    }
  }

  async sendOtp(phone: string, otp: string, purpose = 'SIGNUP'): Promise<SendOtpResult> {
    if (!this.authKey || !this.templateId) {
      return {
        success: false,
        error: 'SMS service gateway is not fully configured (MSG91 credentials missing).',
      };
    }

    // MSG91 expects mobile format without leading '+' (e.g. 919876543210)
    const normalizedMobile = phone.replace(/^\+/, '');

    try {
      const url = new URL('https://control.msg91.com/api/v5/otp');
      url.searchParams.append('template_id', this.templateId);
      url.searchParams.append('mobile', normalizedMobile);
      url.searchParams.append('authkey', this.authKey);
      url.searchParams.append('otp', otp);
      if (this.senderId) {
        url.searchParams.append('sender', this.senderId);
      }

      const response = await fetch(url.toString(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          authkey: this.authKey,
        },
      });

      const data = (await response.json().catch(() => ({}))) as any;

      if (!response.ok || data.type === 'error') {
        const errMsg = data.message || `MSG91 HTTP ${response.status}`;
        this.logger.error(`MSG91 dispatch failed: ${errMsg}`);
        return {
          success: false,
          error: errMsg,
        };
      }

      return {
        success: true,
        messageId: data.request_id || `msg91-${Date.now()}`,
      };
    } catch (err: any) {
      this.logger.error(`Network error while communicating with MSG91 gateway: ${err.message}`);
      return {
        success: false,
        error: 'Unable to deliver verification code. Please check your network and try again shortly.',
      };
    }
  }
}
