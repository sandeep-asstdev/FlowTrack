import { z } from 'zod';

export const registerSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  fullName: z.string().min(2, 'Name must be at least 2 characters'),
  phone: z
    .string()
    .regex(/^\+91[6-9]\d{9}$/, 'Must be a valid Indian mobile number with +91 prefix and 10 digits')
    .optional(),
  requestedRole: z.enum(['MANAGER', 'TEAM_LEAD', 'MEMBER']).optional(),
  workspaceName: z.string().min(2).optional(),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
});

export const resetPasswordSchema = z.object({
  email: z.string().email(),
  token: z.string().min(8, 'Reset token is required'),
  newPassword: z.string().min(8, 'Password must be at least 8 characters'),
});

export const requestOtpSchema = z.object({
  phone: z.string().min(10, 'Valid phone number required'),
});

export const verifyOtpSchema = z.object({
  phone: z.string().min(10),
  otp: z.string().length(6, 'OTP must be 6 digits'),
});

export const googleAuthSchema = z
  .object({
    idToken: z.string().optional(),
    credential: z.string().optional(),
  })
  .refine((data) => Boolean(data.idToken || data.credential), {
    message: 'Google ID token or credential is required',
    path: ['idToken'],
  });

export type RegisterDto = z.infer<typeof registerSchema>;
export type LoginDto = z.infer<typeof loginSchema>;
export type ForgotPasswordDto = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordDto = z.infer<typeof resetPasswordSchema>;
export type RequestOtpDto = z.infer<typeof requestOtpSchema>;
export type VerifyOtpDto = z.infer<typeof verifyOtpSchema>;
export type GoogleAuthDto = z.infer<typeof googleAuthSchema>;
