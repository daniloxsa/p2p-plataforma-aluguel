import 'reflect-metadata';
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PDFDocument } from 'pdf-lib';
import sharp from 'sharp';
import { Module, UnauthorizedException, ServiceUnavailableException } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { DocumentosService } from '../src/veiculos/documentos/documentos.service.ts';
import { DocumentosController } from '../src/veiculos/documentos/documentos.controller.ts';
import { DocumentConfig } from '../src/veiculos/documentos/document.config.ts';
import { validateDocument } from '../src/veiculos/documentos/validate-document.ts';
import { PrismaService } from '../src/prisma/prisma.service.ts';
import { StorageService } from '../src/veiculos/fotos/storage.service.ts';
import { UploadBudgetInterceptor } from '../src/veiculos/fotos/upload-budget.interceptor.ts';
import { AuthService } from '../src/auth/auth.service.ts';
import { JwtAuthGuard } from '../src/auth/guards/jwt-auth.guard.ts';
import { AuthThrottlerGuard } from '../src/auth/guards/auth-throttler.guard.ts';
import { VehicleReviewService } from '../src/admin/vehicle-review.service.ts';

const max = 10 * 1024 * 1024;
async function pdfFile() { const pdf = await PDFDocument.create(); pdf.addPage(); return { buffer: Buffer.from(await pdf.save()), originalname: 'crlv.pdf', mimetype: 'application/pdf' }; }
function fixture() {
  const owner = randomUUID(), id = randomUUID(), docs = [];
  const vehicle = { id, proprietario_id: owner, status_cadastro: 'PENDENTE', desativado_em: null };
  let tail = Promise.resolve(), failSave = false, failCheck = false;
  const db = {
    veiculo: { async findFirst({ where }) { return where.id === id && where.proprietario_id === owner ? { ...vehicle } : null; } },
    documento_veiculo: {
      async findFirst({ where, select }) { const doc = docs.filter(d => d.veiculo_id === where.veiculo_id && (!where.id || d.id === where.id)).at(-1); return doc ? select ? Object.fromEntries(Object.keys(select).map(k => [k, doc[k]])) : { ...doc } : null; },
      async findUnique({ where }) { if (failCheck) throw Error('database unavailable'); return docs.find(d => d.id === where.id) || null; },
      async create({ data }) { if (failSave) throw Error('persistence failed'); docs.push({ validade_ate: null, motivo_rejeicao: null, ...data }); },
    },
    async $queryRaw() { return []; },
    async $transaction(fn) { const previous = tail; let release; tail = new Promise(r => { release = r; }); await previous; const snapshot = structuredClone(docs); try { return await fn(db); } catch (e) { docs.splice(0, docs.length, ...snapshot); throw e; } finally { release(); } },
  };
  const calls = { upload: [], remove: [], sign: [] };
  const storage = {
    async uploadDocument(...args) { calls.upload.push(args); },
    async removeDocument(...args) { calls.remove.push(args); },
    async signDocument(...args) { calls.sign.push(args); return { url: 'https://test.invalid/signed', expira_em: new Date(Date.now() + 300000).toISOString() }; },
  };
  return { owner, id, vehicle, docs, db, storage, calls, service: new DocumentosService(db, storage, { maxBytes: max }), failSave: () => { failSave = true; }, failCheck: () => { failCheck = true; } };
}
test('documents validation: real PDF and fully decoded images; malformed and mismatched content rejected', async () => {
  assert.equal((await validateDocument(await pdfFile(), max)).extension, 'pdf');
  for (const [extension, mimetype] of [['png','image/png'],['jpg','image/jpeg'],['webp','image/webp']]) {
    const buffer = await sharp({ create: { width: 4, height: 4, channels: 3, background: 'red' } }).toFormat(extension === 'jpg' ? 'jpeg' : extension).toBuffer();
    assert.equal((await validateDocument({ buffer, originalname: `car.${extension}`, mimetype }, max)).extension, extension);
  }
  const valid = await pdfFile();
  for (const invalid of [undefined, { ...valid, buffer: Buffer.alloc(0) }, { ...valid, buffer: Buffer.alloc(max + 1) },
    { ...valid, mimetype: 'image/png' }, { ...valid, originalname: 'x.exe' }, { ...valid, originalname: 'x.png', mimetype: 'image/png' },
    { ...valid, buffer: Buffer.from('%PDF-1.7\ninvalid\n%%EOF') }, { ...valid, buffer: Buffer.from('<html/>') }]) {
    await assert.rejects(validateDocument(invalid, max), error => [400,413].includes(error.status));
  }
});
test('documents upload: pending canonical reference, private projection, authorized access', async () => {
  const f = fixture(); const result = await f.service.upload(f.owner, f.id, await pdfFile());
  assert.equal(result.documento.status_validacao, 'PENDENTE'); assert.equal(result.pode_enviar, false);
  assert.equal(f.docs.length, 1); assert.equal(f.docs[0].arquivo_url, `${f.id}/${f.docs[0].id}.pdf`);
  assert.equal(result.documento.arquivo_url, undefined);
  assert.ok((await f.service.file(f.owner, f.id, f.docs[0].id)).url);
  await assert.rejects(f.service.file(randomUUID(), f.id, f.docs[0].id), { status: 404 });
  await assert.rejects(f.service.file(f.owner, randomUUID(), f.docs[0].id), { status: 404 });
  await assert.rejects(f.service.file(f.owner, f.id, randomUUID()), { status: 404 });
  assert.equal(f.calls.sign.length, 1);
});
test('documents: ownership, nonexistent, inactive and approved vehicles reject upload before storage', async () => {
  for (const mode of ['other','missing','disabled','approved']) {
    const f = fixture(); if (mode === 'disabled') f.vehicle.desativado_em = new Date(); if (mode === 'approved') f.vehicle.status_cadastro = 'APROVADO';
    await assert.rejects(f.service.upload(mode === 'other' ? randomUUID() : f.owner, mode === 'missing' ? randomUUID() : f.id, await pdfFile()), { status: ['other','missing'].includes(mode) ? 404 : 409 });
    assert.equal(f.calls.upload.length, 0);
  }
});
test('documents: resend only after rejection or expiry; old records preserved and newer pending', async () => {
  for (const status of ['REJEITADO','EXPIRADO','APROVADO','PENDENTE','EM_ANALISE']) {
    const f = fixture(); f.docs.push({ id: randomUUID(), veiculo_id: f.id, tipo: 'CRLV', status_validacao: status, validade_ate: status === 'APROVADO' ? new Date('2099-01-01') : null, criado_em: new Date() });
    const old = { ...f.docs[0] };
    if (['REJEITADO','EXPIRADO'].includes(status)) { const result = await f.service.upload(f.owner, f.id, await pdfFile()); assert.equal(result.documento.status_validacao, 'PENDENTE'); assert.equal(f.docs.length, 2); assert.deepEqual(f.docs[0], old); assert.ok(f.docs[1].criado_em > old.criado_em); }
    else await assert.rejects(f.service.upload(f.owner, f.id, await pdfFile()), { status: 409 });
  }
  const f = fixture(); f.docs.push({ id: randomUUID(), veiculo_id: f.id, tipo: 'CRLV', status_validacao: 'APROVADO', validade_ate: new Date('2000-01-01'), criado_em: new Date() });
  assert.equal((await f.service.list(f.owner, f.id)).documento.status_validacao, 'EXPIRADO');
  await f.service.upload(f.owner, f.id, await pdfFile()); assert.equal(f.docs.length, 2);
});
test('documents: concurrent uploads persist exactly one new latest document', async () => {
  const f = fixture(), file = await pdfFile();
  const results = await Promise.allSettled([f.service.upload(f.owner, f.id, file), f.service.upload(f.owner, f.id, file)]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1); assert.equal(f.docs.length, 1); assert.equal(f.calls.upload.length, 1);
});
test('documents: storage/persistence/cleanup failures compensate safely, retaining previous records', async () => {
  for (const mode of ['storage','save','cleanup','uncertain']) {
    const f = fixture(); if (mode === 'storage') f.storage.uploadDocument = async () => { throw new ServiceUnavailableException(); }; else f.failSave();
    if (mode === 'cleanup') f.storage.removeDocument = async () => { throw Error('cleanup failed'); };
    if (mode === 'uncertain') f.failCheck();
    await assert.rejects(f.service.upload(f.owner, f.id, await pdfFile())); assert.equal(f.docs.length, 0);
    if (['save','storage'].includes(mode)) assert.equal(f.calls.remove.length, 1);
    if (mode === 'uncertain') assert.equal(f.calls.remove.length, 0);
  }
});
test('documents HTTP: JWT required, multipart contract and request throttling enforced', async t => {
  const f = fixture(); class TestModule {}
  Module({ imports: [ThrottlerModule.forRoot([{ ttl: 60000, limit: 30 }])], controllers: [DocumentosController], providers: [DocumentosService, JwtAuthGuard, AuthThrottlerGuard, UploadBudgetInterceptor,
    { provide: PrismaService, useValue: f.db }, { provide: StorageService, useValue: f.storage }, { provide: DocumentConfig, useValue: { maxBytes: max } },
    { provide: AuthService, useValue: { async authenticate(token) { if (!['owner','other'].includes(token)) throw new UnauthorizedException(); return { id: token === 'owner' ? f.owner : randomUUID() }; } } } ] })(TestModule);
  const app = await NestFactory.create(TestModule, { logger: false }); app.setGlobalPrefix('api'); await app.listen(0, '127.0.0.1'); t.after(() => app.close());
  const base = `${await app.getUrl()}/api/veiculos/${f.id}/documentos`;
  assert.equal((await fetch(base)).status, 401);
  assert.equal((await fetch(`${base}/crlv`, { method: 'POST' })).status, 401);
  assert.equal((await fetch(`${base}/${randomUUID()}/arquivo`)).status, 401);
  assert.equal((await fetch(base, { headers: { Authorization: 'Bearer other' } })).status, 404);
  assert.equal((await fetch(base, { headers: { Authorization: 'Bearer owner' } })).status, 200);
  const send = body => fetch(`${base}/crlv`, { method: 'POST', headers: { Authorization: 'Bearer owner' }, body });
  assert.equal((await send(new FormData())).status, 400);
  const bad = new FormData(); bad.append('proprietario_id', f.owner); assert.equal((await send(bad)).status, 400);
  const large = new FormData(); large.append('arquivo', new Blob([Buffer.alloc(max + 1)], { type: 'application/pdf' }), 'large.pdf'); assert.equal((await send(large)).status, 413);
  const file = await pdfFile(), body = new FormData(); body.append('arquivo', new Blob([file.buffer], { type: file.mimetype }), file.originalname);
  assert.equal((await send(body)).status, 201);
  assert.equal((await send(body)).status, 409);
  assert.equal((await send(body)).status, 429);
});
test('document storage: uploads require a configured private bucket and never overwrite', async () => {
  const previous = process.env.SUPABASE_VEHICLE_DOCUMENT_BUCKET;
  try {
    process.env.SUPABASE_VEHICLE_DOCUMENT_BUCKET = 'documents-test';
    const storage = Object.create(StorageService.prototype), vehicle = randomUUID(), doc = randomUUID(), path = `${vehicle}/${doc}.pdf`;
    let publicBucket = true, uploaded = 0;
    storage.client = { storage: { async getBucket() { return { data: { public: publicBucket } }; }, from(bucket) { assert.equal(bucket, 'documents-test'); return {
      async upload(actualPath, buffer, options) { uploaded++; assert.equal(actualPath, path); assert.equal(options.upsert, false); assert.equal(options.cacheControl, '0'); return {}; },
      async remove(paths) { assert.deepEqual(paths, [path]); return {}; },
    }; } } };
    await assert.rejects(storage.uploadDocument(vehicle, doc, path, Buffer.from('pdf'), 'application/pdf'), { status: 503 }); assert.equal(uploaded, 0);
    publicBucket = false; await storage.uploadDocument(vehicle, doc, path, Buffer.from('pdf'), 'application/pdf'); assert.equal(uploaded, 1);
    await storage.removeDocument(vehicle, doc, path);
    delete process.env.SUPABASE_VEHICLE_DOCUMENT_BUCKET;
    await assert.rejects(storage.uploadDocument(vehicle, doc, path, Buffer.from('pdf'), 'application/pdf'), { status: 503 });
  } finally { if (previous === undefined) delete process.env.SUPABASE_VEHICLE_DOCUMENT_BUCKET; else process.env.SUPABASE_VEHICLE_DOCUMENT_BUCKET = previous; }
});
test('documents and B.1 services: reject, resend, review latest and approve vehicle with history intact', async () => {
  const f = fixture(), history = [];
  f.db.veiculo.findUnique = async () => ({ ...f.vehicle });
  f.db.veiculo.updateMany = async ({ data }) => { Object.assign(f.vehicle, data); return { count: 1 }; };
  f.db.documento_veiculo.updateMany = async ({ where, data }) => {
    const row = f.docs.find(d => d.id === where.id && d.status_validacao === where.status_validacao);
    if (!row) return { count: 0 }; Object.assign(row, data); return { count: 1 };
  };
  f.db.historico_revisao_veiculo = { async create({ data }) { history.push(data); } };
  const photo = randomUUID(); f.db.foto_veiculo = { async findMany() { return [{ id: photo, arquivo_url: `${f.id}/${photo}.jpg`, conteudo_hash: 'a'.repeat(64) }]; } };
  f.storage.verifyDocument = async (vehicleId, id, reference) => { assert.equal(reference, `${vehicleId}/${id}.pdf`); assert.ok(f.docs.some(d => d.id === id)); };
  f.storage.verifyPhoto = async () => {};
  const review = new VehicleReviewService(f.db, f.storage), file = await pdfFile();
  const first = (await f.service.upload(f.owner, f.id, file)).documento;
  await review.decideDocument(f.owner, first.id, 'REJEITADO', { status_esperado: 'PENDENTE', justificativa: 'Arquivo de teste ilegível.' });
  assert.equal((await f.service.list(f.owner, f.id)).documento.motivo_rejeicao, 'Arquivo de teste ilegível.');
  const second = (await f.service.upload(f.owner, f.id, file)).documento;
  await assert.rejects(review.decideVehicle(f.owner, f.id, 'APROVADO', { status_esperado: 'PENDENTE' }), { status: 409 });
  await review.decideDocument(f.owner, second.id, 'APROVADO', { status_esperado: 'PENDENTE', validade_ate: '2099-12-31' });
  await review.decideVehicle(f.owner, f.id, 'APROVADO', { status_esperado: 'PENDENTE' });
  assert.equal(f.docs.length, 2); assert.equal(f.docs[0].status_validacao, 'REJEITADO'); assert.equal(history.length, 3);
  assert.equal((await f.service.list(f.owner, f.id)).pode_enviar, false);
});
test('documents: ambiguous commit acknowledgement never removes a persisted object', async () => {
  const f = fixture(), original = f.db.$transaction; let calls = 0;
  f.db.$transaction = async fn => { const result = await original(fn); calls++; if (calls === 2) throw Error('Lost commit acknowledgement'); return result; };
  await assert.rejects(f.service.upload(f.owner, f.id, await pdfFile()), /Lost commit/);
  assert.equal(f.docs.length, 1); assert.equal(f.calls.remove.length, 0);
  assert.equal((await f.service.list(f.owner, f.id)).documento.status_validacao, 'PENDENTE');
});
