import { HttpException, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ThrottlerGuard, getOptionsToken, getStorageToken, type ThrottlerModuleOptions, type ThrottlerStorage } from '@nestjs/throttler';

// Explicit tokens also bridge throttler's CommonJS metadata with Nest 12 ESM.
@Injectable()
export class AuthThrottlerGuard extends ThrottlerGuard {
  constructor(
    @Inject(getOptionsToken()) options: ThrottlerModuleOptions,
    @Inject(getStorageToken()) storage: ThrottlerStorage,
    @Inject(Reflector) reflector: Reflector,
  ) { super(options, storage, reflector); }

  protected override async throwThrottlingException(): Promise<void> {
    // Use the ESM HttpException recognized by this application's Nest runtime.
    throw new HttpException('Muitas tentativas. Tente novamente mais tarde.', 429);
  }
}
