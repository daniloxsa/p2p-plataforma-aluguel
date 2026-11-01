import 'reflect-metadata';
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Prisma } from '@prisma/client';
import { CatalogoService } from '../src/catalogo/catalogo.service.ts';
import { CatalogoController } from '../src/catalogo/catalogo.controller.ts';
import { StorageService } from '../src/veiculos/fotos/storage.service.ts';
import { VeiculosService } from '../src/veiculos/veiculos.service.ts';

function fixture() {
  const vehicleId = randomUUID(), photoId = randomUUID();
  const row = { id: randomUUID(), titulo: 'Toyota real', descricao: 'Descrição', criado_em: new Date(),
    preco_diaria: new Prisma.Decimal('1234567890.99'), valor_caucao: new Prisma.Decimal('0.01'), preco_seguro_dia: new Prisma.Decimal('25.10'),
    // Deliberately over-return private fields: presentation must still whitelist.
    veiculo_id: vehicleId, status: 'ATIVO', usuario: { cpf: 'secret' },
    veiculo: { id: vehicleId, placa: 'SECRET', proprietario_id: randomUUID(), marca: 'Toyota', modelo: 'Yaris',
      ano_fabricacao: 2022, ano_modelo: 2023, categoria: 'Hatch', cambio: 'Manual', combustivel: 'Flex', quantidade_lugares: 5,
      foto_veiculo: [{ id: photoId, arquivo_url: `${vehicleId}/${photoId}.jpg`, conteudo_hash: 'a'.repeat(64), descricao: null }] } };
  const queries = [], signs = [], projections = [];
  let available = true;
  const db = { async $transaction(fn, options) { assert.equal(options.isolationLevel, 'RepeatableRead'); return fn(db); },
    async $queryRaw(sql) { queries.push(sql); return sql.sql.includes('count(*)') ? [{ total: available ? 1n : 0n }] : available ? [{ id: row.id }] : []; },
    anuncio: {
      async findMany(options) { projections.push(options.select); return [row]; },
      async findUnique(options) { projections.push(options.select); return row; },
    } };
  const storage = { assertPath: StorageService.prototype.assertPath,
    async signPublicPhotos(paths) { signs.push(paths); return new Map(paths.map((path, i) => [path, `https://images.test/${i}?token=short`])); } };
  return { row, queries, signs, projections, storage, service: new CatalogoService(db, storage), unavailable: () => { available = false; } };
}

test('catalog: exact decimal public whitelist, bounded projection and one signing batch', async () => {
  const f = fixture(), list = await f.service.list({});
  assert.equal(list.items[0].preco_diaria, '1234567890.99'); assert.equal(list.items[0].valor_caucao, '0.01');
  assert.deepEqual([list.total, list.page, list.limit, list.pages], [1, 1, 12, 1]);
  assert.equal(f.signs.length, 1); assert.equal(f.signs[0].length, 1);
  assert.ok(Date.parse(list.items[0].fotos[0].expira_em) - Date.now() <= 60000);
  for (const forbidden of ['placa', 'proprietario_id', 'arquivo_url', 'conteudo_hash', 'documento_veiculo', 'usuario', 'veiculo_id', 'status'])
    assert.ok(!JSON.stringify(list).includes(`"${forbidden}"`), forbidden);
  assert.equal(f.projections[0].veiculo.select.foto_veiculo.take, 10);
  assert.equal(f.projections[0].veiculo.select.placa, undefined);
  assert.equal(f.projections[0].veiculo.select.documento_veiculo, undefined);
  const detail = await f.service.detail(f.row.id); assert.equal(detail.descricao, 'Descrição');
});

test('catalog: search/filter values stay parameters, literal LIKE escaping, allowlisted stable ordering and bounded pagination', async () => {
  const f = fixture(), q = "x%_' OR 1=1 --";
  await f.service.list({ q, categoria: 'SUV', cambio: 'Manual', combustivel: 'Flex', preco_min: '0.01', preco_max: '999.99', page: '2', limit: '24', ordem: 'menor_preco' });
  const sql = f.queries[1];
  assert.ok(!sql.sql.includes(q)); assert.ok(sql.values.includes("%x\\%\\_' OR 1=1 --%"));
  for (const value of ['SUV', 'Manual', 'Flex', '0.01', '999.99']) assert.ok(sql.values.includes(value));
  assert.match(sql.sql, /ORDER BY a.preco_diaria ASC, a.id ASC/); assert.deepEqual(sql.values.slice(-2), [24, 24]);
  assert.match(sql.sql, /newer.criado_em, newer.id/); assert.match(sql.sql, /d.validade_ate >=/);
  assert.match(sql.sql, /a.status = 'ATIVO'/); assert.match(sql.sql, /v.status_cadastro = 'APROVADO'/);
});

test('catalog: strict invalid queries reject before database/storage', async () => {
  for (const input of [{ page: '0' }, { page: '1e2' }, { page: '10001' }, { limit: '25' }, { limit: ['1'] },
    { q: ['Toyota'] }, { q: ' '.repeat(5) }, { q: 'x'.repeat(101) }, { categoria: 'x'.repeat(51) },
    { cambio: {} }, { preco_min: '-1' }, { preco_min: '1.001' }, { preco_max: '1e3' }, { preco_min: 2 },
    { preco_min: '2', preco_max: '1' }, { ordem: 'DROP TABLE' }, { cidade: 'São Paulo' }, { status: 'PAUSADO' }]) {
    const f = fixture(); await assert.rejects(f.service.list(input), { status: 400 }, JSON.stringify(input)); assert.equal(f.queries.length, 0);
  }
});

