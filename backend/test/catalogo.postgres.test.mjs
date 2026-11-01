import 'reflect-metadata';
import 'dotenv/config';
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { isLoopback, localTestConfig, validateDatabaseIdentity } from '../scripts/admin-test-safety.mjs';
import { CatalogoService } from '../src/catalogo/catalogo.service.ts';
import { StorageService } from '../src/veiculos/fotos/storage.service.ts';
import { publicationDay } from '../src/anuncios/publication-rules.ts';

// Explicit opt-in, loopback only, identity verified before fixture writes.
// All fixtures are rolled back; no migrations, Storage calls or existing-row edits.
test('catalog PostgreSQL: real eligibility, latest CRLV, filters, precision, order, pagination and private projection', {
  skip: process.env.RUN_CATALOGO_SQL_TEST !== '1',
}, async () => {
  const config = localTestConfig(process.env);
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: config.databaseUrl }) });
  const rollback = new Error('rollback catalog fixtures');
  try {
    const identity = await db.$queryRaw`SELECT current_database() AS database, inet_server_addr()::text AS server,
      inet_client_addr()::text AS client, inet_server_port() AS port, pg_is_in_recovery() AS replica`;
    const target = identity[0];
    console.log('Catalog SQL safety checks:', { serverLoopback: isLoopback(target.server), clientLoopback: isLoopback(target.client), databaseMatches: target.database === config.database, portMatches: Number(target.port) === config.port, primary: target.replica === false });
    validateDatabaseIdentity(target, config);
    await assert.rejects(db.$transaction(async tx => {
      const marker = `Catalog-${randomUUID()}`;
      const owner = await tx.usuario.create({ data: { nome: 'Catalog test', cpf: randomUUID().replace(/\D/g, '').padEnd(11, '0').slice(0, 11), email: `${randomUUID()}@test.invalid`, senha_hash: 'fixture-only' } });
      const vehicle = await tx.veiculo.create({ data: { proprietario_id: owner.id, placa: `TST${Math.floor(Math.random() * 10)}Z${Math.floor(Math.random() * 90 + 10)}`,
        marca: 'Toyota', modelo: 'Yaris', ano_fabricacao: 2022, ano_modelo: 2023, categoria: 'Hatch', cambio: 'Manual', combustivel: 'Flex', quantidade_lugares: 5, status_cadastro: 'APROVADO' } });
      const documentId = randomUUID(), photoId = randomUUID();
      const doc = await tx.documento_veiculo.create({ data: { id: documentId, veiculo_id: vehicle.id, tipo: 'CRLV', arquivo_url: `${vehicle.id}/${documentId}.pdf`, status_validacao: 'APROVADO', validade_ate: new Date('2099-12-31') } });
      await tx.foto_veiculo.create({ data: { id: photoId, veiculo_id: vehicle.id, arquivo_url: `${vehicle.id}/${photoId}.jpg`, conteudo_hash: 'a'.repeat(64), principal: true } });
      const ad = await tx.anuncio.create({ data: { veiculo_id: vehicle.id, titulo: marker, descricao: 'Real catalog SQL', preco_diaria: '150.99', status: 'ATIVO' } });
      const storage = { assertPath: StorageService.prototype.assertPath,
        async signPublicPhotos(paths) { return new Map(paths.map(path => [path, 'https://images.test/signed'])); } };
      const service = new CatalogoService({ $transaction: fn => fn(tx) }, storage);
      const list = filters => service.list({ q: marker, ...filters });
      const visible = async expected => { assert.equal((await list({})).total, expected); if (!expected) await assert.rejects(service.detail(ad.id), { status: 404 }); };
      await visible(1);
      for (const status of ['RASCUNHO', 'PAUSADO', 'ENCERRADO']) { await tx.anuncio.update({ where: { id: ad.id }, data: { status } }); await visible(0); }
      await tx.anuncio.update({ where: { id: ad.id }, data: { status: 'ATIVO' } });
      for (const status_cadastro of ['PENDENTE', 'EM_ANALISE', 'REJEITADO']) { await tx.veiculo.update({ where: { id: vehicle.id }, data: { status_cadastro } }); await visible(0); }
      await tx.veiculo.update({ where: { id: vehicle.id }, data: { status_cadastro: 'APROVADO', desativado_em: new Date() } }); await visible(0);
      await tx.veiculo.update({ where: { id: vehicle.id }, data: { desativado_em: null } });
      for (const status_validacao of ['PENDENTE', 'REJEITADO', 'EXPIRADO']) { await tx.documento_veiculo.update({ where: { id: doc.id }, data: { status_validacao } }); await visible(0); }
      await tx.documento_veiculo.update({ where: { id: doc.id }, data: { status_validacao: 'APROVADO', validade_ate: new Date('2000-01-01') } }); await visible(0);
      await tx.documento_veiculo.update({ where: { id: doc.id }, data: { validade_ate: null } }); await visible(0);
      await tx.documento_veiculo.update({ where: { id: doc.id }, data: { validade_ate: new Date(publicationDay()) } }); await visible(1);
      const newerId = randomUUID();
      await tx.documento_veiculo.create({ data: { id: newerId, veiculo_id: vehicle.id, tipo: 'CRLV', arquivo_url: `${vehicle.id}/${newerId}.pdf`, criado_em: new Date(doc.criado_em.getTime() + 1000), status_validacao: 'PENDENTE' } }); await visible(0);
      await tx.documento_veiculo.delete({ where: { id: newerId } });
      await tx.foto_veiculo.update({ where: { id: photoId }, data: { conteudo_hash: null } }); await visible(0);
      await tx.foto_veiculo.update({ where: { id: photoId }, data: { conteudo_hash: 'a'.repeat(64), arquivo_url: `${randomUUID()}/${photoId}.jpg` } }); await visible(0);
      await tx.foto_veiculo.update({ where: { id: photoId }, data: { arquivo_url: `${vehicle.id}/${photoId}.jpg` } }); await visible(1);
      for (const filters of [{ categoria: 'SUV' }, { cambio: 'Automático' }, { combustivel: 'Diesel' }, { preco_min: '151' }, { preco_max: '150.98' }]) assert.equal((await list(filters)).total, 0);
      assert.equal((await list({ categoria: 'hatch', cambio: 'manual', combustivel: 'flex', preco_min: '150.99', preco_max: '150.99' })).total, 1);
      // A second eligible ad provides real ordering and pagination boundaries.
      const secondVehicle = await tx.veiculo.create({ data: { proprietario_id: owner.id, placa: `TST${Math.floor(Math.random() * 10)}Y${Math.floor(Math.random() * 90 + 10)}`, marca: marker, modelo: 'SQL search', ano_fabricacao: 2022, ano_modelo: 2023, categoria: 'SUV', status_cadastro: 'APROVADO' } });
      const d2 = randomUUID(), p2 = randomUUID();
      await tx.documento_veiculo.create({ data: { id: d2, veiculo_id: secondVehicle.id, tipo: 'CRLV', arquivo_url: `${secondVehicle.id}/${d2}.pdf`, status_validacao: 'APROVADO', validade_ate: new Date('2099-12-31') } });
      await tx.foto_veiculo.create({ data: { id: p2, veiculo_id: secondVehicle.id, arquivo_url: `${secondVehicle.id}/${p2}.jpg`, conteudo_hash: 'b'.repeat(64) } });
      const second = await tx.anuncio.create({ data: { veiculo_id: secondVehicle.id, titulo: 'Search by brand', preco_diaria: '99.01', status: 'ATIVO', criado_em: new Date(ad.criado_em.getTime() + 1000) } });
      assert.equal((await list({ ordem: 'menor_preco', limit: 1 })).items[0].id, second.id);
      assert.equal((await list({ ordem: 'maior_preco', limit: 1 })).items[0].id, ad.id);
      assert.equal((await list({ ordem: 'recentes', limit: 1 })).items[0].id, second.id);
      const page2 = await list({ ordem: 'menor_preco', limit: 1, page: 2 }); assert.equal(page2.items[0].id, ad.id); assert.equal(page2.total, 2); assert.equal(page2.pages, 2);
      assert.deepEqual((await list({ page: 3, limit: 1 })).items, []);
      const detail = await service.detail(ad.id); assert.equal(detail.preco_diaria, '150.99');
      for (const key of ['placa', 'proprietario_id', 'documento_veiculo', 'arquivo_url', 'conteudo_hash', 'senha_hash', 'cpf']) assert.ok(!JSON.stringify(detail).includes(`"${key}"`));
      assert.equal((await service.list({ q: "' OR 1=1 --" })).total, 0);
      throw rollback;
    }, { timeout: 30000 }), error => error === rollback);
  } finally { await db.$disconnect(); }
});
