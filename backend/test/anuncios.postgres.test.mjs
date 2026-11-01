import 'reflect-metadata';
import 'dotenv/config';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { AnunciosService } from '../src/anuncios/anuncios.service.ts';
import { PublicationPolicyService } from '../src/anuncios/publication-policy.service.ts';
import { VehicleReviewService } from '../src/admin/vehicle-review.service.ts';

// Opt-in, local dedicated pre-migrated database only. All fixtures roll back.
// PostgreSQL persistence is real; only Storage is simulated. Applies no SQL migration.
test('anúncios B.2: real PostgreSQL approval, lifecycle, obligations and audit with rollback', {
  skip: process.env.RUN_ANNOUNCEMENT_INTEGRATION !== '1' || !process.env.TEST_DATABASE_URL,
}, async () => {
  assert.notEqual(process.env.TEST_DATABASE_URL, process.env.DATABASE_URL, 'Use a dedicated test database.');
  const target = new URL(process.env.TEST_DATABASE_URL);
  assert.ok(['localhost','127.0.0.1','[::1]'].includes(target.hostname), 'Local dedicated test database only.');
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.TEST_DATABASE_URL }) });
  const rollback = new Error('rollback fixtures');
  try {
    await assert.rejects(prisma.$transaction(async tx => {
      const user = await tx.usuario.create({ data: { nome: 'Anuncio test', cpf: '98765432100',
        email: `${randomUUID()}@test.invalid`, senha_hash: 'test-only', papel: 'ADMIN' } });
      const vehicle = await tx.veiculo.create({ data: { proprietario_id: user.id, placa: 'TST9Z87', marca: 'Toyota',
        modelo: 'Yaris', ano_fabricacao: 2022, ano_modelo: 2023, categoria: 'Hatch', cambio: 'Manual', combustivel: 'Flex', quantidade_lugares: 5 } });
      const photoId = randomUUID(), docId = randomUUID();
      const photo = await tx.foto_veiculo.create({ data: { id: photoId, veiculo_id: vehicle.id, arquivo_url: `${vehicle.id}/${photoId}.jpg`, conteudo_hash: 'a'.repeat(64) } });
      await tx.documento_veiculo.create({ data: { id: docId, veiculo_id: vehicle.id, tipo: 'CRLV', arquivo_url: `${vehicle.id}/${docId}.pdf` } });
      const storage = { async verifyDocument() {}, async verifyPhoto() {} };
      const adapter = { anuncio: tx.anuncio, veiculo: tx.veiculo, documento_veiculo: tx.documento_veiculo, foto_veiculo: tx.foto_veiculo,
        historico_revisao_veiculo: tx.historico_revisao_veiculo, $transaction: operation => operation(tx) };
      const service = new AnunciosService(adapter, new PublicationPolicyService(storage));
      const dto = { veiculo_id: vehicle.id, titulo: 'Rascunho', preco_diaria: '9999999999.99' };
      const first = await service.create(user.id, dto);
      await assert.rejects(service.create(user.id, dto), { status: 409 });
      assert.equal(first.preco_diaria, '9999999999.99'); assert.equal(first.status, 'RASCUNHO');
      assert.equal((await service.mine(user.id, { page: 1, limit: 1, orderBy: 'preco_diaria', order: 'asc' })).items[0].id, first.id);
      assert.equal((await service.mine(randomUUID(), { page: 1, limit: 20 })).total, 0);
      await assert.rejects(service.own(randomUUID(), first.id), { status: 404 });
      await assert.rejects(service.update(randomUUID(), first.id, { titulo: 'Outra' }), { status: 404 });
      await assert.rejects(service.close(randomUUID(), first.id), { status: 404 });
      await service.update(user.id, first.id, { preco_diaria: '0.01', descricao: ' ' });
      await assert.rejects(service.transition(user.id, first.id, 'publicar'), { status: 409 });
      const review = new VehicleReviewService(adapter, storage);
      await review.decideDocument(user.id, docId, 'APROVADO', { status_esperado: 'PENDENTE', validade_ate: '2099-12-31' });
      await review.decideVehicle(user.id, vehicle.id, 'APROVADO', { status_esperado: 'PENDENTE' });
      await service.transition(user.id, first.id, 'publicar');
      assert.equal((await tx.anuncio.findUniqueOrThrow({ where: { id: first.id } })).status, 'ATIVO');
      await assert.rejects(service.transition(user.id, first.id, 'publicar'), { status: 409 });
      await assert.rejects(service.update(user.id, first.id, { titulo: 'Alteração ativa' }), { status: 409 });

      // Explicit synthetic reservation fixture exercises the migration's lock trigger.
      const reservation = await tx.reserva.create({ data: { anuncio_id: first.id, locatario_id: user.id, data_inicio: new Date('2099-01-01'), data_fim: new Date('2099-01-02'), valor_diarias: '0.01', valor_total: '0.01' } });
      await assert.rejects(service.close(user.id, first.id), { status: 409 });
      await service.transition(user.id, first.id, 'pausar');
      assert.equal((await tx.reserva.findUniqueOrThrow({ where: { id: reservation.id } })).status, 'PENDENTE');
      await service.update(user.id, first.id, { titulo: 'Pausado atualizado' });
      await tx.reserva.update({ where: { id: reservation.id }, data: { status: 'CANCELADA' } });
      await service.transition(user.id, first.id, 'reativar');
      await service.close(user.id, first.id);
      await assert.rejects(service.close(user.id, first.id), { status: 409 });
      await assert.rejects(service.transition(user.id, first.id, 'reativar'), { status: 409 });
      assert.equal((await service.history(user.id, first.id, { page: 1, limit: 20 })).total, 4);
      assert.equal((await tx.veiculo.findUniqueOrThrow({ where: { id: vehicle.id } })).status_cadastro, 'APROVADO');
      assert.equal(await tx.foto_veiculo.count({ where: { id: photo.id } }), 1);
      assert.equal(await tx.reserva.count({ where: { anuncio_id: first.id } }), 1);
      const second = await service.create(user.id, dto); assert.equal(second.status, 'RASCUNHO');
      assert.equal(await tx.anuncio.count({ where: { veiculo_id: vehicle.id } }), 2);
      throw rollback;
    }, { timeout: 30000 }), error => error === rollback);
  } finally { await prisma.$disconnect(); }
});
