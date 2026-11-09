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

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'flowtrack-super-secret-jwt-key-2026-very-secure',
      signOptions: { expiresIn: '7d' },
    }),
    AuditModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, GoogleAuthService, AuthorizationService, AutoBootstrapService, OtpService, AvatarService],
  exports: [AuthService, GoogleAuthService, AuthorizationService, AutoBootstrapService, OtpService, AvatarService, JwtModule, PassportModule],
})
export class AuthModule {}
