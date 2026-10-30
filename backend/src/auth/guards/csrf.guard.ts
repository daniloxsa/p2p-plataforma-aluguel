import { type CanActivate, type ExecutionContext, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { AuthConfig } from '../auth.config.ts';

@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(@Inject(AuthConfig) private readonly config: AuthConfig) {}
  canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest();
    // Custom header forces CORS preflight; browsers cannot submit it via an HTML form.
    if (req.headers['x-univia-csrf'] !== '1' || (req.headers.origin && !this.config.origins.includes(req.headers.origin))) {
      throw new ForbiddenException('Origem ou cabecalho CSRF invalido.');
    }
    return true;
  }
}
