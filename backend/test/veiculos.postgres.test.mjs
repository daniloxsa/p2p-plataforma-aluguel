import 'reflect-metadata';
import 'dotenv/config';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { VeiculosService } from '../src/veiculos/veiculos.service.ts';

// Explicit dedicated test database only. Everything rolls back, including on success.
test('vehicle persistence on dedicated PostgreSQL', { skip: !process.env.TEST_DATABASE_URL }, async () => {
  assert.notEqual(process.env.TEST_DATABASE_URL, process.env.DATABASE_URL, 'Use a separate test database.');
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.TEST_DATABASE_URL }) });
  const rollback = new Error('rollback test fixtures');
  try {
    await assert.rejects(prisma.$transaction(async tx => {
      const user = await tx.usuario.create({ data: { nome: 'Vehicle test', cpf: '12345678909', email: `${randomUUID()}@test.invalid`, senha_hash: 'test-only' } });
      const bob = randomUUID();
      const service = new VeiculosService({ ...tx, veiculo: tx.veiculo, anuncio: tx.anuncio, documento_veiculo: tx.documento_veiculo, reserva: tx.reserva,
        $transaction: operation => typeof operation === 'function' ? operation(tx) : Promise.all(operation) });
      const dto = { placa: 'TST1A23', marca: 'Toyota', modelo: 'Yaris', ano_fabricacao: 2022, ano_modelo: 2023, categoria: 'Hatch', cambio: 'Automático', combustivel: 'Flex', quantidade_lugares: 5 };
      const vehicle = await service.create(user.id, dto);
      assert.equal((await tx.veiculo.findUnique({ where: { id: vehicle.id } })).proprietario_id, user.id);
      assert.equal((await service.mine(user.id, { page: 1, limit: 20 })).total, 1);
      assert.equal((await service.mine(bob, { page: 1, limit: 20 })).total, 0);
      await assert.rejects(service.own(bob, vehicle.id), { status: 404 });
      await assert.rejects(service.update(bob, vehicle.id, { modelo: 'Outra' }), { status: 404 });
      await service.update(user.id, vehicle.id, { modelo: 'Corolla' });
      assert.equal((await service.own(user.id, vehicle.id)).modelo, 'Corolla');
      await service.deactivate(user.id, vehicle.id);
      assert.ok((await service.own(user.id, vehicle.id)).desativado_em);
      assert.equal(await tx.veiculo.count({ where: { id: vehicle.id } }), 1);
      // Check duplicate translation last: a PostgreSQL unique violation aborts this transaction.
      await assert.rejects(service.create(user.id, dto), { status: 409 });
      throw rollback;
    }, { timeout: 20000 }), error => error === rollback);
  } finally { await prisma.$disconnect(); }
});
