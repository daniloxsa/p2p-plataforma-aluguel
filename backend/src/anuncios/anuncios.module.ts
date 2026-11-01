import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.ts';
import { PrismaModule } from '../prisma/prisma.module.ts';
import { AnunciosController } from './anuncios.controller.ts';
import { AnunciosService } from './anuncios.service.ts';

@Module({ imports: [AuthModule, PrismaModule], controllers: [AnunciosController], providers: [AnunciosService] })
export class AnunciosModule {}
