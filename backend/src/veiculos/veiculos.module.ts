import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.ts';
import { PrismaModule } from '../prisma/prisma.module.ts';
import { VeiculosController } from './veiculos.controller.ts';
import { VeiculosService } from './veiculos.service.ts';
import { FotosController } from './fotos/fotos.controller.ts';
import { FotosService } from './fotos/fotos.service.ts';
import { StorageService } from './fotos/storage.service.ts';
import { PhotoConfig } from './fotos/photo.config.ts';
import { UploadBudgetInterceptor } from './fotos/upload-budget.interceptor.ts';
@Module({ imports: [AuthModule, PrismaModule], controllers: [VeiculosController, FotosController], providers: [VeiculosService, FotosService, StorageService, PhotoConfig, UploadBudgetInterceptor] })
export class VeiculosModule {}
