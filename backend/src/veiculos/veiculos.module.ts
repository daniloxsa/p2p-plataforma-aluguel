import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.ts';
import { PrismaModule } from '../prisma/prisma.module.ts';
import { VeiculosController } from './veiculos.controller.ts';
import { VeiculosService } from './veiculos.service.ts';
@Module({ imports: [AuthModule, PrismaModule], controllers: [VeiculosController], providers: [VeiculosService] })
export class VeiculosModule {}
