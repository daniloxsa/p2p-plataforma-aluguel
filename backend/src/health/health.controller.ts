
import {
  Controller,
  Get,
  Inject,
  HttpStatus,
  HttpException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.ts';

@Controller('health')
export class HealthController {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) { }

  @Get()
  async check() {
    try {
      await this.prisma.$queryRaw`SELECT 1 AS connected`;

      return {
        status: 'ok',
        database: 'connected',
      };

    } catch (error) {
      // Mostra o erro real no terminal do NestJS
      console.error('ERRO POSTGRESQL:', error);

      throw new HttpException(
        {
          status: 'error',
          database: 'disconnected',
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }
}

