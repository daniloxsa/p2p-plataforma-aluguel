import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { ThrottlerModule } from '@nestjs/throttler';
import { Prisma } from '@prisma/client';
import * as argon2 from 'argon2';
import { AuthConfig } from '../src/auth/auth.config.ts';
import { AuthService } from '../src/auth/auth.service.ts';
import { AuthController } from '../src/auth/auth.controller.ts';
import { JwtAuthGuard } from '../src/auth/guards/jwt-auth.guard.ts';
import { CsrfGuard } from '../src/auth/guards/csrf.guard.ts';
import { UsuariosService } from '../src/usuarios/usuarios.service.ts';
import { UsuariosController } from '../src/usuarios/usuarios.controller.ts';
import { PrismaService } from '../src/prisma/prisma.service.ts';
import { FotosService } from '../src/veiculos/fotos/fotos.service.ts';
import { setupApp } from '../src/setup-app.ts';
import { AppModule } from '../src/app.module.ts';

// All persistence is isolated in memory. No Prisma connection or real user is touched.
function database() {
  const users = [], sessions = [];
  const matches = (row, where) => Object.entries(where).every(([key, value]) =>
    value && typeof value === 'object' && 'gt' in value ? row[key] > value.gt : row[key] === value);
  const selected = (row, select) => row && (select ? Object.fromEntries(Object.keys(select).map(key => [key, row[key]])) : { ...row });
  const db = {
    usuario: {
      async create({ data, select }) {
        if (users.some(u => u.email === data.email || u.cpf === data.cpf)) {
          throw new Prisma.PrismaClientKnownRequestError('Duplicate', { code: 'P2002', clientVersion: '7.10.1' });
        }
        const row = { id: randomUUID(), criado_em: new Date(), telefone: null, status: 'PENDENTE_VERIFICACAO', senha_hash: '$argon2id$test', ...Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined)) };
        users.push(row);
        return selected(row, select);
      },
      async findUnique({ where, select }) { return selected(users.find(u => matches(u, where)), select) ?? null; },
      async update({ where, data, select }) {
        const index = users.findIndex(u => matches(u, where));
        if (index === -1) throw new Prisma.PrismaClientKnownRequestError('Not found', { code: 'P2025', clientVersion: '7.10.1' });
        const updated = { ...users[index], ...data };
        users[index] = updated;
        return selected(updated, select);
      },
    },
    sessao_usuario: {
      async create({ data }) { const row = { id: randomUUID(), criado_em: new Date(), revogado_em: null, ...data }; sessions.push(row); return { ...row }; },
      async findUnique({ where, include }) { const row = sessions.find(s => matches(s, where)); return row ? { ...row, ...(include ? { usuario: users.find(u => u.id === row.usuario_id) } : {}) } : null; },
      async findFirst({ where }) { return sessions.find(s => matches(s, where)) ?? null; },
      async updateMany({ where, data }) { const rows = sessions.filter(s => matches(s, where)); rows.forEach(s => Object.assign(s, data)); return { count: rows.length }; },
    },
    async $transaction(fn) { return fn(db); },
  };
  return { db, users, sessions };
}

