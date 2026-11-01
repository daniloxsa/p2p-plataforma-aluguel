import 'reflect-metadata';
import 'dotenv/config';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { AnunciosService } from '../src/anuncios/anuncios.service.ts';

// Dedicated database only; all fixtures and mutations are rolled back on success/failure.
test('anúncios: persistence in isolated PostgreSQL', { skip: !process.env.TEST_DATABASE_URL }, async () => {
  assert.notEqual(process.env.TEST_DATABASE_URL, process.env.DATABASE_URL, 'Use a dedicated test database.');
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.TEST_DATABASE_URL }) });
  const rollback = new Error('rollback fixtures');
  try {
    await assert.rejects(prisma.$transaction(async tx => {
      const user = await tx.usuario.create({ data: { nome: 'Anuncio test', cpf: '98765432100',
        email: `${randomUUID()}@test.invalid`, senha_hash: 'test-only' } });
      const vehicle = await tx.veiculo.create({ data: { proprietario_id: user.id, placa: 'TST9Z87', marca: 'Toyota',
        modelo: 'Yaris', ano_fabricacao: 2022, ano_modelo: 2023, categoria: 'Hatch' } });
      const photo = await tx.foto_veiculo.create({ data: { veiculo_id: vehicle.id, arquivo_url: `${vehicle.id}/test.webp` } });
      const service = new AnunciosService({ ...tx, anuncio: tx.anuncio, veiculo: tx.veiculo,
        $transaction: operation => operation(tx) });
      const dto = { veiculo_id: vehicle.id, titulo: 'Rascunho', preco_diaria: '9999999999.99' };
      const first = await service.create(user.id, dto);
      const second = await service.create(user.id, { ...dto, preco_diaria: '10.01' });
      assert.equal(first.preco_diaria, '9999999999.99'); assert.equal(first.status, 'RASCUNHO');
      assert.equal((await service.mine(user.id, { page: 1, limit: 1, orderBy: 'preco_diaria', order: 'asc' })).items[0].id, second.id);
      assert.equal((await service.mine(randomUUID(), { page: 1, limit: 20 })).total, 0);
      await assert.rejects(service.own(randomUUID(), first.id), { status: 404 });
      await assert.rejects(service.update(randomUUID(), first.id, { titulo: 'Outra' }), { status: 404 });
      await assert.rejects(service.close(randomUUID(), first.id), { status: 404 });
      await service.update(user.id, first.id, { preco_diaria: '0.01', descricao: ' ' });
      assert.equal((await service.own(user.id, first.id)).preco_diaria, '0.01');
      await service.close(user.id, first.id); await service.close(user.id, first.id);
      await assert.rejects(service.update(user.id, first.id, { titulo: 'Atrasado' }), { status: 409 });
      assert.equal((await tx.anuncio.findUniqueOrThrow({ where: { id: first.id } })).status, 'ENCERRADO');
      assert.equal(await tx.veiculo.count({ where: { id: vehicle.id } }), 1);
      assert.equal(await tx.foto_veiculo.count({ where: { id: photo.id } }), 1);
      for (const status of ['ATIVO', 'PAUSADO']) {
        await tx.anuncio.update({ where: { id: second.id }, data: { status } });
        await assert.rejects(service.close(user.id, second.id), { status: 409 });
      }
      throw rollback;
    }, { timeout: 20000 }), error => error === rollback);
  } finally { await prisma.$disconnect(); }
});
