import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { Module, UnauthorizedException } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Prisma } from '@prisma/client';
import sharp from 'sharp';
import { FotosService } from '../src/veiculos/fotos/fotos.service.ts';
import { FotosController } from '../src/veiculos/fotos/fotos.controller.ts';
import { PhotoConfig } from '../src/veiculos/fotos/photo.config.ts';
import { StorageService } from '../src/veiculos/fotos/storage.service.ts';
import { validateImage } from '../src/veiculos/fotos/validate-image.ts';
import { JwtAuthGuard } from '../src/auth/guards/jwt-auth.guard.ts';
import { AuthService } from '../src/auth/auth.service.ts';
import { UploadBudgetInterceptor } from '../src/veiculos/fotos/upload-budget.interceptor.ts';
import { Subject } from 'rxjs';
import { VeiculosController } from '../src/veiculos/veiculos.controller.ts';
import { ServiceUnavailableException } from '@nestjs/common';

const id = randomUUID();
const image = async (format = 'png', seed = 1) => ({ buffer: await sharp({ create: { width: 4, height: 4, channels: 3, background: { r: seed, g: 50, b: 70 } } }).toFormat(format).toBuffer(), mimetype: `image/${format}` });
function fixture() {
  let photos = [], operations = [], tail = Promise.resolve();
  const vehicle = { id, proprietario_id: 'alice', desativado_em: null, status_cadastro: 'PENDENTE' };
  const flags = { failCreate: false, failUpload: false, failRemove: false, failSign: false };
  const matches = (r, w = {}) => Object.entries(w).every(([k, v]) => v && typeof v === 'object' && 'in' in v ? v.in.includes(r[k]) : r[k] === v);
  const db = {
    veiculo: { async findFirst({ where }) { return matches(vehicle, where) ? { ...vehicle } : null; }, async findMany({ where }) { return matches(vehicle, where) ? [{ id }] : []; } },
    foto_veiculo: {
      async findMany({ where = {}, orderBy } = {}) { const rows = photos.filter(p => matches(p, where)).map(p => ({ ...p })); return orderBy ? rows.sort((a, b) => a.ordem - b.ordem || a.id.localeCompare(b.id)) : rows; },
      async findFirst({ where }) { return photos.find(p => matches(p, where)) ?? null; },
      async create({ data }) { if (flags.failCreate) throw new Error('persistence failed'); const row = { criado_em: new Date(), descricao: null, ...data }; photos.push(row); return row; },
      async updateMany({ where, data }) { photos.filter(p => matches(p, where)).forEach(p => Object.assign(p, data)); },
      async update({ where, data }) { const row = photos.find(p => matches(p, where)); Object.assign(row, data); return row; },
      async delete({ where }) { photos = photos.filter(p => !matches(p, where)); },
    },
    async $queryRaw(strings, ...args) {
      const { sql, values } = Prisma.sql(strings, ...args);
      if (sql.includes('FROM veiculo')) return [{ id }];
      if (sql.includes('LIMIT 0')) return [];
      let rows = operations;
      if (sql.includes('veiculo_id =')) rows = rows.filter(p => p.veiculo_id === values[0]);
      if (sql.includes("estado = 'UPLOAD'")) rows = rows.filter(p => p.estado === 'UPLOAD');
      if (sql.includes("estado = 'LIMPEZA'")) rows = rows.filter(p => p.estado === 'LIMPEZA');
      if (sql.includes('interval')) rows = rows.filter(p => p.expired);
      if (sql.includes('id::text IN')) rows = rows.filter(p => values.includes(p.id));
      return rows.map(p => ({ ...p }));
    },
    async $executeRaw(strings, ...args) {
      const { sql, values: v } = Prisma.sql(strings, ...args);
      if (sql.startsWith('INSERT')) operations.push({ id: v[0], veiculo_id: v[1], caminho: v[2], conteudo_hash: v[3] ?? null, tombstone: sql.includes("'UPLOAD'"), estado: sql.includes("'UPLOAD'") ? 'UPLOAD' : 'LIMPEZA' });
      if (sql.startsWith('UPDATE')) operations.filter(p => v.includes(p.id)).forEach(p => { p.estado = 'LIMPEZA'; p.conteudo_hash = null; });
      if (sql.startsWith('DELETE')) operations = operations.filter(p => !v.includes(p.id) || (sql.includes('confirmar_apos') && p.tombstone && !p.expired));
      return 1;
    },
    async $transaction(fn) {
      const before = tail; let release; tail = new Promise(r => { release = r; }); await before;
      const oldPhotos = structuredClone(photos), oldOps = structuredClone(operations);
      try { return await fn(db); } catch (err) { photos = oldPhotos; operations = oldOps; throw err; } finally { release(); }
    },
  };
  const objects = new Set();
  const storage = {
    assertPath: StorageService.prototype.assertPath,
    async upload(path) { if (flags.failUpload) throw new Error('storage failed'); objects.add(path); },
    async remove(path) { if (flags.failRemove) throw new Error('remove failed'); objects.delete(path); },
    async sign(paths) { if (flags.failSign) throw new Error('sign failed'); return new Map(paths.map(path => [path, `https://test.invalid/${path}?temporary=1`])); },
  };
  const service = new FotosService(db, storage, new PhotoConfig());
  return { service, db, storage, flags, objects, vehicle, photos: () => photos, operations: () => operations };
}