test('usuarios profile management with tsx, real JWT and Argon2id', async t => {
  const { db, users } = database();
  const config = { secret: 'test-secret-'.repeat(6), accessSeconds: 900, refreshMs: 604800000, origins: ['http://localhost:5173'], secure: false, sameSite: 'lax' };
  class TestModule {}
  Module({
    imports: [JwtModule.register({}), ThrottlerModule.forRoot([{ ttl: 60000, limit: 30 }])],
    controllers: [AuthController, UsuariosController],
    providers: [AuthService, UsuariosService, JwtAuthGuard, CsrfGuard, { provide: PrismaService, useValue: db }, { provide: AuthConfig, useValue: config }],
  })(TestModule);
  const app = await NestFactory.create(TestModule, { logger: false, abortOnError: false });
  setupApp(app);
  t.after(() => app.close());
  await app.listen(0, '127.0.0.1');
  const base = `${await app.getUrl()}/api`;
  const headers = { 'Content-Type': 'application/json', 'X-UniVia-CSRF': '1', Origin: config.origins[0] };
  const post = (path, body = {}, cookie, overrides = {}) => fetch(`${base}/auth/${path}`, { method: 'POST', headers: { ...headers, ...(cookie ? { Cookie: cookie } : {}), ...overrides }, body: JSON.stringify(body) });
  const cookieOf = res => res.headers.get('set-cookie').split(';')[0];
  const dto = { nome: ' João Silva ', cpf: '123.456.789-09', email: ' JOAO@EXEMPLO.COM ', senha: 'SenhaForte@123' };

  let access, cookie, userId;

  await t.test('valid registration creates a user', async () => {
    const res = await post('register', dto);
    assert.equal(res.status, 201);
    const user = await res.json();
    assert.equal(user.status, 'PENDENTE_VERIFICACAO');
    assert.equal(user.email, 'joao@exemplo.com');
    assert.equal(user.nome, 'João Silva');
    assert.equal(user.cpf, undefined);
    assert.equal(user.senha_hash, undefined);
    assert.equal(users[0].cpf, '12345678909');
    assert.match(users[0].senha_hash, /^\$argon2id\$/);
    assert.ok(await argon2.verify(users[0].senha_hash, dto.senha));
    userId = user.id;
  });

  await t.test('login authenticates user and provides access token', async () => {
    const res = await post('login', { email: 'joao@exemplo.com', senha: dto.senha });
    assert.equal(res.status, 200);
    assert.match(res.headers.get('set-cookie'), /HttpOnly/);
    assert.match(res.headers.get('set-cookie'), /SameSite=Lax/);
    cookie = cookieOf(res);
    const result = await res.json();
    access = result.accessToken;
    assert.equal(result.user.senha_hash, undefined);
  });

  await t.test('GET /api/usuarios/me returns authenticated user profile', async () => {
    const url = `${base}/usuarios/me`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${access}` } });
    assert.equal(res.status, 200);
    const profile = await res.json();
    assert.equal(profile.id, userId);
    assert.equal(profile.nome, 'João Silva');
    assert.equal(profile.email, 'joao@exemplo.com');
    assert.equal(profile.status, 'PENDENTE_VERIFICACAO');
    assert.equal(profile.telefone, undefined);
    assert.ok('criado_em' in profile);
    assert.equal(profile.criado_em, users[0].criado_em.toISOString());
    assert.deepEqual(Object.keys(profile).sort(), ['id', 'nome', 'email', 'status', 'criado_em'].sort());
    assert.equal(profile.cpf, undefined);
    assert.equal(profile.senha_hash, undefined);
  });

  await t.test('PATCH /api/usuarios/me updates nome successfully', async () => {
    const url = `${base}/usuarios/me`;
    const update = { nome: 'João da Silva' };
    const res = await fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${access}` },
      body: JSON.stringify(update),
    });
    assert.equal(res.status, 200);
    const updated = await res.json();
    assert.equal(updated.id, userId);
    assert.equal(updated.nome, 'João da Silva');
    assert.equal(updated.email, 'joao@exemplo.com');
    assert.equal(users[0].nome, 'João da Silva');
  });

  await t.test('PATCH /api/usuarios/me updates telefone successfully', async () => {
    const url = `${base}/usuarios/me`;
    const update = { telefone: '79988887777' };
    const res = await fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${access}` },
      body: JSON.stringify(update),
    });
    assert.equal(res.status, 200);
    const updated = await res.json();
    assert.equal(updated.telefone, '79988887777');
    assert.equal(users[0].telefone, '79988887777');
    const persisted = await fetch(url, { headers: { Authorization: `Bearer ${access}` } });
    assert.equal(persisted.status, 200);
    const profile = await persisted.json();
    assert.equal(profile.nome, 'João da Silva');
    assert.equal(profile.telefone, '79988887777');
  });

  await t.test('PATCH /api/usuarios/me with empty payload returns error', async () => {
    const url = `${base}/usuarios/me`;
    const res = await fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${access}` },
      body: JSON.stringify({}),
    });
    assert.equal(res.status, 400);
  });

  await t.test('PATCH /api/usuarios/me with invalid data returns error', async () => {
    const url = `${base}/usuarios/me`;
    for (const update of [{ nome: 123 }, { nome: null }, { telefone: null }]) {
      const res = await fetch(url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${access}` },
        body: JSON.stringify(update),
      });
      assert.equal(res.status, 400);
    }
  });

  await t.test('PATCH /api/usuarios/me rejects unknown fields', async () => {
    const url = `${base}/usuarios/me`;
    const update = { invalidField: 'should be rejected' };
    const res = await fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${access}` },
      body: JSON.stringify(update),
    });
    assert.equal(res.status, 400);
  });

  await t.test('PATCH /api/usuarios/me cannot change CPF', async () => {
    const url = `${base}/usuarios/me`;
    const update = { cpf: '98765432100' }; // Should be rejected
    const res = await fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${access}` },
      body: JSON.stringify(update),
    });
    assert.equal(res.status, 400);
  });

  await t.test('PATCH /api/usuarios/me cannot change email', async () => {
    const url = `${base}/usuarios/me`;
    const update = { email: 'newemail@example.com' }; // Should be rejected
    const res = await fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${access}` },
      body: JSON.stringify(update),
    });
    assert.equal(res.status, 400);
  });

  await t.test('PATCH /api/usuarios/me cannot change status', async () => {
    const url = `${base}/usuarios/me`;
    const update = { status: 'VERIFICADO' }; // Should be rejected
    const res = await fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${access}` },
      body: JSON.stringify(update),
    });
    assert.equal(res.status, 400);
  });

  await t.test('PATCH /api/usuarios/me cannot change password', async () => {
    const url = `${base}/usuarios/me`;
    const update = { senha: 'NovaSenha@123' }; // Should be rejected
    const res = await fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${access}` },
      body: JSON.stringify(update),
    });
    assert.equal(res.status, 400);
  });

  await t.test('PATCH /api/usuarios/me cannot change other users profile', async () => {
    // Create second user
    const dto2 = { nome: 'Maria Silva', cpf: '52998224725', email: 'maria@example.com', senha: 'SenhaForte@123' };
    const res1 = await post('register', dto2);
    assert.equal(res1.status, 201);
    const user2 = await res1.json();
    const login2 = await post('login', { email: 'maria@example.com', senha: 'SenhaForte@123' });
    assert.equal(login2.status, 200);
    const access2 = (await login2.json()).accessToken;

    const url = `${base}/usuarios/me`;
    const update = { nome: 'João Atualizado', telefone: '79911112222' };
    const res = await fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${access}` }, // Using user1's token
      body: JSON.stringify(update),
    });
    assert.equal(res.status, 200);
    const updated = await res.json();
    assert.equal(updated.id, userId);
    assert.equal(updated.nome, 'João Atualizado');
    assert.equal(users[0].nome, 'João Atualizado');
    assert.equal(users[1].nome, 'Maria Silva');
    assert.equal(users[1].telefone, null);

    // Now try with user2's token
    const res2 = await fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${access2}` },
      body: JSON.stringify({ nome: 'Maria Alterada', telefone: '11999998888' }),
    });
    assert.equal(res2.status, 200);
    const updated2 = await res2.json();
    assert.equal(updated2.nome, 'Maria Alterada'); // Should be able to update own profile
    assert.equal(updated2.id, user2.id);
    assert.equal(users[1].nome, 'Maria Alterada');
    assert.equal(users[1].telefone, '11999998888');
    assert.equal(users[0].nome, 'João Atualizado');
    assert.equal(users[0].telefone, '79911112222');
    for (const [token, expected] of [[access, users[0]], [access2, users[1]]]) {
      const me = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      assert.equal(me.status, 200);
      const profile = await me.json();
      assert.equal(profile.id, expected.id);
      assert.equal(profile.nome, expected.nome);
      assert.equal(profile.telefone, expected.telefone);
    }
    const forbidden = await fetch(url, {
      method: 'PATCH', headers: { ...headers, Authorization: `Bearer ${access}` },
      body: JSON.stringify({ id: user2.id, nome: 'Tentativa indevida' }),
    });
    assert.equal(forbidden.status, 400);
    assert.equal(users[1].nome, 'Maria Alterada');
  });

  await t.test('GET /api/usuarios/me without token returns 401', async () => {
    const url = `${base}/usuarios/me`;
    const res = await fetch(url);
    assert.equal(res.status, 401);
  });

  await t.test('PATCH /api/usuarios/me without token returns 401', async () => {
    const url = `${base}/usuarios/me`;
    const update = { nome: 'Test' };
    const res = await fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(update),
    });
    assert.equal(res.status, 401);
  });

  await t.test('PATCH /api/usuarios/me with invalid token returns 401', async () => {
    const url = `${base}/usuarios/me`;
    const update = { nome: 'Test' };
    const res = await fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer invalid_token' },
      body: JSON.stringify(update),
    });
    assert.equal(res.status, 401);
  });

  await t.test('PATCH /api/usuarios/me after logout fails', async () => {
    const logout = await post('logout', {}, cookie);
    assert.equal(logout.status, 204);

    const url = `${base}/usuarios/me`;
    const update = { nome: 'Test' };
    const res = await fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${access}` },
      body: JSON.stringify(update),
    });
    assert.equal(res.status, 401);
  });
});

test('AppModule registers protected profile routes without connecting to PostgreSQL', async t => {
  const previous = { ...process.env };
  process.env.DATABASE_URL = 'postgresql://test:test@127.0.0.1:1/test';
  process.env.JWT_ACCESS_SECRET = 'test-secret-'.repeat(6);
  process.env.CORS_ORIGINS = 'http://localhost:5173';
  process.env.JWT_ACCESS_EXPIRES_IN = '15m';
  process.env.REFRESH_TOKEN_EXPIRES_DAYS = '7';
  t.mock.method(PrismaService.prototype, 'onModuleInit', async () => {});
  t.mock.method(PrismaService.prototype, 'onModuleDestroy', async () => {});
  t.mock.method(FotosService.prototype, 'onModuleInit', async () => {});
  let app;
  try {
    app = await NestFactory.create(AppModule, { logger: false, abortOnError: false });
    setupApp(app);
    await app.listen(0, '127.0.0.1');
    const url = `${await app.getUrl()}/api/usuarios/me`;
    for (const method of ['GET', 'PATCH']) {
      const response = await fetch(url, { method });
      assert.equal(response.status, 401);
    }
  } finally {
    if (app) await app.close();
    process.env = previous;
  }
});
