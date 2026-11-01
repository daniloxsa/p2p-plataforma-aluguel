import { Module } from '@nestjs/common';
import { StorageService } from './storage.service.ts';
import { PhotoConfig } from './photo.config.ts';
@Module({ providers: [StorageService, PhotoConfig], exports: [StorageService, PhotoConfig] })
export class StorageModule {}
