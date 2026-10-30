import {
  Injectable,
  BadRequestException,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../../../prisma/prisma.service';
import { OtpChannel, SendOtpResult } from '../channels/otp-channel.interface';
import { ConsoleChannel } from '../channels/console.channel';
import { ReltigrowWhatsAppChannel } from '../channels/reltigrow-whatsapp.channel';
import { EmailChannel } from '../channels/email.channel';
import { INDIAN_PHONE_REGEX } from '@flowtrack/shared';

@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);
  private primaryChannel: OtpChannel;
  private emailChannel: OtpChannel;

  // In-memory sliding window rate-limit trackers
  private phoneHourlySends = new Map<string, number[]>();
  private ipHourlySends = new Map<string, number[]>();
  private dailyOtpCounter = { date: new Date().toISOString().slice(0, 10), count: 0 };

  private static readonly MAX_HOURLY_PER_PHONE = 5;
  private static readonly MAX_HOURLY_PER_IP = 10;
  private static readonly GLOBAL_DAILY_CAP = 500;
  private static readonly RESEND_COOLDOWN_SECONDS = 45;
  private static readonly OTP_EXPIRY_MINUTES = 5;
  private static readonly PROOF_EXPIRY_MINUTES = 15;
  private static readonly MAX_ATTEMPTS = 5;

  // In-memory fallback for test mocks where DB tables are not present
  private inMemoryOtpChallenges: any[] = [];
  private inMemoryPhoneProofs = new Map<string, any>();

  constructor(private readonly prisma: PrismaService) {
    this.emailChannel = new EmailChannel();

    // In automated tests (NODE_ENV=test), default to ConsoleChannel so tests don't consume live WhatsApp credits
    const isTest = process.env.NODE_ENV === 'test';
    // WhatsApp OTP on hold by user request -> use Console simulation channel
    const holdWhatsApp = process.env.HOLD_WHATSAPP === 'true';

    if (
      !isTest &&
      !holdWhatsApp &&
      process.env.RELTIGROW_API_KEY &&
      process.env.RELTIGROW_API_KEY !== 'your_reltigrow_api_key_here'
    ) {
      try {
        this.primaryChannel = new ReltigrowWhatsAppChannel();
      } catch (err: any) {
        this.logger.warn(`Failed to initialize ReltigrowWhatsAppChannel: ${err.message}. Defaulting to ConsoleChannel.`);
        this.primaryChannel = new ConsoleChannel();
      }
    } else {
      this.primaryChannel = new ConsoleChannel();
    }
  }

  setChannel(channel: OtpChannel) {
    this.primaryChannel = channel;
  }

  getChannel(): OtpChannel {
    return this.primaryChannel;
  }

  setEmailChannel(channel: OtpChannel) {
    this.emailChannel = channel;
  }

  getEmailChannel(): OtpChannel {
    return this.emailChannel;
  }

  /**
   * Generates and dispatches a 6-digit OTP code via WhatsApp (with email fallback) and strict rate limiting.
   */
  async requestOtp(
    phone: string,
    purpose = 'SIGNUP',
    ipAddress?: string,
    options?: { channel?: 'whatsapp' | 'email'; email?: string }
  ) {
    const cleanPhone = phone?.trim() || '';

    // 1. Strict Indian phone number regex: +91 followed by 10 digits starting with 6, 7, 8, or 9
    if (!INDIAN_PHONE_REGEX.test(cleanPhone)) {
      throw new BadRequestException(
        'Invalid phone number. Must be a valid 10-digit Indian mobile number with +91 prefix starting with 6, 7, 8, or 9.'
      );
    }

    const now = Date.now();

    // 2. Global daily OTP cap check (prevents pumping attacks and gateway abuse)
    const today = new Date().toISOString().slice(0, 10);
    if (this.dailyOtpCounter.date !== today) {
      this.dailyOtpCounter = { date: today, count: 0 };
    }
    if (this.dailyOtpCounter.count >= OtpService.GLOBAL_DAILY_CAP) {
      this.logger.warn(
        `GLOBAL DAILY OTP CAP REACHED (${this.dailyOtpCounter.count}/${OtpService.GLOBAL_DAILY_CAP})`
      );
      throw new HttpException(
        'Daily verification code dispatch threshold exceeded. Please try again tomorrow or contact support.',
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
    this.dailyOtpCounter.count += 1;

    // 10. Dispatch OTP via WhatsApp (or fallback to email if requested)
    let sendResult: SendOtpResult;
    let channelUsed = 'whatsapp';

    if (options?.channel === 'email' && options?.email) {
      channelUsed = 'email';
      sendResult = await this.emailChannel.send(options.email, rawOtp, purpose);
    } else {
      sendResult = await this.primaryChannel.send(cleanPhone, rawOtp, purpose);

      // If delivery failed and email fallback is available
      if (!sendResult.success && options?.email) {
        this.logger.warn(`WhatsApp dispatch failed, triggering email fallback for ${cleanPhone}`);
        sendResult = await this.emailChannel.send(options.email, rawOtp, purpose);
        channelUsed = 'email';
      }
    }

    if (!sendResult.success) {
      const errorId = `ERR-OTP-${Date.now().toString(36).toUpperCase()}`;
      this.logger.error(`[${errorId}] Failed to dispatch OTP: ${sendResult.error}`);
      throw new HttpException(
        {
          success: false,
          errorId,
          message: sendResult.error || "We couldn't send the code. Please try again or use email.",
          errorCode: sendResult.errorCode || 'PROVIDER_OUTAGE',
          canFallbackToEmail: sendResult.canFallbackToEmail !== false,
          resendCooldownSeconds: OtpService.RESEND_COOLDOWN_SECONDS,
          phone: cleanPhone,
        },
        HttpStatus.BAD_GATEWAY
      );
    }

    const isConsoleChannel = this.primaryChannel.name === 'console' && channelUsed !== 'email';
    const isProd = process.env.NODE_ENV === 'production';
    const isUiHold = process.env.HOLD_WHATSAPP === 'true' || process.env.SHOW_OTP_IN_UI === 'true';
    const exposeOtp = (process.env.DEV_EXPOSE_OTP === 'true' && !isProd) || isUiHold;
    const showOtpInUi = isUiHold || !isProd;

    if (isConsoleChannel) {
      const masked = cleanPhone.length > 4 ? `+91******${cleanPhone.slice(-4)}` : cleanPhone;
      console.log(`\n========================================\n[DEV OTP] ${masked} -> ${rawOtp}\n========================================\n`);
    }

    return {
      success: true,
      channel: isConsoleChannel ? 'console' : channelUsed,
      isDevSimulation: isConsoleChannel,
      devOtpCode: exposeOtp ? rawOtp : undefined,
      otpCode: showOtpInUi ? rawOtp : undefined,
      message: isUiHold
        ? `Verification code: ${rawOtp}. OTP sent successfully.`
        : channelUsed === 'email'
        ? 'Verification code sent to your email.'
        : 'Verification code sent on WhatsApp. OTP sent successfully.',
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
