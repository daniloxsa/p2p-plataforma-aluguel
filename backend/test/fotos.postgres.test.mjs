import 'reflect-metadata';
import 'dotenv/config';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import sharp from 'sharp';
import { FotosService } from '../src/veiculos/fotos/fotos.service.ts';
import { PhotoConfig } from '../src/veiculos/fotos/photo.config.ts';
import { StorageService } from '../src/veiculos/fotos/storage.service.ts';

// Never inferred from DATABASE_URL. Requires explicit dedicated migrated test DB.
test('photo PostgreSQL locks, partial uniqueness, reservations and outbox with independent connections', {
  skip: process.env.RUN_PHOTO_INTEGRATION !== '1' || !process.env.TEST_DATABASE_URL,
}, async () => {
  assert.notEqual(process.env.TEST_DATABASE_URL, process.env.DATABASE_URL, 'Use a dedicated database.');
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.TEST_DATABASE_URL, max: 15 }) });
  let owner, vehicle;
  const objects = new Set();
  const storage = {
    assertPath: StorageService.prototype.assertPath,
    async upload(path) { objects.add(path); }, async remove(path) { objects.delete(path); },
    async sign(paths) { return new Map(paths.map(path => [path, `https://test.invalid/${path}`])); },
  };
  const service = new FotosService(db, storage, new PhotoConfig());
  const otherService = new FotosService(db, storage, new PhotoConfig());
  try {
    await db.$queryRaw`SELECT id FROM foto_storage_operacao LIMIT 0`;
    owner = await db.usuario.create({ data: { nome: 'Photo integration', cpf: String(Date.now()).slice(-11), email: `${randomUUID()}@test.invalid`, senha_hash: 'test-only' } });
    vehicle = await db.veiculo.create({ data: { proprietario_id: owner.id, placa: randomUUID().replaceAll('-', '').slice(0, 7).toUpperCase(), marca: 'Test', modelo: 'Photos', categoria: 'Hatch', ano_fabricacao: 2022, ano_modelo: 2023 } });
    const files = await Promise.all(Array.from({ length: 12 }, async (_, i) => ({ mimetype: 'image/png', buffer: await sharp({ create: { width: 4, height: 4, channels: 3, background: { r: i + 1, g: 80, b: 100 } } }).png().toBuffer() })));
    const results = await Promise.allSettled(files.map((file, i) => (i % 2 ? service : otherService).upload(owner.id, vehicle.id, [file])));
    assert.equal(results.filter(r => r.status === 'fulfilled').length, 10);
    let photos = await service.list(owner.id, vehicle.id);
    assert.equal(photos.length, 10); assert.equal(photos.filter(p => p.principal).length, 1);
    assert.equal((await db.veiculo.findUnique({ where: { id: vehicle.id }, include: { foto_veiculo: true } })).foto_veiculo.length, 10);
    await Promise.all([service.principal(owner.id, vehicle.id, photos[1].id), otherService.principal(owner.id, vehicle.id, photos[2].id)]);
    assert.equal(await db.foto_veiculo.count({ where: { veiculo_id: vehicle.id, principal: true } }), 1);
    await assert.rejects(db.foto_veiculo.update({ where: { id: photos[3].id }, data: { principal: true } }), { code: 'P2002' });
    photos = await service.reorder(owner.id, vehicle.id, photos.map(p => p.id).reverse());
    assert.deepEqual(photos.map(p => p.ordem), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    await assert.rejects(service.remove(randomUUID(), vehicle.id, photos[0].id), { status: 404 });
    const principal = photos.find(p => p.principal);
    await service.remove(owner.id, vehicle.id, principal.id);
    assert.equal((await service.list(owner.id, vehicle.id)).filter(p => p.principal).length, 1);
    assert.equal(objects.size, 9);
    assert.equal((await db.$queryRaw`SELECT * FROM foto_storage_operacao WHERE veiculo_id = ${vehicle.id}::uuid`).length, 0);
  } finally {
    // Only remove fixtures created above in the explicitly selected test database.
    if (vehicle) {
      await db.foto_veiculo.deleteMany({ where: { veiculo_id: vehicle.id } });
      await db.$executeRaw`DELETE FROM foto_storage_operacao WHERE veiculo_id = ${vehicle.id}::uuid`;
      await db.veiculo.delete({ where: { id: vehicle.id } });
    }
    if (owner) await db.usuario.delete({ where: { id: owner.id } });
    await db.$disconnect();
  }
});

test('real private Supabase Storage upload, signed URL download, expiry and removal (test project only)', {
  skip: process.env.RUN_PHOTO_STORAGE_INTEGRATION !== '1' || !process.env.TEST_SUPABASE_URL || !process.env.TEST_SUPABASE_SECRET_KEY,
}, async () => {
  assert.notEqual(process.env.TEST_SUPABASE_URL, process.env.SUPABASE_URL, 'Use a dedicated test project.');
  assert.match(process.env.TEST_SUPABASE_VEHICLE_BUCKET || '', /^test-/, 'Use an explicit private test-* bucket.');
  const { createClient } = await import('@supabase/supabase-js');
  const client = createClient(process.env.TEST_SUPABASE_URL, process.env.TEST_SUPABASE_SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const bucket = process.env.TEST_SUPABASE_VEHICLE_BUCKET;
  const details = await client.storage.getBucket(bucket); assert.equal(details.error, null); assert.equal(details.data.public, false);
  // Exercise production wrapper without copying test secrets into app env or logs.
  const storage = Object.create(StorageService.prototype);
  storage.config = { bucket, ttl: 1 }; storage.client = client;
  const path = `${randomUUID()}/${randomUUID()}.png`;
  const buffer = await sharp({ create: { width: 4, height: 4, channels: 3, background: 'red' } }).png().toBuffer();
  try {
    await storage.upload(path, buffer, 'image/png');
    const first = (await storage.sign([path])).get(path);
    assert.equal((await fetch(first)).status, 200);
    // Public path must never expose the object.
    const publicUrl = client.storage.from(bucket).getPublicUrl(path).data.publicUrl;
    assert.notEqual((await fetch(publicUrl)).status, 200);
    await new Promise(resolve => setTimeout(resolve, 2200));
    assert.notEqual((await fetch(first, { cache: 'no-store' })).status, 200);
    const renewed = (await storage.sign([path])).get(path);
    assert.equal((await fetch(renewed)).status, 200);
    await storage.remove(path);
  } finally { await storage.remove(path); }
});
