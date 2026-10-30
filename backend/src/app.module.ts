import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module.ts';
import { HealthController } from './health/health.controller.ts';

@Module({
  imports: [PrismaModule],
  controllers: [HealthController],
  providers: [],
})
export class AppModule {}
