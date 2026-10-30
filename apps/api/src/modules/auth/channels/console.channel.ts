import { Logger } from '@nestjs/common';
import { OtpChannel, SendOtpResult } from './otp-channel.interface';

export class ConsoleChannel implements OtpChannel {
  readonly name = 'console';
  private readonly logger = new Logger('ConsoleChannel');

  constructor() {
    const isProduction = process.env.NODE_ENV === 'production';
    const isRenderHosting = process.env.RENDER === 'true' || Boolean(process.env.RENDER_SERVICE_ID);
    const allowOverride =
      process.env.ALLOW_CONSOLE_OTP_IN_PRODUCTION === 'true' ||
      process.env.ALLOW_CONSOLE_WHATSAPP_IN_PRODUCTION === 'true' ||
      process.env.ALLOW_CONSOLE_SMS_IN_PRODUCTION === 'true' ||
      process.env.HOLD_WHATSAPP === 'true' ||
      process.env.SHOW_OTP_IN_UI === 'true' ||
      (isRenderHosting && (!process.env.RELTIGROW_API_KEY || process.env.RELTIGROW_API_KEY === 'your_reltigrow_api_key_here'));

    if (isProduction && !allowOverride) {
      throw new Error(
        'CRITICAL SECURITY ERROR: ConsoleChannel cannot be used in production environment without explicit ALLOW_CONSOLE_OTP_IN_PRODUCTION=true override. Please configure Reltigrow WhatsApp channel or set ALLOW_CONSOLE_OTP_IN_PRODUCTION=true in your environment.'
      );
    }

    if (isProduction && isRenderHosting && !process.env.RELTIGROW_API_KEY) {
      this.logger.warn(
        'Running on Render with ConsoleChannel OTP simulation. Real WhatsApp messages will not be sent until RELTIGROW_API_KEY is configured in Render dashboard.'
      );
    }
  }

  async send(recipient: string, code: string, purpose = 'SIGNUP'): Promise<SendOtpResult> {
    const maskedPhone = this.maskPhone(recipient);
    const logMessage = `[WhatsApp Simulation (ConsoleChannel)] >> To: ${maskedPhone} | Purpose: ${purpose} | One-Time Code: [${code}] <<`;
    this.logger.log(logMessage);
    console.log(`\n========================================\n${logMessage}\n========================================\n`);

    return {
      success: true,
      messageId: `console-whatsapp-${Date.now()}`,
    };
  }

  private maskPhone(phone: string): string {
    if (!phone || phone.length <= 4) return '****';
    return `${phone.slice(0, 3)}******${phone.slice(-4)}`;
  }
}

