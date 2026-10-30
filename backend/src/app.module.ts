import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module.ts';
import { HealthController } from './health/health.controller.ts';
import { AuthModule } from './auth/auth.module.ts';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [HealthController],
  providers: [],
})
export class AppModule {}
