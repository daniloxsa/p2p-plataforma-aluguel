import { type CanActivate, type ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { PAPEL, type AuthenticatedUser } from '../papeis.ts';

// Always register AFTER JwtAuthGuard. Never reads body, query, headers or JWT claims.
@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const user = context.switchToHttp().getRequest<{ user?: AuthenticatedUser }>().user;
    if (!user) throw new UnauthorizedException('Sessão autenticada obrigatória.');
    if (user.papel !== PAPEL.ADMIN) throw new ForbiddenException('Acesso administrativo obrigatório.');
    return true;
  }
}
