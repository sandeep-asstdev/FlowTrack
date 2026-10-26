import { z } from 'zod';

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  fullName: z.string().min(2, 'Name must be at least 2 characters'),
  phone: z.string().optional(),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
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
export type RequestOtpDto = z.infer<typeof requestOtpSchema>;
export type VerifyOtpDto = z.infer<typeof verifyOtpSchema>;
export type GoogleAuthDto = z.infer<typeof googleAuthSchema>;
