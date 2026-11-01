import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuthService } from '../src/auth/auth.service.ts';
import { AuthController } from '../src/auth/auth.controller.ts';
import { AuthConfig } from '../src/auth/auth.config.ts';
import { JwtAuthGuard } from '../src/auth/guards/jwt-auth.guard.ts';
import { AdminGuard } from '../src/auth/guards/admin.guard.ts';
import { CsrfGuard } from '../src/auth/guards/csrf.guard.ts';
import { AdminController } from '../src/admin/admin.controller.ts';
import { UsuariosController } from '../src/usuarios/usuarios.controller.ts';
import { UsuariosService } from '../src/usuarios/usuarios.service.ts';
import { PrismaService } from '../src/prisma/prisma.service.ts';
import { setupApp } from '../src/setup-app.ts';

test('admin HTTP: real JWT/session validation with mock PostgreSQL persistence', async t => {
  const users = [
    { id: randomUUID(), nome: 'Common', papel: 'USUARIO', status: 'ATIVO' },
    { id: randomUUID(), nome: 'Admin', papel: 'ADMIN', status: 'VERIFICADO' },
  ];
  const sessions = users.map(user => ({ id: randomUUID(), usuario_id: user.id, revogado_em: null, expira_em: new Date(Date.now() + 60000) }));
  const calls = { users: 0, sessions: 0 };
  const selected = (row, select) => row && (select ? Object.fromEntries(Object.keys(select).map(key => [key, row[key]])) : { ...row });
  const db = {
    usuario: {
      async findUnique({ where, select }) { calls.users++; return selected(users.find(u => Object.entries(where).every(([k, v]) => u[k] === v)), select); },
      async create({ data, select }) { const row = { id: randomUUID(), criado_em: new Date(), ...data }; users.push(row); return selected(row, select); },
    },
    sessao_usuario: { async findFirst({ where }) {
      calls.sessions++;
      return sessions.find(s => s.id === where.id && s.usuario_id === where.usuario_id && s.revogado_em === null && s.expira_em > where.expira_em.gt);
    } },
  };
  const config = { secret: 'admin-test-secret-'.repeat(4), accessSeconds: 900, refreshMs: 604800000,
    origins: ['http://localhost:5173'], secure: false, sameSite: 'lax' };
  class TestModule {}
  Module({ imports: [JwtModule.register({}), ThrottlerModule.forRoot([{ ttl: 60000, limit: 30 }])],
    controllers: [AdminController, AuthController, UsuariosController],
    providers: [AuthService, UsuariosService, JwtAuthGuard, AdminGuard, CsrfGuard,
      { provide: PrismaService, useValue: db }, { provide: AuthConfig, useValue: config }] })(TestModule);
  const app = await NestFactory.create(TestModule, { logger: false });
  setupApp(app); await app.listen(0, '127.0.0.1'); t.after(() => app.close());
  const base = `${await app.getUrl()}/api`;
  const jwt = app.get(JwtService);
  const issue = (index, extra = {}) => jwt.signAsync({ sub: users[index].id, sid: sessions[index].id, type: 'access', ...extra },
    { secret: config.secret, algorithm: 'HS256', issuer: 'univia', audience: 'univia-api' });
  const common = await issue(0, { papel: 'ADMIN', roles: ['ADMIN'] }), admin = await issue(1);
  const get = (token, path = '/admin/me', headers = {}) => fetch(`${base}${path}`, { headers: { ...headers, ...(token ? { Authorization: `Bearer ${token}` } : {}) } });

  await t.test('missing, malformed, expired and invalid JWTs are 401', async () => {
    for (const token of [undefined, 'bad', `${admin}x`, await issue(1, { exp: Math.floor(Date.now() / 1000) - 10 }), await issue(1, { type: 'refresh' })]) {
      assert.equal((await get(token)).status, 401);
    }
    const guard = new AdminGuard();
    assert.throws(() => guard.canActivate({ switchToHttp: () => ({ getRequest: () => ({}) }) }), { status: 401 });
  });
  await t.test('common users cannot supply privilege by JWT, query or custom headers', async () => {
    assert.equal((await get(common, '/admin/me?papel=ADMIN', { 'X-Role': 'ADMIN', papel: 'ADMIN' })).status, 403);
  });
  await t.test('ADMIN receives a minimal uncached response with one user lookup', async () => {
    const before = { ...calls };
    const result = await get(admin); assert.equal(result.status, 200);
    assert.deepEqual(await result.json(), { id: users[1].id, nome: 'Admin', papel: 'ADMIN' });
    assert.equal(result.headers.get('cache-control'), 'no-store');
    assert.equal(calls.users - before.users, 1); assert.equal(calls.sessions - before.sessions, 1);
    assert.equal((await (await get(admin, '/auth/me')).json()).papel, undefined, 'Existing public auth contract is preserved.');
  });
  await t.test('current database role wins on the next request with the same JWT', async () => {
    users[1].papel = 'USUARIO'; assert.equal((await get(admin)).status, 403);
    users[1].papel = 'ADMIN'; assert.equal((await get(admin)).status, 200);
    for (const papel of ['SUPERADMIN', '', null, undefined]) {
      users[1].papel = papel; assert.equal((await get(admin)).status, 403);
    }
    users[1].papel = 'ADMIN';
    users[0].papel = 'ADMIN'; assert.equal((await get(common)).status, 200);
    users[0].papel = 'USUARIO'; assert.equal((await get(common)).status, 403);
  });
  await t.test('blocked/missing users and invalidated sessions remain 401', async () => {
    const status = users[1].status;
    users[1].status = 'SUSPENSO'; assert.equal((await get(admin)).status, 401); users[1].status = status;
    sessions[1].revogado_em = new Date(); assert.equal((await get(admin)).status, 401); sessions[1].revogado_em = null;
    const expiration = sessions[1].expira_em;
    sessions[1].expira_em = new Date(0); assert.equal((await get(admin)).status, 401); sessions[1].expira_em = expiration;
    const id = users[1].id; users[1].id = randomUUID(); assert.equal((await get(admin)).status, 401); users[1].id = id;
  });
  await t.test('public registration and profile APIs reject privilege fields', async () => {
    const headers = { 'Content-Type': 'application/json', 'X-UniVia-CSRF': '1', Origin: config.origins[0] };
    const dto = { nome: 'Test account', cpf: '12345678909', email: 'admin-tests@test.invalid', senha: 'StrongTest@1234' };
    for (const patch of [{ papel: 'ADMIN' }, { role: 'ADMIN' }, { roles: ['ADMIN'] }]) {
      const result = await fetch(`${base}/auth/register`, { method: 'POST', headers, body: JSON.stringify({ ...dto, ...patch }) });
      assert.equal(result.status, 400);
      assert.equal((await fetch(`${base}/usuarios/me`, { method: 'PATCH', headers: { ...headers, Authorization: `Bearer ${common}` }, body: JSON.stringify(patch) })).status, 400);
    }
    const result = await fetch(`${base}/auth/register`, { method: 'POST', headers, body: JSON.stringify(dto) });
    assert.equal(result.status, 201); assert.equal(users.at(-1).papel, 'USUARIO');
    assert.equal((await result.json()).papel, undefined);
    // Defense in depth for internal calls that do not pass through ValidationPipe.
    await app.get(AuthService).register({ ...dto, email: 'internal@test.invalid', papel: 'ADMIN', status: 'ATIVO' });
    assert.equal(users.at(-1).papel, 'USUARIO'); assert.equal(users.at(-1).status, 'PENDENTE_VERIFICACAO');
  });
});