test('full image decoding, MIME verification, corruption, size and dimension limits', async () => {
  for (const type of ['jpeg', 'png', 'webp']) assert.equal((await validateImage(await image(type), 5 * 1024 * 1024)).mime, `image/${type}`);
  await assert.rejects(validateImage({ buffer: Buffer.alloc(5 * 1024 * 1024 + 1), mimetype: 'image/jpeg' }, 5 * 1024 * 1024), { status: 413 });
  await assert.rejects(validateImage({ buffer: Buffer.from('<svg/>'), mimetype: 'image/svg+xml' }, 100), { status: 415 });
  await assert.rejects(validateImage({ ...await image(), mimetype: 'image/jpeg' }, 10000), { status: 415 });
  await assert.rejects(validateImage({ buffer: Buffer.from('not an image'), mimetype: 'image/png' }, 10000), { status: 400 });
  const valid = await image('jpeg');
  await assert.rejects(validateImage({ ...valid, buffer: valid.buffer.subarray(0, valid.buffer.length - 30) }, 10000), { status: 400 });
  const large = await sharp({ create: { width: 5000, height: 5000, channels: 3, background: 'red' } }).png().toBuffer();
  await assert.rejects(validateImage({ buffer: large, mimetype: 'image/png' }, 5 * 1024 * 1024), { status: 400 });
});

test('ownership, missing vehicles, private historical access and disabled mutations', async () => {
  const f = fixture();
  await assert.rejects(f.service.list('bob', id), { status: 404 });
  await assert.rejects(f.service.list('alice', randomUUID()), { status: 404 });
  await assert.rejects(f.service.upload('bob', id, [await image()]), { status: 404 });
  await f.service.upload('alice', id, [await image()]);
  f.vehicle.desativado_em = new Date();
  assert.equal((await f.service.list('alice', id)).length, 1);
  for (const action of [() => f.service.upload('alice', id, []), () => f.service.principal('alice', id, randomUUID()), () => f.service.reorder('alice', id, []), () => f.service.remove('alice', id, randomUUID())]) await assert.rejects(action(), { status: 409 });
});

test('uploads, deduplication, principal swaps, complete reorder and deterministic deletion', async () => {
  const f = fixture();
  let rows = await f.service.upload('alice', id, [await image('jpeg', 1), await image('png', 2), await image('webp', 3)]);
  assert.equal(rows.length, 3); assert.equal(rows[0].principal, true);
  assert.equal(rows[0].arquivo_url, undefined); assert.equal(rows[0].conteudo_hash, undefined);
  assert.match(rows[0].url, /temporary/); assert.ok(Date.parse(rows[0].expira_em) > Date.now());
  assert.equal(f.vehicle.status_cadastro, 'PENDENTE');
  await assert.rejects(f.service.upload('alice', id, [await image('jpeg', 1)]), { status: 409 });
  await assert.rejects(f.service.reorder('alice', id, [rows[0].id, rows[0].id, rows[2].id]), { status: 400 });
  await assert.rejects(f.service.reorder('alice', id, [randomUUID(), rows[1].id, rows[2].id]), { status: 400 });
  await assert.rejects(f.service.principal('alice', id, randomUUID()), { status: 404 });
  await Promise.all([f.service.principal('alice', id, rows[1].id), f.service.principal('alice', id, rows[2].id)]);
  assert.equal(f.photos().filter(p => p.principal).length, 1);
  rows = await f.service.reorder('alice', id, rows.map(p => p.id).reverse());
  assert.equal(rows[0].principal, true);
  await f.service.remove('alice', id, rows[0].id);
  assert.equal(f.photos().find(p => p.principal).id, rows[1].id);
  assert.deepEqual((await f.service.list('alice', id)).map(p => p.ordem), [1, 2]);
  await f.service.remove('alice', id, rows[0].id); // repeated deletion
  assert.equal(f.objects.size, 2);
  const refreshed = await f.service.list('alice', id); assert.equal(refreshed.length, 2);
  for (const photo of refreshed) await f.service.remove('alice', id, photo.id);
  assert.deepEqual(await f.service.list('alice', id), []); assert.equal(f.objects.size, 0);
});

