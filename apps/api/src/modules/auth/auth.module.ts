import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './jwt.strategy';
import { GoogleAuthService } from './google-auth.service';
import { AuthorizationService } from './authorization.service';
import { AutoBootstrapService } from './auto-bootstrap.service';
import { OtpService } from './otp/otp.service';
import { AvatarService } from './avatar.service';
import { AuditModule } from '../audit/audit.module';

export function getRequiredJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('FATAL: JWT_SECRET environment variable must be set and at least 32 characters long.');
  }
  return secret;
}

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      useFactory: () => ({
        secret: getRequiredJwtSecret(),
        signOptions: { expiresIn: '7d' },
      }),
    }),
    AuditModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, GoogleAuthService, AuthorizationService, AutoBootstrapService, OtpService, AvatarService],
  exports: [AuthService, GoogleAuthService, AuthorizationService, AutoBootstrapService, OtpService, AvatarService, JwtModule, PassportModule],
})
export class AuthModule {}
