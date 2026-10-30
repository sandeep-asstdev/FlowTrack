import { z } from 'zod';

export const INDIAN_PHONE_REGEX = /^\+91[6-9]\d{9}$/;

export const registerSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  fullName: z.string().min(2, 'Name must be at least 2 characters'),
  phone: z
    .string()
    .regex(INDIAN_PHONE_REGEX, 'Must be a valid Indian mobile number with +91 prefix and 10 digits starting with 6, 7, 8, or 9'),
  phoneProof: z.string().min(8, 'Phone verification proof is required. Please verify your mobile number via OTP.').optional(),
  workspaceName: z.string().min(2).optional(),
  // Mass-assignment protection: requestedRole/role are optional in schema so clients passing them don't throw schema validation error, but backend ignores them completely!
  requestedRole: z.string().optional(),
  role: z.string().optional(),
});

export const loginSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
});

export const resetPasswordSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  token: z.string().min(8, 'Reset token is required'),
  newPassword: z.string().min(8, 'Password must be at least 8 characters'),
});

export const requestOtpSchema = z.object({
  phone: z
    .string()
    .regex(INDIAN_PHONE_REGEX, 'Must be a valid Indian mobile number with +91 prefix and 10 digits starting with 6, 7, 8, or 9'),
  purpose: z.enum(['SIGNUP', 'LOGIN', 'PHONE_VERIFICATION']).optional().default('SIGNUP'),
});

export const verifyOtpSchema = z.object({
  phone: z
    .string()
    .regex(INDIAN_PHONE_REGEX, 'Must be a valid Indian mobile number with +91 prefix and 10 digits starting with 6, 7, 8, or 9'),
  otp: z.string().length(6, 'OTP must be exactly 6 digits'),
  purpose: z.enum(['SIGNUP', 'LOGIN', 'PHONE_VERIFICATION']).optional().default('SIGNUP'),
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

export const completeGoogleRegistrationSchema = z.object({
  signupToken: z.string().min(10, 'Signup token is required'),
  fullName: z.string().min(2, 'Full name must be at least 2 characters'),
  phone: z
    .string()
    .regex(INDIAN_PHONE_REGEX, 'Must be a valid Indian mobile number with +91 prefix and 10 digits starting with 6, 7, 8, or 9'),
  phoneProof: z.string().min(8, 'Phone verification proof is required'),
  password: z.string().min(8, 'Password must be at least 8 characters').optional(),
});

export const assignRoleSchema = z.object({
  role: z.enum(['ADMIN', 'MANAGER', 'TEAM_LEAD', 'MEMBER']),
  reason: z.string().min(3, 'A clear business reason for role assignment is required'),
});

export type RegisterDto = z.infer<typeof registerSchema>;
export type LoginDto = z.infer<typeof loginSchema>;
export type ForgotPasswordDto = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordDto = z.infer<typeof resetPasswordSchema>;
export type RequestOtpDto = z.infer<typeof requestOtpSchema>;
export type VerifyOtpDto = z.infer<typeof verifyOtpSchema>;
export type GoogleAuthDto = z.infer<typeof googleAuthSchema>;
export type CompleteGoogleRegistrationDto = z.infer<typeof completeGoogleRegistrationSchema>;
export type AssignRoleDto = z.infer<typeof assignRoleSchema>;
