import { Injectable, BadRequestException, HttpException, HttpStatus, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const sharpModule = require('sharp');
const sharp: any = typeof sharpModule === 'function' ? sharpModule : sharpModule?.default;

export interface ProcessedAvatar {
  avatarBuffer: Buffer;
  thumbBuffer: Buffer;
  format: 'webp';
}

@Injectable()
export class AvatarService {
  private readonly logger = new Logger(AvatarService.name);
  private readonly avatarsDir: string;
  private readonly ipHourlyUploads = new Map<string, number[]>();
  private static readonly MAX_HOURLY_PER_IP = 30;

  constructor() {
    this.avatarsDir = path.resolve(process.cwd(), 'uploads', 'avatars');
    if (!fs.existsSync(this.avatarsDir)) {
      try {
        fs.mkdirSync(this.avatarsDir, { recursive: true });
      } catch (err: any) {
        this.logger.warn(`Could not create uploads/avatars directory: ${err.message}`);
      }
    }
  }

  /**
   * Sliding window IP-based rate limiting
   */
  checkRateLimit(ipAddress?: string) {
    if (!ipAddress) return;
    const now = Date.now();
    const history = (this.ipHourlyUploads.get(ipAddress) || []).filter(
      (ts) => now - ts < 60 * 60 * 1000
    );
    if (history.length >= AvatarService.MAX_HOURLY_PER_IP) {
      throw new HttpException(
        'Too many avatar uploads from this IP address. Please try again later.',
        HttpStatus.TOO_MANY_REQUESTS
      );
    }
    history.push(now);
    this.ipHourlyUploads.set(ipAddress, history);
  }

  /**
   * Verify real file type using magic bytes.
   * Allowed: JPG, PNG, WEBP.
   * Explicitly reject: SVG, PDF, Executables, etc.
   */
  detectRealMimeType(buffer: Buffer): 'image/jpeg' | 'image/png' | 'image/webp' {
    if (!buffer || buffer.length < 12) {
      throw new BadRequestException('Invalid or empty image file.');
    }

    // Explicitly check for SVG contents to prevent SVG stored as images
    const fileHeaderStr = buffer.slice(0, Math.min(buffer.length, 512)).toString('utf8').toLowerCase();
    if (fileHeaderStr.includes('<svg') || fileHeaderStr.includes('<?xml') || fileHeaderStr.includes('xmlns')) {
      throw new BadRequestException('SVG files are strictly prohibited. Please upload JPG, PNG, or WEBP.');
    }

    // JPEG: FF D8 FF
    if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
      return 'image/jpeg';
    }

    // PNG: 89 50 4E 47 0D 0A 1A 0A
    if (
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47 &&
      buffer[4] === 0x0d &&
      buffer[5] === 0x0a &&
      buffer[6] === 0x1a &&
      buffer[7] === 0x0a
    ) {
      return 'image/png';
    }

    // WEBP: 'RIFF' .... 'WEBP'
    if (
      buffer[0] === 0x52 && // R
      buffer[1] === 0x49 && // I
      buffer[2] === 0x46 && // F
      buffer[3] === 0x46 && // F
      buffer[8] === 0x57 && // W
      buffer[9] === 0x45 && // E
      buffer[10] === 0x42 && // B
      buffer[11] === 0x50 // P
    ) {
      return 'image/webp';
    }

    throw new BadRequestException('Invalid image format. Only real JPG, PNG, and WEBP files are allowed.');
  }

  /**
   * Validates size, magic bytes, and resizes image to 256x256 (main) and 64x64 (thumbnail)
   * while stripping EXIF data.
   */
  async validateAndProcess(buffer: Buffer, ipAddress?: string): Promise<ProcessedAvatar> {
    this.checkRateLimit(ipAddress);

    // Max 5 MB
    const MAX_SIZE = 5 * 1024 * 1024;
    if (buffer.length > MAX_SIZE) {
      throw new BadRequestException('Avatar image exceeds maximum allowed size of 5MB.');
    }

    // Verify magic bytes
    this.detectRealMimeType(buffer);

    try {
      // Process 256x256 square (strips EXIF, auto-orients)
      const avatarBuffer = await sharp(buffer)
        .rotate()
        .resize(256, 256, { fit: 'cover', position: 'center' })
        .webp({ quality: 85 })
        .toBuffer();

      // Process 64x64 square thumbnail (strips EXIF, auto-orients)
      const thumbBuffer = await sharp(buffer)
        .rotate()
        .resize(64, 64, { fit: 'cover', position: 'center' })
        .webp({ quality: 80 })
        .toBuffer();

      return {
        avatarBuffer,
        thumbBuffer,
        format: 'webp',
      };
    } catch (err: any) {
      this.logger.error(`Failed to process avatar image with Sharp: ${err.message}`);
      throw new BadRequestException('Failed to process image file. Ensure it is a valid, uncorrupted image.');
    }
  }

  /**
   * Save as temporary avatar file before signup completion.
   */
  async saveTempAvatar(buffer: Buffer, ipAddress?: string): Promise<{ tempAvatarId: string; avatarUrl: string; thumbnailUrl: string }> {
    const processed = await this.validateAndProcess(buffer, ipAddress);
    const tempAvatarId = crypto.randomUUID();

    const mainFileName = `temp_${tempAvatarId}.webp`;
    const thumbFileName = `temp_${tempAvatarId}_thumb.webp`;

    fs.writeFileSync(path.join(this.avatarsDir, mainFileName), processed.avatarBuffer);
    fs.writeFileSync(path.join(this.avatarsDir, thumbFileName), processed.thumbBuffer);

    return {
      tempAvatarId,
      avatarUrl: `/api/v1/uploads/avatars/${mainFileName}`,
      thumbnailUrl: `/api/v1/uploads/avatars/${thumbFileName}`,
    };
  }

  /**
   * Commit temporary avatar into permanent storage upon successful user creation.
   */
  commitTempAvatar(tempAvatarId: string): { avatarUrl: string; thumbnailUrl: string } {
    if (!tempAvatarId || !/^[0-9a-fA-F-]+$/.test(tempAvatarId)) {
      throw new BadRequestException('Invalid tempAvatarId format');
    }

    const tempMain = path.join(this.avatarsDir, `temp_${tempAvatarId}.webp`);
    const tempThumb = path.join(this.avatarsDir, `temp_${tempAvatarId}_thumb.webp`);

    const permId = crypto.randomUUID();
    const permMainName = `${permId}.webp`;
    const permThumbName = `${permId}_thumb.webp`;

    const permMain = path.join(this.avatarsDir, permMainName);
    const permThumb = path.join(this.avatarsDir, permThumbName);

    if (fs.existsSync(tempMain)) {
      try {
        fs.renameSync(tempMain, permMain);
      } catch (e) {
        fs.copyFileSync(tempMain, permMain);
        fs.unlinkSync(tempMain);
      }
    }

    if (fs.existsSync(tempThumb)) {
      try {
        fs.renameSync(tempThumb, permThumb);
      } catch (e) {
        fs.copyFileSync(tempThumb, permThumb);
        fs.unlinkSync(tempThumb);
      }
    }

    return {
      avatarUrl: `/api/v1/uploads/avatars/${permMainName}`,
      thumbnailUrl: `/api/v1/uploads/avatars/${permThumbName}`,
    };
  }

  /**
   * Delete temporary avatar files if signup or validation fails.
   */
  deleteTempAvatar(tempAvatarId: string) {
    if (!tempAvatarId || !/^[0-9a-fA-F-]+$/.test(tempAvatarId)) return;

    const tempMain = path.join(this.avatarsDir, `temp_${tempAvatarId}.webp`);
    const tempThumb = path.join(this.avatarsDir, `temp_${tempAvatarId}_thumb.webp`);

    if (fs.existsSync(tempMain)) {
      try {
        fs.unlinkSync(tempMain);
      } catch {}
    }

    if (fs.existsSync(tempThumb)) {
      try {
        fs.unlinkSync(tempThumb);
      } catch {}
    }
  }

  /**
   * Save processed avatar directly into permanent files.
   */
  async savePermanentAvatar(buffer: Buffer, ipAddress?: string): Promise<{ avatarUrl: string; thumbnailUrl: string; cleanup: () => void }> {
    const processed = await this.validateAndProcess(buffer, ipAddress);
    const permId = crypto.randomUUID();
    const mainFileName = `${permId}.webp`;
    const thumbFileName = `${permId}_thumb.webp`;

    const mainPath = path.join(this.avatarsDir, mainFileName);
    const thumbPath = path.join(this.avatarsDir, thumbFileName);

    fs.writeFileSync(mainPath, processed.avatarBuffer);
    fs.writeFileSync(thumbPath, processed.thumbBuffer);

    return {
      avatarUrl: `/api/v1/uploads/avatars/${mainFileName}`,
      thumbnailUrl: `/api/v1/uploads/avatars/${thumbFileName}`,
      cleanup: () => {
        try {
          if (fs.existsSync(mainPath)) fs.unlinkSync(mainPath);
          if (fs.existsSync(thumbPath)) fs.unlinkSync(thumbPath);
        } catch {}
      },
    };
  }
}
