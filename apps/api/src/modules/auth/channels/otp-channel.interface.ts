export type OtpDeliveryErrorCode =
  | 'INVALID_NUMBER'
  | 'NOT_ON_WHATSAPP'
  | 'TEMPLATE_NOT_APPROVED'
  | 'AUTH_FAILED'
  | 'RATE_LIMITED'
  | 'PROVIDER_OUTAGE'
  | 'UNKNOWN';

export interface SendOtpResult {
  success: boolean;
  messageId?: string;
  error?: string;
  errorCode?: OtpDeliveryErrorCode;
  canFallbackToEmail?: boolean;
}

export interface OtpChannel {
  readonly name: string;
  send(recipient: string, code: string, purpose?: string): Promise<SendOtpResult>;
}
