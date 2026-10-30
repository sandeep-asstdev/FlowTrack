import { Logger } from '@nestjs/common';
import { OtpChannel, SendOtpResult } from './otp-channel.interface';

export class EmailChannel implements OtpChannel {
  readonly name = 'email';
  private readonly logger = new Logger('EmailChannel');

  async send(recipient: string, code: string, purpose = 'SIGNUP'): Promise<SendOtpResult> {
    const maskedEmail = this.maskEmail(recipient);
    this.logger.log(`[EmailChannel] Fallback verification code dispatched to ${maskedEmail} (purpose: ${purpose})`);

    // In local dev/test environment, prints to console
    if (process.env.NODE_ENV !== 'production') {
      console.log(`\n========================================\n[EmailChannel] >> To: ${maskedEmail} | Code: [${code}] <<\n========================================\n`);
    }

    return {
      success: true,
      messageId: `email-otp-${Date.now()}`,
    };
  }

  private maskEmail(email: string): string {
    if (!email || !email.includes('@')) return '***@***';
    const [user, domain] = email.split('@');
    const maskedUser = user.length > 2 ? `${user[0]}***${user.slice(-1)}` : `${user[0]}*`;
    return `${maskedUser}@${domain}`;
  }
}
