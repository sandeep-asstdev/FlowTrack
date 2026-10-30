import { Logger } from '@nestjs/common';
import { SmsProvider, SendOtpResult } from './sms-provider.interface';

export class ConsoleProvider implements SmsProvider {
  private readonly logger = new Logger('ConsoleProvider');

  constructor() {
    const isProduction = process.env.NODE_ENV === 'production';
    const allowOverride = process.env.ALLOW_CONSOLE_SMS_IN_PRODUCTION === 'true';

    if (isProduction && !allowOverride) {
      throw new Error(
        'CRITICAL SECURITY ERROR: ConsoleProvider cannot be used in production environment without explicit ALLOW_CONSOLE_SMS_IN_PRODUCTION=true override. Please configure a certified SMS provider (e.g. MSG91).'
      );
    }
  }

  async sendOtp(phone: string, otp: string, purpose = 'SIGNUP'): Promise<SendOtpResult> {
    const logMessage = `[SMS ConsoleProvider] >> To: ${phone} | Purpose: ${purpose} | One-Time Code: [${otp}] <<`;
    this.logger.log(logMessage);
    // Also print directly to standard output for local dev visibility
    console.log(`\n========================================\n${logMessage}\n========================================\n`);

    return {
      success: true,
      messageId: `console-msg-${Date.now()}`,
    };
  }
}
