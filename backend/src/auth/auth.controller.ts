import { Body, Controller, Get, HttpCode, Inject, Post, Req, Res, UseGuards, ValidationPipe } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthThrottlerGuard } from './guards/auth-throttler.guard.ts';
import type { Request, Response, CookieOptions } from 'express';
import { AuthService } from './auth.service.ts';
import { AuthConfig } from './auth.config.ts';
import { RegisterDto } from './dto/register.dto.ts';
import { LoginDto } from './dto/login.dto.ts';
import { JwtAuthGuard } from './guards/jwt-auth.guard.ts';
import { CsrfGuard } from './guards/csrf.guard.ts';
import { CurrentUser } from './decorators/current-user.decorator.ts';
import type { PublicUser } from '../usuarios/usuarios.service.ts';
import { publicUser } from '../usuarios/usuarios.service.ts';

export const validationOptions = { transform: true, whitelist: true, forbidNonWhitelisted: true, forbidUnknownValues: true };
const cookieName = 'univia_refresh';

@Controller('auth')
export class AuthController {
  constructor(@Inject(AuthService) private readonly auth: AuthService, @Inject(AuthConfig) private readonly config: AuthConfig) {}
  private cookieOptions(): CookieOptions {
    return { httpOnly: true, secure: this.config.secure, sameSite: this.config.sameSite, path: '/api/auth' };
  }
  private establish(res: Response, result: Awaited<ReturnType<AuthService['login']>>) {
    const { refreshToken, ...body } = result;
    res.cookie(cookieName, refreshToken, { ...this.cookieOptions(), maxAge: this.config.refreshMs });
    return body;
  }
  private readToken(req: Request): string | undefined {
    const token: unknown = req.cookies?.[cookieName];
    return typeof token === 'string' && /^[A-Za-z0-9_-]{43}$/.test(token) ? token : undefined;
  }

  @Post('register') @UseGuards(CsrfGuard, AuthThrottlerGuard) @Throttle({ default: { limit: 10, ttl: 60000 } })
  register(@Body(new ValidationPipe({ ...validationOptions, expectedType: RegisterDto })) dto: RegisterDto) { return this.auth.register(dto); }

  @Post('login') @HttpCode(200) @UseGuards(CsrfGuard, AuthThrottlerGuard) @Throttle({ default: { limit: 10, ttl: 60000 } })
  async login(@Body(new ValidationPipe({ ...validationOptions, expectedType: LoginDto })) dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    return this.establish(res, await this.auth.login(dto));
  }

  @Post('refresh') @HttpCode(200) @UseGuards(CsrfGuard, AuthThrottlerGuard)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.establish(res, await this.auth.refresh(this.readToken(req) ?? ''));
  }

  @Post('logout') @HttpCode(204) @UseGuards(CsrfGuard)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(this.readToken(req));
    res.clearCookie(cookieName, this.cookieOptions());
  }

  @Get('me') @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: PublicUser) { return publicUser(user); }
}
