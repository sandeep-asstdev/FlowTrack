import { Logger } from '@nestjs/common';
import { OtpChannel, SendOtpResult } from './otp-channel.interface';

export class ConsoleChannel implements OtpChannel {
  readonly name = 'console';
  private readonly logger = new Logger('ConsoleChannel');

  constructor() {
    const isProduction = process.env.NODE_ENV === 'production';
    const allowOverride = process.env.ALLOW_CONSOLE_OTP_IN_PRODUCTION === 'true';

    if (isProduction && !allowOverride) {
      throw new Error(
        'CRITICAL SECURITY ERROR: ConsoleChannel cannot be used in production environment without explicit ALLOW_CONSOLE_OTP_IN_PRODUCTION=true override. Please configure Reltigrow WhatsApp channel.'
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
