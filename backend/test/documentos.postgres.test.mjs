import 'reflect-metadata';
import 'dotenv/config';
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PDFDocument } from 'pdf-lib';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { DocumentosService } from '../src/veiculos/documentos/documentos.service.ts';
import { VehicleReviewService } from '../src/admin/vehicle-review.service.ts';

// Opt-in, pre-migrated dedicated test database. All database fixtures roll back;
// storage alone is simulated. This is not a live Supabase integration test.
test('documents PostgreSQL: upload, B.1 rejection, resend, approval and preserved history', {
  skip: process.env.RUN_DOCUMENT_INTEGRATION !== '1' || !process.env.TEST_DATABASE_URL,
}, async () => {
  assert.notEqual(process.env.TEST_DATABASE_URL, process.env.DATABASE_URL, 'Use a separate test database.');
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.TEST_DATABASE_URL }) });
  const rollback = new Error('rollback document fixtures');
  try {
    await assert.rejects(db.$transaction(async tx => {
      const user = await tx.usuario.create({ data: { nome: 'Document fixture', cpf: '12345678909', email: `${randomUUID()}@test.invalid`, senha_hash: 'fixture-only', papel: 'ADMIN' } });
      const vehicle = await tx.veiculo.create({ data: { proprietario_id: user.id, placa: 'TST8Z93', marca: 'Test', modelo: 'Documents', ano_fabricacao: 2022, ano_modelo: 2023, categoria: 'Hatch' } });
      const draft = await tx.anuncio.create({ data: { veiculo_id: vehicle.id, titulo: 'Document test draft', preco_diaria: '10.50' } });
      const adapter = { veiculo: tx.veiculo, documento_veiculo: tx.documento_veiculo, foto_veiculo: tx.foto_veiculo,
        historico_revisao_veiculo: tx.historico_revisao_veiculo, $transaction: fn => fn(tx) };
      const stored = new Set();
      const storage = { async uploadDocument(vehicleId, id, path) { assert.equal(path, `${vehicleId}/${id}.pdf`); stored.add(path); },
        async removeDocument(vehicleId, id, path) { stored.delete(path); },
        async verifyDocument(vehicleId, id, path) { assert.ok(stored.has(path)); }, async verifyPhoto() {} };
      const documents = new DocumentosService(adapter, storage, { maxBytes: 10 * 1024 * 1024 });
      const review = new VehicleReviewService(adapter, storage);
      const pdf = await PDFDocument.create(); pdf.addPage(); const file = { buffer: Buffer.from(await pdf.save()), originalname: 'fixture.pdf', mimetype: 'application/pdf' };
      const first = (await documents.upload(user.id, vehicle.id, file)).documento;
      assert.equal(first.status_validacao, 'PENDENTE');
      await review.decideDocument(user.id, first.id, 'REJEITADO', { status_esperado: 'PENDENTE', justificativa: 'Documento sintético para teste de reenvio.' });
      const second = (await documents.upload(user.id, vehicle.id, file)).documento;
      assert.notEqual(first.id, second.id); assert.equal(second.status_validacao, 'PENDENTE');
      await assert.rejects(review.decideVehicle(user.id, vehicle.id, 'APROVADO', { status_esperado: 'PENDENTE' }), { status: 409 });
      await review.decideDocument(user.id, second.id, 'APROVADO', { status_esperado: 'PENDENTE', validade_ate: '2099-12-31' });
      const photo = randomUUID(); await tx.foto_veiculo.create({ data: { id: photo, veiculo_id: vehicle.id, arquivo_url: `${vehicle.id}/${photo}.jpg`, conteudo_hash: 'b'.repeat(64) } });
      await review.decideVehicle(user.id, vehicle.id, 'APROVADO', { status_esperado: 'PENDENTE' });
      assert.equal(await tx.documento_veiculo.count({ where: { veiculo_id: vehicle.id } }), 2);
      assert.equal(await tx.historico_revisao_veiculo.count({ where: { veiculo_id: vehicle.id } }), 3);
      assert.equal((await documents.list(user.id, vehicle.id)).pode_enviar, false);
      assert.equal(stored.size, 2);
      assert.equal((await tx.anuncio.findUniqueOrThrow({ where: { id: draft.id } })).status, 'RASCUNHO');
      throw rollback;
    }, { timeout: 30000 }), error => error === rollback);
  } finally { await db.$disconnect(); }
});
