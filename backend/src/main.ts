import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.ts';
import * as dotenv from 'dotenv';

// Carrega variaveis de ambiente do .env (nao versionado).
// Deve ser executado antes de qualquer modulo que leia process.env.
dotenv.config();

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Prefixo global para todas as rotas da API: /api/*
  app.setGlobalPrefix('api');

  // CORS com origens configuradas por variavel de ambiente (sem permissao indiscriminada).
  const corsOrigins = (process.env.CORS_ORIGINS ?? 'http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  app.enableCors({ origin: corsOrigins });

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  console.log(`UniVia backend rodando na porta ${port}`);
}

void bootstrap();
