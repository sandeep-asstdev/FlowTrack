import { Controller, Post, Body, Get, UseGuards, Req, Ip, UploadedFile, UseInterceptors, Param, Delete, BadRequestException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthService } from './auth.service';
import { AvatarService } from './avatar.service';
import {
  RegisterDto,
  LoginDto,
  RequestOtpDto,
  VerifyOtpDto,
  GoogleAuthDto,
  CompleteGoogleRegistrationDto,
  ForgotPasswordDto,
  ResetPasswordDto,
} from '@flowtrack/shared';
import { AuthGuard } from '@nestjs/passport';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly avatarService: AvatarService
  ) {}

  @Post('avatar/upload')
  @UseInterceptors(FileInterceptor('file'))
  async uploadAvatar(
    @UploadedFile() file: any,
    @Body() body: any,
    @Ip() ip: string
  ) {
    let buffer: Buffer | null = null;
    if (file && file.buffer) {
      buffer = file.buffer;
    } else if (body?.image || body?.avatarBase64 || body?.file) {
      const raw = body.image || body.avatarBase64 || body.file;
      const base64Str = typeof raw === 'string' && raw.includes(',') ? raw.split(',')[1] : raw;
      buffer = Buffer.from(base64Str, 'base64');
    }

    if (!buffer || buffer.length === 0) {
      throw new BadRequestException('No image file or image data provided.');
    }

    return this.avatarService.saveTempAvatar(buffer, ip);
  }

  @Delete('avatar/temp/:id')
  deleteTempAvatar(@Param('id') id: string) {
    this.avatarService.deleteTempAvatar(id);
    return { success: true };
  }

  @Post('register')
  register(@Body() dto: RegisterDto, @Ip() ip: string) {
    return this.authService.register(dto, ip);
  }

  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post('forgot-password')
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }

  @Post('reset-password')
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }

  @Post('google')
  googleAuth(@Body() dto: GoogleAuthDto) {
    return this.authService.loginWithGoogle(dto);
  }

  @Post('google/complete')
  completeGoogleRegistration(@Body() dto: CompleteGoogleRegistrationDto) {
    return this.authService.completeGoogleRegistration(dto);
  }

  @UseGuards(AuthGuard('jwt'))
  @Post('google/link')
  linkGoogle(@Req() req: any, @Body() dto: GoogleAuthDto) {
    return this.authService.linkGoogleAccount(req.user.id, dto);
  }

  @Post('otp/request')
  requestOtp(@Body() dto: RequestOtpDto, @Ip() ip: string) {
    return this.authService.requestOtp(dto, ip);
  }

  @Post('otp/verify')
  verifyOtp(@Body() dto: VerifyOtpDto) {
    return this.authService.verifyOtp(dto);
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('me')
  getMe(@Req() req: any) {
    return this.authService.getMe(req.user.id);
  }
}
