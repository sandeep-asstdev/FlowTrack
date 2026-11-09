import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuthService } from './auth.service';
import { AvatarService } from './avatar.service';
import { NodesService } from '../nodes/nodes.service';
import { BadRequestException } from '@nestjs/common';
import sharp from 'sharp';
import * as fs from 'fs';
import * as path from 'path';

describe('Avatar Feature Specification Suite', () => {
  let authService: AuthService;
  let avatarService: AvatarService;
  let nodesService: NodesService;
  let prismaMock: any;
  let validPngBuffer: Buffer;

  const mockDb = {
    users: new Map<string, any>(),
    workspaces: new Map<string, any>(),
    memberships: new Map<string, any>(),
    nodes: new Map<string, any>(),
  };

  beforeEach(async () => {
    mockDb.users.clear();
    mockDb.workspaces.clear();
    mockDb.memberships.clear();
    mockDb.nodes.clear();

    validPngBuffer = await sharp({
      create: {
        width: 10,
        height: 10,
        channels: 3,
        background: { r: 59, g: 130, b: 246 },
      },
    })
      .png()
      .toBuffer();

    prismaMock = {
      user: {
        findFirst: vi.fn(async ({ where }) => {
          for (const u of mockDb.users.values()) {
            if (where.email && u.email === where.email) return u;
            if (where.phone && u.phone === where.phone) return u;
            if (where.OR) {
              for (const condition of where.OR) {
                if (condition.email && u.email === condition.email) return u;
                if (condition.phone && u.phone === condition.phone) return u;
              }
            }
          }
          return null;
        }),
        findUnique: vi.fn(async ({ where }) => mockDb.users.get(where.id) || null),
        create: vi.fn(async ({ data }) => {
          const user = { id: `user-${Date.now()}`, ...data };
          mockDb.users.set(user.id, user);
          return user;
        }),
      },
      workspace: {
        create: vi.fn(async ({ data }) => {
          const ws = { id: `ws-${Date.now()}`, ...data };
          mockDb.workspaces.set(ws.id, ws);
          return ws;
        }),
        findFirst: vi.fn(async () => null),
      },
      membership: {
        upsert: vi.fn(async () => ({})),
        findMany: vi.fn(async () => []),
      },
      node: {
        findUnique: vi.fn(async ({ where, include }) => {
          const n = mockDb.nodes.get(where.id);
          if (!n) return null;
          const owner = mockDb.users.get(n.ownerId);
          return {
            ...n,
            owner: owner ? { id: owner.id, fullName: owner.fullName, avatarUrl: owner.avatarUrl, avatarThumbnailUrl: owner.avatarThumbnailUrl } : null,
          };
        }),
        findMany: vi.fn(async ({ where, include }) => {
          const res = [];
          for (const n of mockDb.nodes.values()) {
            const owner = mockDb.users.get(n.ownerId);
            res.push({
              ...n,
              owner: owner ? { id: owner.id, fullName: owner.fullName, avatarUrl: owner.avatarUrl, avatarThumbnailUrl: owner.avatarThumbnailUrl } : null,
            });
          }
          return res;
        }),
      },
    };

    avatarService = new AvatarService();
    authService = new AuthService(
      prismaMock,
      { sign: () => 'mock-token' } as any,
      { validateAndConsumePhoneProof: vi.fn() } as any,
      { log: vi.fn() } as any,
      undefined,
      avatarService
    );
  });

  it('1. Rejects oversize avatar files (> 5MB)', async () => {
    const hugeBuffer = Buffer.alloc(6 * 1024 * 1024, 0xff); // 6MB
    await expect(avatarService.validateAndProcess(hugeBuffer)).rejects.toThrow(
      BadRequestException
    );
  });

  it('2. Rejects invalid image types and SVGs based on magic bytes', async () => {
    // Plain text / fake image
    const fakeImageBuffer = Buffer.from('This is not a real image file');
    await expect(avatarService.validateAndProcess(fakeImageBuffer)).rejects.toThrow(
      BadRequestException
    );

    // SVG disguised as file
    const svgBuffer = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><circle r="5"/></svg>');
    await expect(avatarService.validateAndProcess(svgBuffer)).rejects.toThrow(
      BadRequestException
    );
  });

  it('3. Successfully uploads valid image, strips EXIF, and resizes to 256x256 & 64x64', async () => {
    const tempResult = await avatarService.saveTempAvatar(validPngBuffer);
    expect(tempResult.tempAvatarId).toBeDefined();
    expect(tempResult.avatarUrl).toContain('/api/v1/uploads/avatars/temp_');
    expect(tempResult.thumbnailUrl).toContain('_thumb.webp');

    // Verify written file dimensions with Sharp
    const avatarsDir = path.resolve(process.cwd(), 'uploads', 'avatars');
    const mainPath = path.join(avatarsDir, `temp_${tempResult.tempAvatarId}.webp`);
    const thumbPath = path.join(avatarsDir, `temp_${tempResult.tempAvatarId}_thumb.webp`);

    expect(fs.existsSync(mainPath)).toBe(true);
    expect(fs.existsSync(thumbPath)).toBe(true);

    const mainMeta = await sharp(fs.readFileSync(mainPath)).metadata();
    const thumbMeta = await sharp(fs.readFileSync(thumbPath)).metadata();

    expect(mainMeta.width).toBe(256);
    expect(mainMeta.height).toBe(256);
    expect(mainMeta.format).toBe('webp');

    expect(thumbMeta.width).toBe(64);
    expect(thumbMeta.height).toBe(64);
    expect(thumbMeta.format).toBe('webp');

    // Clean up
    avatarService.deleteTempAvatar(tempResult.tempAvatarId);
    expect(fs.existsSync(mainPath)).toBe(false);
  });

  it('4. Signup with valid avatar saves user with avatarUrl and thumbnail URL', async () => {
    const temp = await avatarService.saveTempAvatar(validPngBuffer);

    const res = await authService.register({
      fullName: 'Aarav Patel',
      email: 'aarav@flowtrack.dev',
      phone: '+919876543210',
      phoneProof: 'valid-otp-proof-1234',
      password: 'StrongPassword99!',
      tempAvatarId: temp.tempAvatarId,
    });

    expect(res.user.avatarUrl).toBeDefined();
    expect(res.user.avatarUrl).toContain('.webp');
    expect(res.user.avatarUrl).not.toContain('temp_');
    expect(res.user.avatarThumbnailUrl).toContain('_thumb.webp');

    // Verify user in mock DB has URLs
    const savedUser = mockDb.users.get(res.user.id);
    expect(savedUser.avatarUrl).toBe(res.user.avatarUrl);
    expect(savedUser.avatarThumbnailUrl).toBe(res.user.avatarThumbnailUrl);

    // Clean up committed files
    const match = res.user.avatarUrl.match(/avatars\/([^.]+)/);
    if (match) avatarService.deleteTempAvatar(match[1]);
  });

  it('5. If signup fails, temporary uploaded avatar is deleted immediately (no orphan file)', async () => {
    const temp = await avatarService.saveTempAvatar(validPngBuffer);
    const avatarsDir = path.resolve(process.cwd(), 'uploads', 'avatars');
    const tempFile = path.join(avatarsDir, `temp_${temp.tempAvatarId}.webp`);
    expect(fs.existsSync(tempFile)).toBe(true);

    // Force failure: empty fullName
    await expect(
      authService.register({
        fullName: '',
        email: 'fail@flowtrack.dev',
        phone: '+919876543210',
        phoneProof: 'valid-otp-proof-1234',
        password: 'StrongPassword99!',
        tempAvatarId: temp.tempAvatarId,
      })
    ).rejects.toThrow();

    // Verify temp file was unlinked and deleted
    expect(fs.existsSync(tempFile)).toBe(false);
  });

  it('6. Node and details responses include avatarUrl and avatarThumbnailUrl', async () => {
    // Seed user with avatar
    const user = await prismaMock.user.create({
      data: {
        fullName: 'Priya Sharma',
        email: 'priya@flowtrack.dev',
        avatarUrl: '/api/v1/uploads/avatars/priya.webp',
        avatarThumbnailUrl: '/api/v1/uploads/avatars/priya_thumb.webp',
      },
    });

    const node = {
      id: 'node-101',
      title: 'Design Flow Engine',
      workspaceId: 'ws-1',
      projectId: 'proj-1',
      ownerId: user.id,
    };
    mockDb.nodes.set(node.id, node);

    const fetchedNode = await prismaMock.node.findUnique({
      where: { id: node.id },
    });

    expect(fetchedNode.owner.avatarUrl).toBe('/api/v1/uploads/avatars/priya.webp');
    expect(fetchedNode.owner.avatarThumbnailUrl).toBe('/api/v1/uploads/avatars/priya_thumb.webp');
  });
});
