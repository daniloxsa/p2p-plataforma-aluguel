import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module.ts';
import { HealthController } from './health/health.controller.ts';
import { AuthModule } from './auth/auth.module.ts';
import { UsuariosModule } from './usuarios/usuarios.module.ts';
import { VeiculosModule } from './veiculos/veiculos.module.ts';
import { AnunciosModule } from './anuncios/anuncios.module.ts';
import { AdminModule } from './admin/admin.module.ts';
import { CatalogoModule } from './catalogo/catalogo.module.ts';

@Module({
  imports: [PrismaModule, AuthModule, UsuariosModule, VeiculosModule, AnunciosModule, AdminModule, CatalogoModule],
  controllers: [HealthController],
  providers: [],
})
export class AppModule {}
