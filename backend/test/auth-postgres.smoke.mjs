// Explicit, opt-in verification against PostgreSQL; all test writes are rolled back.
import 'reflect-metadata';
import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { NestFactory } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../src/prisma/prisma.service.ts';
import { AuthService } from '../src/auth/auth.service.ts';
import { AuthConfig } from '../src/auth/auth.config.ts';
import { UsuariosService } from '../src/usuarios/usuarios.service.ts';
import { AppModule } from '../src/app.module.ts';
import { setupApp } from '../src/setup-app.ts';

// Ephemeral process-only key if local environment has not been configured yet.
process.env.JWT_ACCESS_SECRET ||= randomBytes(48).toString('base64url');
process.env.CORS_ORIGINS ||= 'http://localhost:5173';
const prisma = new PrismaService();
const rollback = new Error('ROLLBACK_SMOKE_TEST');
const email = `auth-smoke-${randomUUID()}@example.invalid`;
try {
  await prisma.$connect();
  const before = await prisma.usuario.count();
  await assert.rejects(prisma.$transaction(async tx => {
    // Reuse the surrounding transaction instead of attempting a nested transaction.
    const transactional = Object.assign(Object.create(tx), { $transaction: fn => fn(tx) });
    const auth = new AuthService(new UsuariosService(tx), transactional, new JwtService(), new AuthConfig());
    const user = await auth.register({ nome: 'Teste temporario', cpf: '98765432100', email, senha: 'SenhaSmoke@123' });
    assert.equal(user.status, 'PENDENTE_VERIFICACAO');
    const login = await auth.login({ email, senha: 'SenhaSmoke@123' });
    assert.equal((await auth.authenticate(login.accessToken)).id, user.id);
    const rotated = await auth.refresh(login.refreshToken);
    await assert.rejects(auth.refresh(login.refreshToken), error => error.getStatus() === 401);
    await auth.logout(rotated.refreshToken);
    await assert.rejects(auth.refresh(rotated.refreshToken), error => error.getStatus() === 401);
    throw rollback;
  }, { timeout: 20000 }), error => error === rollback);
  assert.equal(await prisma.usuario.findUnique({ where: { email } }), null);
  console.log('PostgreSQL: cadastro, login, JWT, refresh e logout passaram; usuario temporario revertido.');
  console.log(`Usuarios antes: ${before}; depois: ${await prisma.usuario.count()}.`);
} finally { await prisma.$disconnect(); }

const app = await NestFactory.create(AppModule, { logger: false, abortOnError: false });
try {
  setupApp(app);
  await app.listen(0, '127.0.0.1');
  const res = await fetch(`${await app.getUrl()}/api/health`);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { status: 'ok', database: 'connected' });
  console.log('AppModule iniciou com injecao real; GET /api/health: 200, database connected.');
} finally { await app.close(); }
