import { Injectable } from '@nestjs/common';

@Injectable()
export class AuthConfig {
  readonly secret: string;
  readonly accessSeconds = 900;
  readonly refreshMs = 7 * 24 * 60 * 60 * 1000;
  readonly origins: string[];
  readonly secure: boolean;
  readonly sameSite: 'none' | 'lax';

  constructor() {
    const secret = process.env.JWT_ACCESS_SECRET ?? '';
    if (Buffer.byteLength(secret) < 32 || /SUBSTITUIR|CHANGE_ME/i.test(secret)) {
      throw new Error('JWT_ACCESS_SECRET deve conter um segredo aleatorio de pelo menos 32 bytes.');
    }
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL obrigatoria.');
    if (process.env.JWT_ACCESS_EXPIRES_IN && process.env.JWT_ACCESS_EXPIRES_IN !== '15m') {
      throw new Error('JWT_ACCESS_EXPIRES_IN deve ser 15m.');
    }
    if (process.env.REFRESH_TOKEN_EXPIRES_DAYS && process.env.REFRESH_TOKEN_EXPIRES_DAYS !== '7') {
      throw new Error('REFRESH_TOKEN_EXPIRES_DAYS deve ser 7.');
    }
    this.origins = (process.env.CORS_ORIGINS ?? '').split(',').map(s => s.trim()).filter(Boolean);
    if (!this.origins.length || this.origins.some(origin => {
      try { const url = new URL(origin); return !['http:', 'https:'].includes(url.protocol) || url.origin !== origin; }
      catch { return true; }
    })) throw new Error('CORS_ORIGINS deve conter origens HTTP(S) explicitas.');
    this.secret = secret;
    const sameSite = process.env.COOKIE_SAME_SITE ?? (process.env.NODE_ENV === 'production' ? 'none' : 'lax');
    if (!['lax', 'none'].includes(sameSite)) throw new Error('COOKIE_SAME_SITE deve ser lax ou none.');
    this.sameSite = sameSite as 'none' | 'lax';
    this.secure = process.env.NODE_ENV === 'production' || this.sameSite === 'none';
  }
}
