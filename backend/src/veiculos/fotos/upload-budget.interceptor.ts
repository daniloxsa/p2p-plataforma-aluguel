import { ConflictException, Injectable, type CallHandler, type ExecutionContext, type NestInterceptor } from '@nestjs/common';
import { defer, finalize } from 'rxjs';

// Applied BEFORE the memory multipart parser, so a burst cannot allocate unbounded
// 50 MB request buffers. Database reservations still protect limits across replicas.
@Injectable()
export class UploadBudgetInterceptor implements NestInterceptor {
  private active = 0;
  intercept(_context: ExecutionContext, next: CallHandler) {
    if (this.active >= 2) throw new ConflictException('Há uploads em andamento. Aguarde e tente novamente.');
    this.active++;
    return defer(() => next.handle()).pipe(finalize(() => { this.active--; }));
  }
}
