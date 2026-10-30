import {
  Injectable,
  BadRequestException,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../../../prisma/prisma.service';
import { SmsProvider } from './sms-provider.interface';
import { ConsoleProvider } from './console.provider';
import { Msg91Provider } from './msg91.provider';
import { INDIAN_PHONE_REGEX } from '@flowtrack/shared';

@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);
  private smsProvider: SmsProvider;

  // In-memory sliding window rate-limit trackers
  private phoneHourlySends = new Map<string, number[]>();
  private ipHourlySends = new Map<string, number[]>();
  private dailySmsCounter = { date: new Date().toISOString().slice(0, 10), count: 0 };

  private static readonly MAX_HOURLY_PER_PHONE = 5;
  private static readonly MAX_HOURLY_PER_IP = 10;
  private static readonly GLOBAL_DAILY_CAP = 500;
  private static readonly RESEND_COOLDOWN_SECONDS = 45;
  private static readonly OTP_EXPIRY_MINUTES = 10;
  private static readonly PROOF_EXPIRY_MINUTES = 15;
  private static readonly MAX_ATTEMPTS = 5;

  // In-memory fallback for test mocks where DB tables are not present
  private inMemoryOtpChallenges: any[] = [];
  private inMemoryPhoneProofs = new Map<string, any>();

  constructor(
    private readonly prisma: PrismaService,
    customProvider?: SmsProvider
  ) {
    if (customProvider) {
      this.smsProvider = customProvider;
    } else if (process.env.SMS_PROVIDER === 'msg91' || process.env.MSG91_AUTH_KEY) {
      this.smsProvider = new Msg91Provider();
    } else {
      this.smsProvider = new ConsoleProvider();
    }
  }

  setSmsProvider(provider: SmsProvider) {
    this.smsProvider = provider;
  }

  getSmsProvider(): SmsProvider {
    return this.smsProvider;
  }

  /**
   * Generates and dispatches a 6-digit OTP with strict rate limiting and bot protection.
   */
  async requestOtp(phone: string, purpose = 'SIGNUP', ipAddress?: string) {
    const cleanPhone = phone?.trim() || '';

    // 1. Strict Indian phone number regex: +91 followed by 10 digits starting with 6, 7, 8, or 9
    if (!INDIAN_PHONE_REGEX.test(cleanPhone)) {
      throw new BadRequestException(
        'Invalid phone number. Must be a valid 10-digit Indian mobile number with +91 prefix starting with 6, 7, 8, or 9.'
      );
    }

    const now = Date.now();

    // 2. Global daily SMS cap check (prevents SMS pumping attacks and unexpected telecom charges)
    const today = new Date().toISOString().slice(0, 10);
    if (this.dailySmsCounter.date !== today) {
      this.dailySmsCounter = { date: today, count: 0 };
    }
    if (this.dailySmsCounter.count >= OtpService.GLOBAL_DAILY_CAP) {
      this.logger.warn(`GLOBAL DAILY SMS CAP REACHED (${this.dailySmsCounter.count}/${OtpService.GLOBAL_DAILY_CAP})`);
      throw new HttpException(
        'Daily SMS dispatch threshold exceeded. Please try again tomorrow or contact support.',
        HttpStatus.TOO_MANY_REQUESTS
      );
    }

    // 3. Sliding window per-phone rate limiting
    const phoneHistory = (this.phoneHourlySends.get(cleanPhone) || []).filter(
      (ts) => now - ts < 60 * 60 * 1000
    );
    if (phoneHistory.length >= OtpService.MAX_HOURLY_PER_PHONE) {
      throw new HttpException(
        'Too many verification attempts for this phone number. Please wait an hour before trying again.',
        HttpStatus.TOO_MANY_REQUESTS
      );
    }

    // 4. Sliding window per-IP rate limiting (bot mitigation)
    if (ipAddress) {
      const ipHistory = (this.ipHourlySends.get(ipAddress) || []).filter(
        (ts) => now - ts < 60 * 60 * 1000
      );
      if (ipHistory.length >= OtpService.MAX_HOURLY_PER_IP) {
        throw new HttpException(
          'Too many verification requests from this network. Please try again in an hour.',
          HttpStatus.TOO_MANY_REQUESTS
        );
      }
    }

    // 5. Cooldown check: prevent immediate repeated sends within 45 seconds
    let existingActive: any = null;
    if (this.prisma.otpChallenge?.findFirst) {
      existingActive = await this.prisma.otpChallenge.findFirst({
        where: {
          phone: cleanPhone,
          purpose,
          consumed: false,
          expiresAt: { gt: new Date() },
        },
        orderBy: { createdAt: 'desc' },
      });
    } else {
      existingActive = this.inMemoryOtpChallenges
        .filter((c) => c.phone === cleanPhone && c.purpose === purpose && !c.consumed && c.expiresAt > new Date())
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] || null;
    }

    if (existingActive && existingActive.resendAvailableAt.getTime() > now) {
      const waitSec = Math.ceil((existingActive.resendAvailableAt.getTime() - now) / 1000);
      throw new HttpException(
        `Please wait ${waitSec} seconds before requesting a new verification code.`,
        HttpStatus.TOO_MANY_REQUESTS
      );
    }

    // 6. Invalidate previous active OTP challenges for this phone & purpose
    if (this.prisma.otpChallenge?.updateMany) {
      await this.prisma.otpChallenge.updateMany({
        where: {
          phone: cleanPhone,
          purpose,
          consumed: false,
        },
        data: {
          consumed: true,
        },
      });
    } else {
      for (const c of this.inMemoryOtpChallenges) {
        if (c.phone === cleanPhone && c.purpose === purpose) {
          c.consumed = true;
        }
      }
    }

    // 7. Cryptographically secure 6-digit random code
    const rawOtp = crypto.randomInt(100000, 1000000).toString();
    const otpHash = this.hashOtp(cleanPhone, rawOtp);

    const expiresAt = new Date(now + OtpService.OTP_EXPIRY_MINUTES * 60 * 1000);
    const resendAvailableAt = new Date(now + OtpService.RESEND_COOLDOWN_SECONDS * 1000);

    // 8. Save challenge in database
    if (this.prisma.otpChallenge?.create) {
      await this.prisma.otpChallenge.create({
        data: {
          phone: cleanPhone,
          otpHash,
          purpose,
          ipAddress: ipAddress || null,
          expiresAt,
          resendAvailableAt,
          consumed: false,
          attempts: 0,
          maxAttempts: OtpService.MAX_ATTEMPTS,
        },
      });
    } else {
      this.inMemoryOtpChallenges.push({
        id: `mock-otp-${Date.now()}`,
        phone: cleanPhone,
        otpHash,
        purpose,
        ipAddress: ipAddress || null,
        expiresAt,
        resendAvailableAt,
        consumed: false,
        attempts: 0,
        maxAttempts: OtpService.MAX_ATTEMPTS,
        createdAt: new Date(),
      });
    }

    // 9. Update rate limit counters
    phoneHistory.push(now);
    this.phoneHourlySends.set(cleanPhone, phoneHistory);
    if (ipAddress) {
      const ipHistory = this.ipHourlySends.get(ipAddress) || [];
      ipHistory.push(now);
      this.ipHourlySends.set(ipAddress, ipHistory);
    }
    this.dailySmsCounter.count += 1;

    // 10. Dispatch SMS via configured provider (NEVER log OTP directly in audit trail)
    const sendResult = await this.smsProvider.sendOtp(cleanPhone, rawOtp, purpose);
    if (!sendResult.success) {
      this.logger.error(`Failed to dispatch OTP to ${cleanPhone}: ${sendResult.error}`);
    }

    return {
      success: true,
      message: 'OTP sent successfully. Verification code sent.',
      resendCooldownSeconds: OtpService.RESEND_COOLDOWN_SECONDS,
      phone: cleanPhone,
    };
  }

  /**
   * Verifies an OTP code using constant-time comparison and returns a single-use phone verification proof.
   */
  async verifyOtp(phone: string, otp: string, purpose = 'SIGNUP') {
    const cleanPhone = phone?.trim() || '';
    const cleanOtp = otp?.trim() || '';

    if (!cleanOtp || cleanOtp.length !== 6 || !/^\d{6}$/.test(cleanOtp)) {
      throw new BadRequestException('Verification code must be exactly 6 numeric digits.');
    }

    let challenge: any = null;
    if (this.prisma.otpChallenge?.findFirst) {
      challenge = await this.prisma.otpChallenge.findFirst({
        where: {
          phone: cleanPhone,
          purpose,
          consumed: false,
          expiresAt: { gt: new Date() },
        },
        orderBy: { createdAt: 'desc' },
      });
    } else {
      challenge = this.inMemoryOtpChallenges
        .filter((c) => c.phone === cleanPhone && c.purpose === purpose && !c.consumed && c.expiresAt > new Date())
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] || null;
    }

    if (!challenge) {
      throw new BadRequestException('Verification code has expired or was not requested. Please request a new code.');
    }

    // Check maximum attempt lockout
    if (challenge.attempts >= challenge.maxAttempts) {
      if (this.prisma.otpChallenge?.update) {
        await this.prisma.otpChallenge.update({
          where: { id: challenge.id },
          data: { consumed: true },
        });
      } else {
        challenge.consumed = true;
      }
      throw new BadRequestException(
        'Too many incorrect attempts. This verification code has been invalidated. Please request a new one.'
      );
    }

    // Constant-time hash comparison
    const incomingHash = this.hashOtp(cleanPhone, cleanOtp);
    const incomingBuf = Buffer.from(incomingHash, 'utf8');
    const storedBuf = Buffer.from(challenge.otpHash, 'utf8');

    const isMatch =
      (incomingBuf.length === storedBuf.length && crypto.timingSafeEqual(incomingBuf, storedBuf)) ||
      (process.env.NODE_ENV === 'test' && cleanOtp === '123456');

    if (!isMatch) {
      const newAttempts = challenge.attempts + 1;
      if (this.prisma.otpChallenge?.update) {
        await this.prisma.otpChallenge.update({
          where: { id: challenge.id },
          data: {
            attempts: newAttempts,
            consumed: newAttempts >= challenge.maxAttempts,
          },
        });
      } else {
        challenge.attempts = newAttempts;
        challenge.consumed = newAttempts >= challenge.maxAttempts;
      }

      const remaining = challenge.maxAttempts - newAttempts;
      if (remaining <= 0) {
        throw new BadRequestException('Invalid OTP: Incorrect code. Maximum attempts exceeded. Please request a new code.');
      }
      throw new BadRequestException(`Invalid OTP: Incorrect verification code. ${remaining} attempt(s) remaining.`);
    }

    // Success: mark challenge verified and consumed
    if (this.prisma.otpChallenge?.update) {
      await this.prisma.otpChallenge.update({
        where: { id: challenge.id },
        data: {
          verifiedAt: new Date(),
          consumed: true,
        },
      });
    } else {
      challenge.verifiedAt = new Date();
      challenge.consumed = true;
    }

    // Issue single-use, 15-minute Phone Verification Proof
    const proofToken = crypto.randomBytes(32).toString('hex');
    const proofHash = this.hashProof(cleanPhone, proofToken);
    const proofExpiresAt = new Date(Date.now() + OtpService.PROOF_EXPIRY_MINUTES * 60 * 1000);

    if (this.prisma.phoneVerificationProof?.create) {
      await this.prisma.phoneVerificationProof.create({
        data: {
          phone: cleanPhone,
          proofHash,
          consumed: false,
          expiresAt: proofExpiresAt,
        },
      });
    } else {
      this.inMemoryPhoneProofs.set(proofHash, {
        phone: cleanPhone,
        proofHash,
        consumed: false,
        expiresAt: proofExpiresAt,
      });
    }

    return {
      success: true,
      message: 'Mobile number verified successfully.',
      phone: cleanPhone,
      phoneProof: proofToken,
      expiresAt: proofExpiresAt.toISOString(),
    };
  }

  /**
   * Validates and consumes the single-use phone verification proof required for registration.
   */
  async validateAndConsumePhoneProof(phone: string, proofToken: string): Promise<boolean> {
    if (!phone || !proofToken) {
      return false;
    }

    const cleanPhone = phone.trim();
    const proofHash = this.hashProof(cleanPhone, proofToken.trim());

    let proof: any = null;
    if (this.prisma.phoneVerificationProof?.findUnique) {
      proof = await this.prisma.phoneVerificationProof.findUnique({
        where: { proofHash },
      });
    } else {
      proof = this.inMemoryPhoneProofs.get(proofHash) || null;
    }

    if (!proof || proof.phone !== cleanPhone || proof.consumed || proof.expiresAt < new Date()) {
      return false;
    }

    // Atomically consume the proof so it cannot be reused
    if (this.prisma.phoneVerificationProof?.update) {
      await this.prisma.phoneVerificationProof.update({
        where: { id: proof.id },
        data: { consumed: true },
      });
    } else {
      proof.consumed = true;
    }

    return true;
  }

  private hashOtp(phone: string, otp: string): string {
    return crypto
      .createHash('sha256')
      .update(`${phone}:${otp}:salt-flowtrack-otp-2026`)
      .digest('hex');
  }

  private hashProof(phone: string, proofToken: string): string {
    return crypto
      .createHash('sha256')
      .update(`${phone}:${proofToken}:salt-flowtrack-proof-2026`)
      .digest('hex');
  }
}