test('concurrent reservations cannot exceed ten or duplicate content', async () => {
  const f = fixture();
  const files = await Promise.all(Array.from({ length: 12 }, (_, i) => image('png', i + 1)));
  const results = await Promise.allSettled(files.map(file => f.service.upload('alice', id, [file])));
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 10);
  assert.equal(f.photos().length, 10); assert.equal(f.photos().filter(p => p.principal).length, 1);
  const g = fixture();
  const same = await image();
  const duplicate = await Promise.allSettled([g.service.upload('alice', id, [same]), g.service.upload('alice', id, [same])]);
  assert.equal(duplicate.filter(r => r.status === 'fulfilled').length, 1);
});

test('durable compensation, deletion retries, orphan reconciliation and signing errors', async () => {
  const f = fixture(); f.flags.failUpload = true;
  await assert.rejects(f.service.upload('alice', id, [await image()])); assert.equal(f.photos().length, 0); assert.equal(f.operations().length, 1);
  f.operations().forEach(op => { op.expired = true; }); await f.service.reconcile(); assert.equal(f.operations().length, 0);
  f.flags.failUpload = false; f.flags.failCreate = true; f.flags.failRemove = true;
  await assert.rejects(f.service.upload('alice', id, [await image()]));
  assert.equal(f.photos().length, 0); assert.equal(f.objects.size, 1); assert.equal(f.operations()[0].estado, 'LIMPEZA');
  f.flags.failRemove = false; await f.service.reconcile(); assert.equal(f.operations().length, 1); assert.equal(f.objects.size, 0);
  // Simulate a timed-out remote upload materializing after the first compensation.
  f.objects.add(f.operations()[0].caminho);
  f.operations().forEach(op => { op.expired = true; }); await f.service.reconcile(); assert.equal(f.operations().length, 0); assert.equal(f.objects.size, 0);
  f.flags.failCreate = false; let rows = await f.service.upload('alice', id, [await image()]);
  f.flags.failSign = true; await assert.rejects(f.service.list('alice', id)); f.flags.failSign = false;
  f.flags.failRemove = true; await f.service.remove('alice', id, rows[0].id);
  assert.equal(f.photos().length, 0); assert.equal(f.operations().length, 1);
  f.flags.failRemove = false; await f.service.reconcile(); assert.equal(f.objects.size, 0);
  await assert.rejects(async () => f.storage.assertPath('../../someone-else.png'), { status: 503 });
  const abandoned = { id: randomUUID(), veiculo_id: id, caminho: `${id}/${randomUUID()}.png`, conteudo_hash: 'abandoned', estado: 'UPLOAD', expired: true, tombstone: true };
  f.operations().push(abandoned); f.objects.add(abandoned.caminho);
  await f.service.reconcile(); assert.equal(f.objects.size, 0); assert.equal(f.operations().length, 0);
});

test('stored paths cannot authorize access to a different vehicle object', async () => {
  const f = fixture(); const rows = await f.service.upload('alice', id, [await image()]);
  f.photos()[0].arquivo_url = `${randomUUID()}/${randomUUID()}.png`;
  await assert.rejects(f.service.list('alice', id), { status: 503 });
  await assert.rejects(f.service.remove('alice', id, rows[0].id), { status: 409 });
  assert.equal(f.photos().length, 1);
});

