import { Injectable, UnauthorizedException, BadRequestException, Logger } from '@nestjs/common';
import { OAuth2Client, TokenPayload } from 'google-auth-library';

export interface GoogleUserPayload {
  sub: string;
  email: string;
  emailVerified: boolean;
  name?: string;
  picture?: string;
}

@Injectable()
export class GoogleAuthService {
  private readonly logger = new Logger(GoogleAuthService.name);
  private oauthClient: OAuth2Client;
  private readonly configuredClientId: string | undefined;

  constructor() {
    this.configuredClientId =
      process.env.GOOGLE_CLIENT_ID ||
      '954853707879-khbiv8su3of67ih08vfflpj2vanqbj2j.apps.googleusercontent.com';
    this.oauthClient = new OAuth2Client(this.configuredClientId);
  }

  /**
   * Allows injecting a custom client (useful for unit testing without live network calls)
   */
  setOAuthClient(client: OAuth2Client) {
    this.oauthClient = client;
  }

  /**
   * Verifies Google ID token cryptographic signature, issuer, audience, expiry, and email status.
   *
   * @param idToken Raw JWT ID token received from Google Identity Services
   * @returns Verified Google user profile payload
   */
  async verifyIdToken(idToken: string): Promise<GoogleUserPayload> {
    if (!idToken || typeof idToken !== 'string') {
      throw new BadRequestException('Google ID token is required');
    }

    const clientId = process.env.GOOGLE_CLIENT_ID || this.configuredClientId;

    // In development/test mode only: allow mock token simulation for local testing
    // when live Google Cloud credentials are not yet configured.
    // Strictly forbidden in production environments.
    if (process.env.NODE_ENV !== 'production' && idToken.startsWith('dev-mock-google-token:')) {
      const parts = idToken.split(':');
      const email = (parts[1] || 'alex.rivera@flowtrack.dev').toLowerCase().trim();
      const name = parts[2] || email.split('@')[0];
      return {
        sub: `google-mock-sub-${Buffer.from(email).toString('hex').slice(0, 16)}`,
        email,
        emailVerified: true,
        name,
        picture: 'https://lh3.googleusercontent.com/a/default-user',
      };
    }

    let payload: TokenPayload | undefined;

    try {
      const ticket = await this.oauthClient.verifyIdToken({
        idToken,
        audience: clientId || undefined,
      });

      payload = ticket.getPayload();
    } catch (err: any) {
      this.logger.warn(`Google ID token verification failed: ${err.message}`);
      throw new UnauthorizedException(`Invalid or unverified Google token: ${err.message || 'Signature verification failed'}`);
    }

    if (!payload) {
      throw new UnauthorizedException('Google ID token verification produced empty payload');
    }

    // 1. Issuer verification (must be accounts.google.com or https://accounts.google.com)
    const validIssuers = ['accounts.google.com', 'https://accounts.google.com'];
    if (!payload.iss || !validIssuers.includes(payload.iss)) {
      this.logger.warn(`Invalid Google token issuer: ${payload.iss}`);
      throw new UnauthorizedException('Invalid Google token issuer');
    }

    // 2. Audience verification (if configured in environment)
    if (clientId && payload.aud !== clientId) {
      this.logger.warn(`Mismatched Google token audience. Expected: ${clientId}, Received: ${payload.aud}`);
      throw new UnauthorizedException('Google token audience does not match configured client ID');
    }

    // 3. Expiration verification
    const nowInSeconds = Math.floor(Date.now() / 1000);
    if (!payload.exp || payload.exp < nowInSeconds) {
      this.logger.warn(`Google token expired at ${payload.exp}, current: ${nowInSeconds}`);
      throw new UnauthorizedException('Google token has expired');
    }

    // 4. Email existence & Verified email verification
    if (!payload.email) {
      throw new BadRequestException('Google token does not contain an email address');
    }

    if (!payload.email_verified) {
      this.logger.warn(`Google account email ${payload.email} is not verified`);
      throw new UnauthorizedException('Google account email is not verified');
    }

    // 5. Subject identifier verification
    if (!payload.sub) {
      throw new UnauthorizedException('Google token does not contain a subject identifier (sub)');
    }

    return {
      sub: payload.sub,
      email: payload.email.toLowerCase().trim(),
      emailVerified: Boolean(payload.email_verified),
      name: payload.name || payload.given_name || payload.email.split('@')[0],
      picture: payload.picture,
    };
  }
}
