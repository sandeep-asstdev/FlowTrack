export interface SendOtpResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export interface SmsProvider {
  sendOtp(phone: string, otp: string, purpose?: string): Promise<SendOtpResult>;
}
