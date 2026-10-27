import { Controller, Post, Body, Get, UseGuards, Req } from '@nestjs/common';
import { AuthService } from './auth.service';
import {
  RegisterDto,
  LoginDto,
  RequestOtpDto,
  VerifyOtpDto,
  GoogleAuthDto,
  ForgotPasswordDto,
  ResetPasswordDto,
} from '@flowtrack/shared';
import { AuthGuard } from '@nestjs/passport';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
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

  @UseGuards(AuthGuard('jwt'))
  @Post('google/link')
  linkGoogle(@Req() req: any, @Body() dto: GoogleAuthDto) {
    return this.authService.linkGoogleAccount(req.user.id, dto);
  }

  @Post('otp/request')
  requestOtp(@Body() dto: RequestOtpDto) {
    return this.authService.requestOtp(dto);
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
