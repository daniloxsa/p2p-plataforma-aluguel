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
import { PrismaService } from '../src/prisma/prisma.service.ts';
import { setupApp } from '../src/setup-app.ts';

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
        const row = { id: randomUUID(), telefone: null, ...Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined)) };
        users.push(row);
        return selected(row, select);
      },
      async findUnique({ where, select }) { return selected(users.find(u => matches(u, where)), select) ?? null; },
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

test('authentication HTTP flows with tsx, real JWT and Argon2id', async t => {
  const { db, users, sessions } = database();
  const config = { secret: 'test-secret-'.repeat(6), accessSeconds: 900, refreshMs: 604800000, origins: ['http://localhost:5173'], secure: false, sameSite: 'lax' };
  class TestModule {}
  Module({
    imports: [JwtModule.register({}), ThrottlerModule.forRoot([{ ttl: 60000, limit: 30 }])],
    controllers: [AuthController],
    providers: [AuthService, UsuariosService, JwtAuthGuard, CsrfGuard, { provide: PrismaService, useValue: db }, { provide: AuthConfig, useValue: config }],
  })(TestModule);
  const app = await NestFactory.create(TestModule, { logger: false, abortOnError: false });
  setupApp(app);
  t.after(() => app.close());
  await app.listen(0, '127.0.0.1');
  const base = `${await app.getUrl()}/api/auth`;
  const headers = { 'Content-Type': 'application/json', 'X-UniVia-CSRF': '1', Origin: config.origins[0] };
  const post = (path, body = {}, cookie, overrides = {}) => fetch(`${base}/${path}`, { method: 'POST', headers: { ...headers, ...(cookie ? { Cookie: cookie } : {}), ...overrides }, body: JSON.stringify(body) });
  const cookieOf = res => res.headers.get('set-cookie').split(';')[0];
  const dto = { nome: ' Joao Silva ', cpf: '123.456.789-09', email: ' JOAO@EXEMPLO.COM ', senha: 'SenhaForte@123' };
  let access, cookie;

  await t.test('valid registration normalizes data and stores only an Argon2id hash', async () => {
    const res = await post('register', dto);
    assert.equal(res.status, 201);
    const user = await res.json();
    assert.equal(user.status, 'PENDENTE_VERIFICACAO');
    assert.equal(user.email, 'joao@exemplo.com');
    assert.equal(user.nome, 'Joao Silva');
    assert.equal(user.cpf, undefined);
    assert.equal(user.senha_hash, undefined);
    assert.equal(users[0].cpf, '12345678909');
    assert.match(users[0].senha_hash, /^\$argon2id\$/);
    assert.ok(await argon2.verify(users[0].senha_hash, dto.senha));
  });
  await t.test('invalid CPF is rejected', async () => { assert.equal((await post('register', { ...dto, cpf: '11111111111' })).status, 400); });
  await t.test('duplicate email is a conflict', async () => { assert.equal((await post('register', { ...dto, cpf: '52998224725' })).status, 409); });
  await t.test('duplicate CPF is a conflict', async () => { assert.equal((await post('register', { ...dto, email: 'other@example.com' })).status, 409); });
  await t.test('unknown fields, wrong types and weak passwords are rejected', async () => {
    for (const patch of [{ role: 'admin' }, { nome: 123 }, { senha: 'weak' }, { email: 'invalid' }]) {
      assert.equal((await post('register', { ...dto, ...patch })).status, 400);
    }
  });
  await t.test('CSRF header and Origin are enforced', async () => {
    assert.equal((await post('login', dto, undefined, { 'X-UniVia-CSRF': '' })).status, 403);
    assert.equal((await post('login', dto, undefined, { Origin: 'https://evil.example' })).status, 403);
  });
  await t.test('login allows pending verification and sets HttpOnly cookie', async () => {
    const res = await post('login', { email: dto.email, senha: dto.senha });
    assert.equal(res.status, 200);
    assert.match(res.headers.get('set-cookie'), /HttpOnly/);
    assert.match(res.headers.get('set-cookie'), /SameSite=Lax/);
    assert.match(res.headers.get('set-cookie'), /Max-Age=604800/);
    assert.equal(res.headers.get('access-control-allow-credentials'), 'true');
    assert.equal(res.headers.get('cache-control'), 'no-store');
    cookie = cookieOf(res);
    const result = await res.json();
    access = result.accessToken;
    assert.equal(result.expiresIn, 900);
    assert.equal(result.refreshToken, undefined);
    assert.equal(result.user.senha_hash, undefined);
    assert.notEqual(sessions[0].token_hash, cookie.split('=')[1]);
    assert.equal(sessions[0].token_hash.length, 64);
  });
  await t.test('wrong password and nonexistent account have generic errors', async () => {
    const a = await post('login', { email: dto.email, senha: 'wrong' });
    const b = await post('login', { email: 'missing@example.com', senha: 'wrong' });
    assert.equal(a.status, 401); assert.equal(b.status, 401);
    assert.deepEqual(await a.json(), await b.json());
  });
  const me = token => fetch(`${base}/me`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  await t.test('protected endpoint rejects missing, malformed and invalid tokens', async () => {
    for (const token of [undefined, 'invalid', `${access}x`]) assert.equal((await me(token)).status, 401);
  });
  await t.test('valid access token returns public /me fields', async () => {
    const res = await me(access); assert.equal(res.status, 200);
    assert.deepEqual(Object.keys(await res.json()).sort(), ['id', 'nome', 'email', 'telefone', 'status'].sort());
  });
  await t.test('expired JWT and incorrect token type are rejected', async () => {
    const jwt = app.get(JwtService);
    for (const payload of [{ type: 'access', exp: Math.floor(Date.now() / 1000) - 1 }, { type: 'refresh' }]) {
      const token = await jwt.signAsync({ sub: users[0].id, sid: sessions[0].id, ...payload }, { secret: config.secret, issuer: 'univia', audience: 'univia-api' });
      assert.equal((await me(token)).status, 401);
    }
  });
  await t.test('blocked account cannot authenticate or use existing access', async () => {
    users[0].status = 'SUSPENSO';
    assert.equal((await post('login', { email: dto.email, senha: dto.senha })).status, 401);
    assert.equal((await me(access)).status, 401);
    assert.equal((await post('refresh', {}, cookie)).status, 401);
    users[0].status = 'PENDENTE_VERIFICACAO';
  });
  await t.test('refresh rotates once, rejects replay and invalidates old access', async () => {
    const res = await post('refresh', {}, cookie); assert.equal(res.status, 200);
    assert.equal((await post('refresh', {}, cookie)).status, 401);
    assert.equal((await me(access)).status, 401);
    cookie = cookieOf(res); access = (await res.json()).accessToken;
    assert.equal((await me(access)).status, 200);
  });
  await t.test('concurrent refresh requests cannot both consume the same token', async () => {
    const responses = await Promise.all([post('refresh', {}, cookie), post('refresh', {}, cookie)]);
    assert.deepEqual(responses.map(r => r.status).sort(), [200, 401]);
    const res = responses.find(r => r.status === 200);
    cookie = cookieOf(res); access = (await res.json()).accessToken;
  });
  await t.test('logout clears cookie and revokes refresh and access', async () => {
    const res = await post('logout', {}, cookie); assert.equal(res.status, 204);
    assert.match(res.headers.get('set-cookie'), /Expires=Thu, 01 Jan 1970/);
    assert.equal((await post('refresh', {}, cookie)).status, 401);
    assert.equal((await me(access)).status, 401);
    assert.equal((await post('logout')).status, 204);
  });
  await t.test('expired and missing refresh tokens are rejected', async () => {
    assert.equal((await post('refresh')).status, 401);
    const session = sessions.at(-1); session.revogado_em = null; session.expira_em = new Date(0);
    assert.equal((await post('refresh', {}, cookie)).status, 401);
  });
  await t.test('login rate limit returns 429', async () => {
    let res;
    for (let i = 0; i < 11; i++) { res = await post('login', { email: dto.email, senha: 'wrong' }); if (res.status === 429) break; }
    assert.equal(res.status, 429);
  });
});

test('environment validation fails closed', () => {
  const previous = { ...process.env };
  try {
    process.env.DATABASE_URL = 'postgresql://test/test';
    process.env.JWT_ACCESS_SECRET = 'weak';
    assert.throws(() => new AuthConfig(), /JWT_ACCESS_SECRET/);
    process.env.JWT_ACCESS_SECRET = 'test-secret-'.repeat(6);
    process.env.CORS_ORIGINS = '*';
    assert.throws(() => new AuthConfig(), /CORS_ORIGINS/);
    process.env.CORS_ORIGINS = 'https://frontend.example';
    process.env.COOKIE_SAME_SITE = 'none';
    process.env.JWT_ACCESS_EXPIRES_IN = '15m';
    process.env.REFRESH_TOKEN_EXPIRES_DAYS = '7';
    assert.equal(new AuthConfig().secure, true);
  } finally { process.env = previous; }
});
