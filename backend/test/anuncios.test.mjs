import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { Module, UnauthorizedException, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Prisma } from '@prisma/client';
// Also run against tsc output to exercise emitted decorator metadata and global pipes.
const compiled = process.env.ANUNCIOS_TEST_COMPILED === '1';
const load = path => import(`../${compiled ? 'dist' : 'src'}/${path}.${compiled ? 'js' : 'ts'}`);
const { AnunciosController } = await load('anuncios/anuncios.controller');
const { AnunciosService } = await load('anuncios/anuncios.service');
const { PrismaService } = await load('prisma/prisma.service');
const { AuthService } = await load('auth/auth.service');
const { JwtAuthGuard } = await load('auth/guards/jwt-auth.guard');

test('anúncios: HTTP, ownership and conditional persistence (mock database)', async t => {
  const vehicles = [
    { id: randomUUID(), proprietario_id: 'alice', desativado_em: null, status_cadastro: 'PENDENTE' },
    { id: randomUUID(), proprietario_id: 'bob', desativado_em: null },
    { id: randomUUID(), proprietario_id: 'alice', desativado_em: new Date() },
  ];
  const rows = [], photos = [{ id: randomUUID(), veiculo_id: vehicles[0].id }];
  const matches = (row, where) => Object.entries(where).every(([k, v]) => k === 'veiculo'
    ? vehicles.find(vehicle => vehicle.id === row.veiculo_id)?.proprietario_id === v.proprietario_id : row[k] === v);
  const project = (row, select) => row && Object.fromEntries(Object.entries(select).map(([key, value]) => [key,
    key === 'veiculo' ? project(vehicles.find(v => v.id === row.veiculo_id), value.select) : row[key] ?? null]));
  let beforeUpdate, lastQuery;
  const db = {
    veiculo: { async findFirst({ where, select }) { return project(vehicles.find(row => matches(row, where)), select); } },
    anuncio: {
      async create({ data, select }) {
        const row = { id: randomUUID(), criado_em: new Date(), ...data }; rows.push(row); return project(row, select);
      },
      async findFirst({ where, select }) { return project(rows.find(row => matches(row, where)), select); },
      async findMany(query) {
        lastQuery = query;
        return rows.filter(row => matches(row, query.where)).sort((a, b) => {
          for (const entry of query.orderBy) {
            const [key, direction] = Object.entries(entry)[0];
            const compare = a[key] instanceof Prisma.Decimal ? a[key].comparedTo(b[key]) : a[key] < b[key] ? -1 : a[key] > b[key] ? 1 : 0;
            if (compare) return direction === 'asc' ? compare : -compare;
          }
          return 0;
        }).slice(query.skip, query.skip + query.take).map(row => project(row, query.select));
      },
      async count({ where }) { return rows.filter(row => matches(row, where)).length; },
      async updateMany({ where, data }) {
        if (beforeUpdate) { const hook = beforeUpdate; beforeUpdate = undefined; await hook(); }
        const matching = rows.filter(row => matches(row, where));
        matching.forEach(row => Object.assign(row, data)); return { count: matching.length };
      },
    },
    async $transaction(operation) { return operation(db); },
  };
  const service = new AnunciosService(db);
  class TestModule {}
  Module({ controllers: [AnunciosController], providers: [AnunciosService, JwtAuthGuard,
    { provide: PrismaService, useValue: db }, { provide: AuthService, useValue: { authenticate: async token => {
      if (!['alice', 'bob'].includes(token)) throw new UnauthorizedException(); return { id: token };
    } } }] })(TestModule);
  const app = await NestFactory.create(TestModule, { logger: false });
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true, forbidUnknownValues: true }));
  app.setGlobalPrefix('api'); await app.listen(0, '127.0.0.1'); t.after(() => app.close());
  const base = `${await app.getUrl()}/api/anuncios`;
  const request = (path = '', method = 'GET', body, user = 'alice') => fetch(`${base}${path}`, {
    method, headers: { 'Content-Type': 'application/json', ...(user ? { Authorization: `Bearer ${user}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const dto = { veiculo_id: vehicles[0].id, titulo: '  Meu carro  ', preco_diaria: '123.45' };
  let id;

  await t.test('every endpoint requires authentication', async () => {
    for (const [method, path] of [['POST', ''], ['GET', '/meus'], ['GET', `/meus/${randomUUID()}`],
      ['PATCH', `/${randomUUID()}`], ['PATCH', `/${randomUUID()}/encerrar`]]) {
      assert.equal((await request(path, method, undefined, null)).status, 401);
      assert.equal((await request(path, method, undefined, 'invalid')).status, 401);
    }
  });
  await t.test('validates title, money, booleans, UUIDs and protected fields', async () => {
    const invalid = [ {}, { titulo: '' }, { titulo: '   ' }, { titulo: 'a'.repeat(151) }, { veiculo_id: 'bad' },
      { titulo: null }, { preco_diaria: 0 }, { preco_diaria: -1 }, { preco_diaria: 'abc' }, { preco_diaria: 'NaN' },
      { preco_diaria: 'Infinity' }, { preco_diaria: '0.001' }, { preco_diaria: '10000000000' }, { preco_diaria: '1e2' },
      { preco_diaria: true }, { preco_diaria: null }, { preco_diaria: '1\n' }, { valor_caucao: -1 }, { valor_caucao: '1.001' },
      { preco_seguro_dia: -1 }, { preco_seguro_dia: 'abc' }, { valor_caucao: null }, { preco_seguro_dia: null },
      { aceite_automatico: 'false' }, { aceite_automatico: null }, { descricao: 1 }, { status: 'ATIVO' },
      { proprietario_id: 'bob' }, { id: randomUUID() }, { criado_em: new Date() }, { extra: true } ];
    for (const patch of invalid) {
      const body = Object.keys(patch).length ? { ...dto, ...patch } : {};
      assert.equal((await request('', 'POST', body)).status, 400, JSON.stringify(body));
    }
    for (const value of [NaN, Infinity, -Infinity, 0.1 + 0.2, {}, [], undefined]) {
      await assert.rejects(service.create('alice', { ...dto, preco_diaria: value }), { status: 400 });
    }
  });
  await t.test('rejects other owners, missing and inactive vehicles', async () => {
    for (const veiculo_id of [vehicles[1].id, randomUUID()]) {
      assert.equal((await request('', 'POST', { ...dto, veiculo_id })).status, 404);
    }
    assert.equal((await request('', 'POST', { ...dto, veiculo_id: vehicles[2].id })).status, 409);
  });
  await t.test('creates pending vehicle drafts, allows multiple drafts and preserves decimals', async () => {
    const created = await request('', 'POST', { ...dto, descricao: '  ', valor_caucao: '9999999999.99', preco_seguro_dia: 0.1 });
    assert.equal(created.status, 201);
    const row = await created.json(); id = row.id;
    assert.equal(row.status, 'RASCUNHO'); assert.equal(row.titulo, 'Meu carro'); assert.equal(row.descricao, null);
    assert.equal(row.preco_diaria, '123.45'); assert.equal(row.valor_caucao, '9999999999.99');
    assert.equal(row.preco_seguro_dia, '0.10'); assert.equal(row.aceite_automatico, false);
    assert.equal(row.veiculo.proprietario_id, undefined); assert.equal(row.veiculo.placa, undefined);
    assert.ok(rows[0].preco_diaria instanceof Prisma.Decimal);
    assert.equal((await request('', 'POST', { ...dto, titulo: 'Segundo', preco_diaria: '20.01' })).status, 201);
    assert.equal((await request('', 'POST', { ...dto, veiculo_id: vehicles[1].id }, 'bob')).status, 201);
  });
  await t.test('private reads, bounded pagination and deterministic ordering', async () => {
    const data = await (await request('/meus?page=2&limit=1&orderBy=preco_diaria&order=asc')).json();
    assert.equal(data.total, 2); assert.equal(data.page, 2); assert.equal(data.limit, 1);
    assert.equal(data.items[0].id, id);
    assert.deepEqual(lastQuery.orderBy, [{ preco_diaria: 'asc' }, { id: 'asc' }]);
    assert.equal((await (await request('/meus', 'GET', undefined, 'bob')).json()).total, 1);
    assert.equal((await request(`/meus/${id}`)).status, 200);
    assert.equal((await request(`/meus/${id}`, 'GET', undefined, 'bob')).status, 404);
    assert.equal((await request(`/meus/${randomUUID()}`)).status, 404);
    for (const query of ['page=0', 'page=100001', 'limit=101', 'limit=0', 'page=1.5', 'orderBy=status', 'order=bad', 'proprietario_id=bob']) {
      assert.equal((await request(`/meus?${query}`)).status, 400, query);
    }
    assert.equal((await request('/meus/bad')).status, 400);
    assert.equal((await request('/bad', 'PATCH', {})).status, 400);
  });
  await t.test('updates only allowed fields and only own drafts', async () => {
    assert.equal((await request(`/${id}`, 'PATCH', { titulo: 'Novo' }, 'bob')).status, 404);
    assert.equal((await request(`/${randomUUID()}`, 'PATCH', { titulo: 'Novo' })).status, 404);
    for (const body of [{}, { veiculo_id: vehicles[1].id }, { status: 'ATIVO' }, { proprietario_id: 'bob' },
      { criado_em: new Date() }, { id }, { titulo: null }, { titulo: ' ' }, { preco_diaria: 0 },
      { valor_caucao: -1 }, { preco_seguro_dia: '0.001' }, { aceite_automatico: 'true' }]) {
      assert.equal((await request(`/${id}`, 'PATCH', body)).status, 400, JSON.stringify(body));
    }
    const updated = await request(`/${id}`, 'PATCH', { titulo: ' Novo ', descricao: ' texto ', preco_diaria: '9999999999.99',
      valor_caucao: 0, preco_seguro_dia: '0.01', aceite_automatico: true });
    assert.equal(updated.status, 200);
    const row = await updated.json(); assert.equal(row.preco_diaria, '9999999999.99');
    assert.equal(row.descricao, 'texto'); assert.equal(row.titulo, 'Novo'); assert.equal(row.aceite_automatico, true);
    assert.equal((await request(`/${id}`, 'PATCH', { descricao: null })).status, 200);
  });
  await t.test('logical close is idempotent, preserves vehicle/photos and blocks late edits', async () => {
    const vehicleSnapshot = structuredClone(vehicles), photoSnapshot = structuredClone(photos), count = rows.length;
    assert.equal((await request(`/${id}/encerrar`, 'PATCH', undefined, 'bob')).status, 404);
    assert.equal((await request(`/${randomUUID()}/encerrar`, 'PATCH')).status, 404);
    assert.equal((await request(`/${id}/encerrar`, 'PATCH', { status: 'ENCERRADO' })).status, 400);
    const beforeTitle = rows[0].titulo;
    // Delay an edit until a concurrent close has completed. Predicate must be checked at write time.
    beforeUpdate = () => service.close('alice', id);
    await assert.rejects(service.update('alice', id, { titulo: 'Too late' }), { status: 409 });
    assert.equal(rows[0].titulo, beforeTitle); assert.equal(rows[0].status, 'ENCERRADO');
    for (let i = 0; i < 2; i++) {
      const response = await request(`/${id}/encerrar`, 'PATCH'); assert.equal(response.status, 200);
      assert.equal((await response.json()).status, 'ENCERRADO');
    }
    assert.equal((await request(`/${id}`, 'PATCH', { titulo: 'Outra' })).status, 409);
    assert.equal(rows.length, count); assert.deepEqual(vehicles, vehicleSnapshot); assert.deepEqual(photos, photoSnapshot);
  });
  await t.test('active and paused announcements cannot be edited or closed', async () => {
    for (const status of ['ATIVO', 'PAUSADO']) {
      rows[1].status = status;
      assert.equal((await request(`/${rows[1].id}`, 'PATCH', { titulo: 'Outra' })).status, 409);
      assert.equal((await request(`/${rows[1].id}/encerrar`, 'PATCH')).status, 409);
      assert.equal(rows[1].status, status);
    }
  });
});
