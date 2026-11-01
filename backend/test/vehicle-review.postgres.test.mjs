import 'reflect-metadata';
import 'dotenv/config';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { VehicleReviewService } from '../src/admin/vehicle-review.service.ts';

// Explicit dedicated pre-migrated database only. Storage is simulated, PostgreSQL
// status/history persistence is real. No fixtures are committed and no SQL migration is applied.
test('review PostgreSQL status/history persistence in isolated rollback transaction', {
  skip: process.env.RUN_REVIEW_INTEGRATION !== '1' || !process.env.TEST_DATABASE_URL,
}, async () => {
  assert.notEqual(process.env.TEST_DATABASE_URL,process.env.DATABASE_URL,'Use a separate test database.');
  const db=new PrismaClient({adapter:new PrismaPg({connectionString:process.env.TEST_DATABASE_URL})});
  const rollback=new Error('rollback review fixtures');
  try{
    await assert.rejects(db.$transaction(async tx=>{
      const admin=await tx.usuario.create({data:{nome:'Review fixture',cpf:'12345678909',email:`${randomUUID()}@test.invalid`,senha_hash:'fixture-only',papel:'ADMIN'}});
      const vehicle=await tx.veiculo.create({data:{proprietario_id:admin.id,placa:'TST8Z91',marca:'Test',modelo:'Review',ano_fabricacao:2022,ano_modelo:2023,categoria:'Hatch'}});
      const documentId=randomUUID();
      await tx.documento_veiculo.create({data:{id:documentId,veiculo_id:vehicle.id,tipo:'CRLV',arquivo_url:`${vehicle.id}/${documentId}.pdf`}});
      const photoId=randomUUID();
      await tx.foto_veiculo.create({data:{id:photoId,veiculo_id:vehicle.id,arquivo_url:`${vehicle.id}/${photoId}.jpg`,conteudo_hash:'a'.repeat(64)}});
      const announcement=await tx.anuncio.create({data:{veiculo_id:vehicle.id,titulo:'Unchanged draft',preco_diaria:'10.50'}});
      const service=new VehicleReviewService({veiculo:tx.veiculo,documento_veiculo:tx.documento_veiculo,
        foto_veiculo:tx.foto_veiculo,historico_revisao_veiculo:tx.historico_revisao_veiculo,$transaction:fn=>fn(tx)},
        {config:{ttl:300},async verifyPhoto(){},async verifyDocument(){}});
      await service.decideDocument(admin.id,documentId,'APROVADO',{status_esperado:'PENDENTE',validade_ate:'2099-12-31'});
      await service.decideVehicle(admin.id,vehicle.id,'APROVADO',{status_esperado:'PENDENTE'});
      assert.equal((await tx.veiculo.findUniqueOrThrow({where:{id:vehicle.id}})).status_cadastro,'APROVADO');
      assert.equal(await tx.historico_revisao_veiculo.count({where:{veiculo_id:vehicle.id}}),2);
      assert.equal((await tx.anuncio.findUniqueOrThrow({where:{id:announcement.id}})).status,'RASCUNHO');
      await assert.rejects(service.decideVehicle(admin.id,vehicle.id,'REJEITADO',{status_esperado:'PENDENTE',justificativa:'Stale competing decision.'}),{status:409});
      throw rollback;
    },{timeout:20000}),error=>error===rollback);
  }finally{await db.$disconnect();}
});
