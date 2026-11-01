import { forwardRef, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from '../prisma/prisma.module.ts';
import { UsuariosModule } from '../usuarios/usuarios.module.ts';
import { AuthController } from './auth.controller.ts';
import { AuthService } from './auth.service.ts';
import { AuthConfig } from './auth.config.ts';
import { JwtAuthGuard } from './guards/jwt-auth.guard.ts';
import { CsrfGuard } from './guards/csrf.guard.ts';
import { AuthThrottlerGuard } from './guards/auth-throttler.guard.ts';
import { AdminGuard } from './guards/admin.guard.ts';

@Module({
  imports: [PrismaModule, forwardRef(() => UsuariosModule), JwtModule.register({}), ThrottlerModule.forRoot([{ ttl: 60000, limit: 30 }])],
  controllers: [AuthController], providers: [AuthConfig, AuthService, JwtAuthGuard, AdminGuard, CsrfGuard, AuthThrottlerGuard], exports: [JwtAuthGuard, AdminGuard, AuthService, AuthThrottlerGuard, ThrottlerModule],
})
export class AuthModule {}
