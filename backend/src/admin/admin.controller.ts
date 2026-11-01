import { Controller, Get, Header, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator.ts';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.ts';
import { AdminGuard } from '../auth/guards/admin.guard.ts';
import type { AuthenticatedUser } from '../auth/papeis.ts';

@Controller('admin')
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminController {
  @Get('me') @Header('Cache-Control', 'no-store')
  me(@CurrentUser() user: AuthenticatedUser) {
    return { id: user.id, nome: user.nome, papel: user.papel };
  }
}