test('storage wrapper batches short-lived signed URLs and hides upstream details', async () => {
  const service = Object.create(StorageService.prototype);
  service.config = { bucket: 'veiculos-fotos', ttl: 300 };
  const path = `${id}/${randomUUID()}.png`;
  const calls = [];
  service.client = { storage: { from(bucket) { assert.equal(bucket, 'veiculos-fotos'); return {
    async upload(p, buffer, options) { calls.push(['upload', p, options]); return { error: null }; },
    async remove(paths) { calls.push(['remove', paths]); return { error: null }; },
    async createSignedUrls(paths, ttl) { calls.push(['sign', paths, ttl]); return { data: paths.map(p => ({ path: p, signedUrl: 'https://test.invalid/temporary' })), error: null }; },
  }; } } };
  await service.upload(path, Buffer.from('test'), 'image/png');
  assert.equal(calls[0][2].upsert, false);
  assert.equal((await service.sign([path])).get(path), 'https://test.invalid/temporary');
  assert.deepEqual(calls[1], ['sign', [path], 300]);
  await service.remove(path);
  service.client = { storage: { from() { return { async createSignedUrls() { throw new Error('secret upstream diagnostic'); } }; } } };
  await assert.rejects(service.sign([path]), error => error.status === 503 && !error.message.includes('secret'));
  service.client = undefined;
  await assert.rejects(service.upload(path, Buffer.alloc(1), 'image/png'), { status: 503 });
  await assert.rejects(service.sign(['../../arbitrary']), { status: 503 });
});

test('multipart memory budget rejects bursts and releases slots on completion/error', () => {
  const interceptor = new UploadBudgetInterceptor();
  const first = new Subject(), second = new Subject();
  interceptor.intercept({}, { handle: () => first }).subscribe({ error() {} });
  interceptor.intercept({}, { handle: () => second }).subscribe({ error() {} });
  assert.throws(() => interceptor.intercept({}, { handle: () => first }), { status: 409 });
  first.complete(); second.error(new Error('parser failed'));
  const next = new Subject();
  const subscription = interceptor.intercept({}, { handle: () => next }).subscribe(); subscription.unsubscribe();
});

test('owner covers are batched and storage outages preserve vehicle CRUD listing', async () => {
  const f = fixture(); await f.service.upload('alice', id, [await image()]);
  const calls = []; const sign = f.storage.sign;
  f.storage.sign = async paths => { calls.push(paths); return sign(paths); };
  assert.equal(Object.keys(await f.service.covers('bob', [id])).length, 0);
  calls.length = 0;
  const covers = await f.service.covers('alice', [id]);
  assert.equal(covers[id].principal, true); assert.equal(calls.length, 1); assert.equal(calls[0].length, 1);
  const controller = new VeiculosController({ async mine() { return { items: [{ id }], total: 1 }; } }, {
    async covers() { throw new ServiceUnavailableException(); },
  });
  const listing = await controller.mine({ id: 'alice' }, { page: 1, limit: 20 });
  assert.equal(listing.total, 1); assert.equal(listing.fotos_indisponiveis, true); assert.equal(listing.items[0].foto_principal, null);
});

test('photo HTTP guard, UUID/DTO validation, multipart limits and public restriction', async t => {
  const f = fixture();
  class TestModule {}
  Module({ controllers: [FotosController], providers: [JwtAuthGuard, { provide: FotosService, useValue: f.service }, { provide: AuthService, useValue: { authenticate: async token => {
    if (!['alice', 'bob'].includes(token)) throw new UnauthorizedException(); return { id: token };
  } } }] })(TestModule);
  const app = await NestFactory.create(TestModule, { logger: false });
  await app.listen(0, '127.0.0.1'); t.after(() => app.close());
  const base = `${await app.getUrl()}/veiculos/${id}/fotos`;
  const req = (suffix = '', options = {}, token = 'alice') => fetch(base + suffix, { ...options, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...options.headers } });
  for (const [method, suffix] of [['GET', ''], ['POST', ''], ['PATCH', '/ordem'], ['PATCH', `/${randomUUID()}/principal`], ['DELETE', `/${randomUUID()}`]]) assert.equal((await req(suffix, { method }, null)).status, 401);
  assert.equal((await req('', {}, 'bob')).status, 404);
  assert.equal((await req('/ordem', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: [randomUUID(), randomUUID()], proprietario_id: 'alice' }) })).status, 400);
  const upload = async (file, name = 'fotos') => { const form = new FormData(); form.append(name, new Blob([file.buffer], { type: file.mimetype }), 'unsafe-name.png'); return req('', { method: 'POST', body: form }); };
  assert.equal((await upload(await image())).status, 201);
  const listed = await req(); assert.equal(listed.headers.get('cache-control'), 'no-store'); assert.equal((await listed.json()).length, 1);
  assert.equal((await upload({ buffer: Buffer.alloc(5 * 1024 * 1024 + 1), mimetype: 'image/png' })).status, 413);
  assert.equal((await upload({ buffer: Buffer.from('bad'), mimetype: 'image/png' })).status, 400);
  assert.equal((await upload(await image(), 'path')).status, 400);
  assert.equal((await upload({ buffer: Buffer.from('<svg/>'), mimetype: 'image/svg+xml' })).status, 415);
});
