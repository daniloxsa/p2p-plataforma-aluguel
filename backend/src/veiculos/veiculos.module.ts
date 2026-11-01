import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.ts';
import { PrismaModule } from '../prisma/prisma.module.ts';
import { VeiculosController } from './veiculos.controller.ts';
import { VeiculosService } from './veiculos.service.ts';
import { FotosController } from './fotos/fotos.controller.ts';
import { FotosService } from './fotos/fotos.service.ts';
import { UploadBudgetInterceptor } from './fotos/upload-budget.interceptor.ts';
import { StorageModule } from './fotos/storage.module.ts';
import { DocumentosController } from './documentos/documentos.controller.ts';
import { DocumentosService } from './documentos/documentos.service.ts';
import { DocumentConfig } from './documentos/document.config.ts';
@Module({ imports: [AuthModule, PrismaModule, StorageModule], controllers: [VeiculosController, FotosController, DocumentosController], providers: [VeiculosService, FotosService, UploadBudgetInterceptor, DocumentosService, DocumentConfig] })
export class VeiculosModule {}
