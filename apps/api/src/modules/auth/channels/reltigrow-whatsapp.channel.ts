import { Logger } from '@nestjs/common';
import { OtpChannel, SendOtpResult, OtpDeliveryErrorCode } from './otp-channel.interface';

export interface ReltigrowConfig {
  apiUrl?: string;
  apiKey?: string;
  templateName?: string;
  templateLanguage?: string;
}

export type FetchFunction = typeof fetch;

export class ReltigrowWhatsAppChannel implements OtpChannel {
  readonly name = 'whatsapp';
  private readonly logger = new Logger('ReltigrowWhatsAppChannel');

  private readonly apiUrl: string;
  private readonly apiKey: string;
  private readonly templateName: string;
  private readonly templateLanguage: string;
  private readonly customFetch?: FetchFunction;

  constructor(config?: ReltigrowConfig, customFetch?: FetchFunction) {
    this.apiUrl = config?.apiUrl || process.env.RELTIGROW_API_URL || 'https://whatsapp.reltigrow.com/api/v2';
    this.apiKey = config?.apiKey || process.env.RELTIGROW_API_KEY || '';
    this.templateName = config?.templateName || process.env.RELTIGROW_OTP_TEMPLATE || 'flowtrack_signup_otp';
    this.templateLanguage = config?.templateLanguage || process.env.RELTIGROW_OTP_LANGUAGE || 'en';
    this.customFetch = customFetch;

    this.validateConfiguration();
  }

  private validateConfiguration(): void {
    if (!this.apiKey || this.apiKey === 'your_reltigrow_api_key_here') {
      throw new Error(
        'Reltigrow WhatsApp configuration error: RELTIGROW_API_KEY is missing or contains placeholder. Please provide a valid Reltigrow API key.'
      );
    }

    if (!this.apiUrl) {
      throw new Error('Reltigrow WhatsApp configuration error: RELTIGROW_API_URL is missing.');
    }

    if (!this.templateName) {
      throw new Error('Reltigrow WhatsApp configuration error: RELTIGROW_OTP_TEMPLATE is missing.');
    }
  }

  private maskKey(): string {
    if (!this.apiKey || this.apiKey.length <= 4) return '****';
    return `...${this.apiKey.slice(-4)}`;
  }

  private maskPhone(phone: string): string {
    if (!phone || phone.length <= 4) return '****';
    return `${phone.slice(0, 3)}******${phone.slice(-4)}`;
  }

  /**
   * Dispatches an OTP code via Reltigrow WhatsApp Template API.
   */
  async send(recipient: string, code: string, purpose = 'SIGNUP'): Promise<SendOtpResult> {
    const maskedPhone = this.maskPhone(recipient);
    // Normalized recipient format (e.g. +919876543210 or 919876543210 depending on gateway)
    const normalizedPhone = recipient.replace(/\s+/g, '');

    const endpoint = `${this.apiUrl.replace(/\/+$/, '')}/messages/template`;
    const payload = {
      to: normalizedPhone,
      template: {
        name: this.templateName,
        language: {
          code: this.templateLanguage,
        },
        components: [
          {
            type: 'body',
            parameters: [
              {
                type: 'text',
                text: code,
              },
            ],
          },
          {
            type: 'button',
            sub_type: 'url',
            index: '0',
            parameters: [
              {
                type: 'text',
                text: code,
              },
            ],
          },
        ],
      },
    };

    const fetcher = this.customFetch || fetch;
    const maxAttempts = 2; // Initial attempt + 1 transient retry
    let lastError: any = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);

        const response = await fetcher(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.apiKey}`,
            'X-Api-Key': this.apiKey,
          },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        let data: any = {};
        try {
          data = await response.json();
        } catch {
          data = {};
        }

        if (response.ok) {
          this.logger.log(
            `[Reltigrow] WhatsApp OTP template dispatched to ${maskedPhone} (purpose: ${purpose}, key: ${this.maskKey()})`
          );
          return {
            success: true,
            messageId: data.messageId || data.id || `reltigrow-${Date.now()}`,
          };
        }

        const status = response.status;
        const mapped = this.mapProviderError(status, data);

        // Only retry on transient 5xx server errors or timeouts
        if (status >= 500 && attempt < maxAttempts) {
          this.logger.warn(`[Reltigrow] Transient ${status} error, retrying attempt ${attempt + 1}...`);
          await new Promise((r) => setTimeout(r, 400));
          continue;
        }

        this.logger.error(
          `[Reltigrow] HTTP ${status} error delivering to ${maskedPhone}: ${mapped.errorCode} (key: ${this.maskKey()})`
        );
        return mapped;
      } catch (err: any) {
        lastError = err;
        const isAbortOrNetwork = err.name === 'AbortError' || err.code === 'ECONNRESET' || err.message?.includes('fetch');

        if (isAbortOrNetwork && attempt < maxAttempts) {
          this.logger.warn(`[Reltigrow] Network/timeout error delivering to ${maskedPhone}, retrying...`);
          await new Promise((r) => setTimeout(r, 400));
          continue;
        }

        this.logger.error(
          `[Reltigrow] Network exception delivering to ${maskedPhone}: ${err.message || 'unknown error'}`
        );
        return {
          success: false,
          errorCode: 'PROVIDER_OUTAGE',
          error: 'WhatsApp delivery service is temporarily unreachable. Please try email verification.',
          canFallbackToEmail: true,
        };
      }
    }

    return {
      success: false,
      errorCode: 'PROVIDER_OUTAGE',
      error: 'WhatsApp delivery service timed out. Please try email verification.',
      canFallbackToEmail: true,
    };
  }

  private mapProviderError(status: number, data: any): SendOtpResult {
    const rawMsg = (data.message || data.error?.message || '').toLowerCase();

    if (status === 401 || status === 403) {
      return {
        success: false,
        errorCode: 'AUTH_FAILED',
        error: 'WhatsApp verification gateway authentication failed. Please contact platform support.',
        canFallbackToEmail: true,
      };
    }

    if (status === 404 || rawMsg.includes('template') || rawMsg.includes('not approved')) {
      return {
        success: false,
        errorCode: 'TEMPLATE_NOT_APPROVED',
        error: 'WhatsApp verification template is not active or approved.',
        canFallbackToEmail: true,
      };
    }

    if (rawMsg.includes('not on whatsapp') || rawMsg.includes('unregistered') || rawMsg.includes('user not found')) {
      return {
        success: false,
        errorCode: 'NOT_ON_WHATSAPP',
        error: 'The mobile number provided could not be reached on WhatsApp. Please check the number or use email fallback.',
        canFallbackToEmail: true,
      };
    }

    if (status === 400 || rawMsg.includes('invalid') || rawMsg.includes('phone') || rawMsg.includes('recipient')) {
      return {
        success: false,
        errorCode: 'INVALID_NUMBER',
        error: 'The mobile number format is invalid. Please check your 10-digit number.',
        canFallbackToEmail: true,
      };
    }

    if (status === 429 || rawMsg.includes('rate') || rawMsg.includes('limit')) {
      return {
        success: false,
        errorCode: 'RATE_LIMITED',
        error: 'Too many WhatsApp messages sent. Please wait a few minutes before requesting another code.',
        canFallbackToEmail: false,
      };
    }

    return {
      success: false,
      errorCode: 'PROVIDER_OUTAGE',
      error: 'WhatsApp service is temporarily unavailable. Please try email verification.',
      canFallbackToEmail: true,
    };
  }
}