test('catalog: unavailable details return 404, empty page is stable and does not sign anything', async () => {
  const f = fixture(); f.unavailable();
  await assert.rejects(f.service.detail(randomUUID()), { status: 404 });
  await assert.rejects(f.service.detail('not-an-id'), { status: 404 });
  assert.deepEqual(await f.service.list({}), { items: [], total: 0, page: 1, limit: 12, pages: 0 });
  assert.equal(f.signs.length, 1); assert.deepEqual(f.signs[0], []);
});

test('catalog: gallery bounded, cover only in list, foreign/legacy/unvalidated photos excluded, outages degrade safely', async () => {
  const f = fixture();
  const good = f.row.veiculo.foto_veiculo[0];
  f.row.veiculo.foto_veiculo.push({ ...good, id: randomUUID(), arquivo_url: `${f.row.veiculo.id}/${randomUUID()}.png` },
    { ...good, arquivo_url: `${randomUUID()}/${randomUUID()}.jpg` }, { ...good, arquivo_url: 'https://legacy/private' }, { ...good, conteudo_hash: null });
  assert.equal((await f.service.list({})).items[0].fotos.length, 1);
  assert.equal((await f.service.detail(f.row.id)).fotos.length, 2);
  f.storage.signPublicPhotos = async () => { throw Error('secret provider diagnostic'); };
  const detail = await f.service.detail(f.row.id); assert.deepEqual(detail.fotos, []); assert.ok(!JSON.stringify(detail).includes('diagnostic'));
});

test('catalog HTTP: anonymous GET list/detail, strict validation, 404 and no-store', async t => {
  const f = fixture();
  class TestModule {}
  Module({ controllers: [CatalogoController], providers: [{ provide: CatalogoService, useValue: f.service }] })(TestModule);
  const app = await NestFactory.create(TestModule, { logger: false }); t.after(() => app.close());
  app.setGlobalPrefix('api'); await app.listen(0, '127.0.0.1'); const url = `${await app.getUrl()}/api/catalogo/anuncios`;
  for (const path of ['', `/${f.row.id}`]) { const res = await fetch(url + path); assert.equal(res.status, 200); assert.equal(res.headers.get('cache-control'), 'no-store'); }
  for (const query of ['limit=25', 'page=1&page=2', 'q[]=Toyota', 'preco_min=1.001', 'ordem=criado_em', 'cidade=X']) assert.equal((await fetch(`${url}?${query}`)).status, 400, query);
  assert.equal((await fetch(`${url}/invalid`)).status, 404); f.unavailable(); assert.equal((await fetch(`${url}/${f.row.id}`)).status, 404);
});

test('public photo signing: private bucket checked, fixed 60s TTL, one batch and partial errors', async () => {
  const calls = [], paths = [`${randomUUID()}/${randomUUID()}.jpg`, `${randomUUID()}/${randomUUID()}.png`];
  let privateBucket = true, fail = false;
  const storage = Object.create(StorageService.prototype);
  storage.config = { bucket: 'private-photos', ttl: 900 };
  storage.client = { storage: { async getBucket(bucket) { calls.push(bucket); return { data: { public: !privateBucket } }; },
    from() { return { async createSignedUrls(received, ttl) { calls.push([received, ttl]); if (fail) throw Error('secret'); return { data: [{ path: paths[0], signedUrl: 'https://test/signed' }, { path: paths[1], error: 'missing' }] }; } }; } } };
  const result = await storage.signPublicPhotos(paths); assert.equal(result.size, 1); assert.deepEqual(calls, ['private-photos', [paths, 60]]);
  privateBucket = false; await assert.rejects(storage.signPublicPhotos(paths), { status: 503 });
  privateBucket = true; fail = true; await assert.rejects(storage.signPublicPhotos(paths), { status: 503 });
  await assert.rejects(storage.signPublicPhotos(['private-document.pdf']), { status: 503 });
});

test('legacy public vehicle endpoint shares catalog eligibility and keeps its public projection', async () => {
  const id = randomUUID(), anuncioId = randomUUID(); let eligible = false, queries = 0;
  const db = { async $transaction(fn) { return fn(db); }, async $queryRaw(sql) {
    queries++; assert.match(sql.sql, /newer.criado_em, newer.id/); assert.match(sql.sql, /v.desativado_em IS NULL/);
    assert.ok(sql.values.includes(id)); return eligible ? [{ id: anuncioId }] : [];
  }, veiculo: { async findFirst({ select }) { assert.equal(select.placa, undefined); return { id, marca: 'Toyota' }; } },
  anuncio: { async findFirst({ where, select }) { assert.equal(where.id, anuncioId); assert.equal(select.veiculo_id, undefined); return { id: anuncioId }; } } };
  const service = new VeiculosService(db); await assert.rejects(service.publicById(id), { status: 404 });
  eligible = true; assert.equal((await service.publicById(id)).anuncio.id, anuncioId); assert.equal(queries, 2);
});
