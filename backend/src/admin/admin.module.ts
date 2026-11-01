import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.ts';
import { AdminController } from './admin.controller.ts';
import { PrismaModule } from '../prisma/prisma.module.ts';
import { StorageModule } from '../veiculos/fotos/storage.module.ts';
import { VehicleReviewController } from './vehicle-review.controller.ts';
import { VehicleReviewService } from './vehicle-review.service.ts';

@Module({ imports: [AuthModule, PrismaModule, StorageModule], controllers: [AdminController, VehicleReviewController], providers: [VehicleReviewService] })
export class AdminModule {}
