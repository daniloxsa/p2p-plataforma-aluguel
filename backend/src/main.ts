import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { setupApp } from './setup-app.ts';
import { AppModule } from './app.module.ts';
import * as dotenv from 'dotenv';

// Carrega variaveis de ambiente do .env (nao versionado).
// Deve ser executado antes de qualquer modulo que leia process.env.
dotenv.config();

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  setupApp(app);
  app.enableShutdownHooks();

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  console.log(`UniVia backend rodando na porta ${port}`);
}

void bootstrap();
