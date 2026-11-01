import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.ts';
import { StorageModule } from '../veiculos/fotos/storage.module.ts';
import { CatalogoController } from './catalogo.controller.ts';
import { CatalogoService } from './catalogo.service.ts';

@Module({ imports: [PrismaModule, StorageModule], controllers: [CatalogoController], providers: [CatalogoService] })
export class CatalogoModule {}
