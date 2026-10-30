import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.ts';
import { UsuariosService } from './usuarios.service.ts';

@Module({ imports: [PrismaModule], providers: [UsuariosService], exports: [UsuariosService] })
export class UsuariosModule {}
