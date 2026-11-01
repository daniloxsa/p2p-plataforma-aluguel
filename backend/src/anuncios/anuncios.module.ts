import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.ts';
import { PrismaModule } from '../prisma/prisma.module.ts';
import { AnunciosController } from './anuncios.controller.ts';
import { AnunciosService } from './anuncios.service.ts';
import { StorageModule } from '../veiculos/fotos/storage.module.ts';
import { PublicationPolicyService } from './publication-policy.service.ts';

@Module({ imports: [AuthModule, PrismaModule, StorageModule], controllers: [AnunciosController], providers: [AnunciosService, PublicationPolicyService] })
export class AnunciosModule {}
