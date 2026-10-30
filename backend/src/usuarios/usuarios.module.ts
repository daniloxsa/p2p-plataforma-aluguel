import { forwardRef, Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.ts';
import { PrismaModule } from '../prisma/prisma.module.ts';
import { UsuariosService } from './usuarios.service.ts';
import { UsuariosController } from './usuarios.controller.ts';

@Module({ imports: [PrismaModule, forwardRef(() => AuthModule)], providers: [UsuariosService], controllers: [UsuariosController], exports: [UsuariosService] })
export class UsuariosModule {}
