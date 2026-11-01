import 'reflect-metadata';
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Module, ServiceUnavailableException, UnauthorizedException, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Prisma } from '@prisma/client';
import { fixture } from './helpers/lifecycle-fixture.mjs';
import { AnunciosService } from '../src/anuncios/anuncios.service.ts';
import { AnunciosController } from '../src/anuncios/anuncios.controller.ts';
import { PublicationPolicyService } from '../src/anuncios/publication-policy.service.ts';
import { PrismaService } from '../src/prisma/prisma.service.ts';
import { AuthService } from '../src/auth/auth.service.ts';
import { JwtAuthGuard } from '../src/auth/guards/jwt-auth.guard.ts';
import { VeiculosService } from '../src/veiculos/veiculos.service.ts';

test('lifecycle: full cycle persists exact transitions and owner audit without modifying vehicle/documents/photos', async () => {
  const f = fixture(), before = JSON.stringify([f.vehicle,f.documents,f.photos]);
  for (const [action, status] of [['publicar','ATIVO'],['pausar','PAUSADO'],['reativar','ATIVO'],['encerrar','ENCERRADO']]) {
    const row = await f.service.transition(f.owner,f.id,action); assert.equal(row.status,status); assert.equal(row.preco_diaria,'0.01'); assert.equal(row.veiculo.proprietario_id,undefined);
  }
  assert.deepEqual(f.history.map(row => row.operacao),['PUBLICAR','PAUSAR','REATIVAR','ENCERRAR']);
  for (const event of f.history) { assert.equal(event.usuario_id,f.owner); assert.equal(event.anuncio_id,f.id); assert.ok(event.criado_em instanceof Date); }
  assert.equal(JSON.stringify([f.vehicle,f.documents,f.photos]),before); assert.equal(f.reservations.length,0);
  assert.equal((await f.service.history(f.owner,f.id,{page:1,limit:20})).total,4);
  assert.equal(f.locks.length,8); for(let i=0;i<f.locks.length;i+=2){assert.match(f.locks[i],/veiculo/);assert.match(f.locks[i+1],/anuncio/);}
});
test('lifecycle: every illegal state/action pair is rejected, including repetition and terminal reopening', async () => {
  const allowed = { RASCUNHO:['publicar','encerrar'], ATIVO:['pausar','encerrar'], PAUSADO:['reativar','encerrar'], ENCERRADO:[] };
  for(const status of Object.keys(allowed)) for(const action of ['publicar','pausar','reativar','encerrar']) {
    if(allowed[status].includes(action))continue;
    const f=fixture(status); await assert.rejects(f.service.transition(f.owner,f.id,action),{status:409});assert.equal(f.history.length,0);assert.equal(f.rows[0].status,status);
  }
});
test('lifecycle: publication and reactivation revalidate administrative, document, vehicle and announcement data', async () => {
  for(const action of ['publicar','reativar']) for(const invalid of ['PENDENTE','EM_ANALISE','REJEITADO','disabled','no-document','expired','pending-document','newer-pending','no-validity','no-photo','unvalidated-photo','title','money','vehicle-data']) {
    const f=fixture(action==='reativar'?'PAUSADO':'RASCUNHO');
    if(['PENDENTE','EM_ANALISE','REJEITADO'].includes(invalid))f.vehicle.status_cadastro=invalid;
    if(invalid==='disabled')f.vehicle.desativado_em=new Date();
    if(invalid==='no-document')f.documents.length=0;
    if(invalid==='expired')f.documents[0].validade_ate=new Date('2000-01-01');
    if(invalid==='pending-document')f.documents[0].status_validacao='PENDENTE';
    if(invalid==='newer-pending')f.documents.push({...f.documents[0],id:randomUUID(),status_validacao:'PENDENTE'});
    if(invalid==='no-validity')f.documents[0].validade_ate=null;
    if(invalid==='no-photo')f.photos.length=0;
    if(invalid==='unvalidated-photo')f.photos[0].conteudo_hash=null;
    if(invalid==='title')f.rows[0].titulo='  ';
    if(invalid==='money')f.rows[0].preco_diaria=new Prisma.Decimal(0);
    if(invalid==='vehicle-data')f.vehicle.quantidade_lugares=null;
    await assert.rejects(f.service.transition(f.owner,f.id,action),{status:409},`${action}/${invalid}`); assert.equal(f.history.length,0);
  }
});
test('lifecycle: unavailable document/photo is 503; other accessible photos satisfy the minimum', async () => {
  for(const kind of ['verifyDocument','verifyPhoto']) {
    const f=fixture(); f.storage[kind]=async()=>{throw new ServiceUnavailableException();};
    await assert.rejects(f.service.transition(f.owner,f.id,'publicar'),{status:503});assert.equal(f.rows[0].status,'RASCUNHO');assert.equal(f.history.length,0);
  }
  const f=fixture();f.photos.push({...f.photos[0],id:randomUUID(),arquivo_url:`${f.vehicle.id}/${randomUUID()}.jpg`});
  let calls=0;f.storage.verifyPhoto=async()=>{if(++calls===1)throw new ServiceUnavailableException();};await f.service.transition(f.owner,f.id,'publicar');assert.equal(calls,2);
});
test('lifecycle: recheck DB after remote validation prevents stale approval, document, photo and deactivation races', async () => {
  for(const changed of ['approval','disabled','document','photo']) {
    const f=fixture();f.storage.verifyPhoto=async()=>{
      if(changed==='approval')f.vehicle.status_cadastro='REJEITADO';
      if(changed==='disabled')f.vehicle.desativado_em=new Date();
      if(changed==='document')f.documents[0].arquivo_url=`${f.vehicle.id}/${randomUUID()}.pdf`;
      if(changed==='photo')f.photos[0].conteudo_hash='b'.repeat(64);
    };
    await assert.rejects(f.service.transition(f.owner,f.id,'publicar'),{status:409});assert.equal(f.rows[0].status,'RASCUNHO');assert.equal(f.history.length,0);
  }
});
test('lifecycle: one winner for duplicate publication/reactivation and pause versus closure', async () => {
  for(const [status,actions]of [['RASCUNHO',['publicar','publicar']],['PAUSADO',['reativar','reativar']],['ATIVO',['pausar','encerrar']]]) {
    const f=fixture(status),results=await Promise.allSettled(actions.map(action=>f.service.transition(f.owner,f.id,action)));
    assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.find(r=>r.status==='rejected').reason.status,409);assert.equal(f.history.length,1);
  }
});
test('lifecycle: publication and vehicle deactivation use the same lock order and cannot both leave an active disabled vehicle', async () => {
  const f=fixture(),vehicles=new VeiculosService(f.db);
  const results=await Promise.allSettled([f.service.transition(f.owner,f.id,'publicar'),vehicles.deactivate(f.owner,f.vehicle.id)]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.ok(!(f.rows[0].status==='ATIVO'&&f.vehicle.desativado_em));
});
test('lifecycle: closure blocks nonterminal obligations, pause preserves them and terminal bookings do not block', async () => {
  for(const state of ['PENDENTE','CONFIRMADA','EM_ANDAMENTO','UNKNOWN']){
    const f=fixture('ATIVO');f.reservations.push({id:randomUUID(),anuncio_id:f.id,status:state});
    await assert.rejects(f.service.close(f.owner,f.id),{status:409});await f.service.transition(f.owner,f.id,'pausar');assert.equal(f.reservations[0].status,state);
  }
  for(const status of ['RASCUNHO','ATIVO','PAUSADO'])for(const booking of ['CONCLUIDA','CANCELADA','REJEITADA']){
    const f=fixture(status);f.reservations.push({id:randomUUID(),anuncio_id:f.id,status:booking});await f.service.close(f.owner,f.id);assert.equal(f.rows[0].status,'ENCERRADO');assert.equal(f.reservations.length,1);
  }
});
test('lifecycle: edits allowed only in draft/paused, status protected, unique current creation, closed history retained', async () => {
  for(const status of ['RASCUNHO','ATIVO','PAUSADO','ENCERRADO']){
    const f=fixture(status);if(['RASCUNHO','PAUSADO'].includes(status))assert.equal((await f.service.update(f.owner,f.id,{titulo:'Changed'})).titulo,'Changed');
    else await assert.rejects(f.service.update(f.owner,f.id,{titulo:'Changed'}),{status:409});
    await assert.rejects(f.service.update(f.owner,f.id,{status:'ATIVO'}),{status:400});
  }
  const f=fixture(),dto={veiculo_id:f.vehicle.id,titulo:'New',preco_diaria:'0.01'};
  await assert.rejects(f.service.create(f.owner,dto),{status:409});await f.service.close(f.owner,f.id);
  const created=await f.service.create(f.owner,dto);assert.equal(created.status,'RASCUNHO');assert.equal(f.rows.length,2);assert.equal(f.history.length,1);
  const g=fixture('ENCERRADO'),results=await Promise.allSettled([g.service.create(g.owner,{...dto,veiculo_id:g.vehicle.id}),g.service.create(g.owner,{...dto,veiculo_id:g.vehicle.id})]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
});
test('lifecycle: audit failure rolls back mutation; serialization/deadlock/uniqueness failures map to conflicts', async () => {
  const f=fixture();f.failAudit();await assert.rejects(f.service.transition(f.owner,f.id,'publicar'),/audit failed/);assert.equal(f.rows[0].status,'RASCUNHO');assert.equal(f.history.length,0);
  for(const [code,meta]of [['P2034',{}],['P2002',{}],['P2010',{code:'40001'}],['P2010',{code:'40P01'}]]){
    const f=fixture('ATIVO');f.db.$transaction=async()=>{throw new Prisma.PrismaClientKnownRequestError('conflict',{code,meta,clientVersion:'7'});};
    await assert.rejects(f.service.transition(f.owner,f.id,'pausar'),{status:409});
  }
});
test('lifecycle HTTP: owner isolation, no implicit ADMIN ownership, strict bodies, history and real policy', async t => {
  const f=fixture();class TestModule{}
  Module({controllers:[AnunciosController],providers:[AnunciosService,JwtAuthGuard,{provide:PublicationPolicyService,useValue:f.policy},{provide:PrismaService,useValue:f.db},
    {provide:AuthService,useValue:{async authenticate(token){if(!['owner','other','admin'].includes(token))throw new UnauthorizedException();return{id:token==='owner'?f.owner:randomUUID(),papel:token==='admin'?'ADMIN':'USUARIO'};}}}]})(TestModule);
  const app=await NestFactory.create(TestModule,{logger:false});app.setGlobalPrefix('api');app.useGlobalPipes(new ValidationPipe({transform:true,whitelist:true,forbidNonWhitelisted:true,forbidUnknownValues:true}));await app.listen(0,'127.0.0.1');t.after(()=>app.close());
  const base=`${await app.getUrl()}/api/anuncios`,call=(path,method='PATCH',body={},token='owner')=>fetch(`${base}${path}`,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},...(method==='GET'?{}:{body:JSON.stringify(body)})});
  for(const action of ['publicar','pausar','reativar','encerrar']){
    assert.equal((await call(`/${f.id}/${action}`,'PATCH',{},null)).status,401);
    for(const user of ['other','admin'])assert.equal((await call(`/${f.id}/${action}`,'PATCH',{},user)).status,404);
    for(const body of [{status:'ATIVO'},{proprietario_id:f.owner},{veiculo_id:f.vehicle.id}])assert.equal((await call(`/${f.id}/${action}`,'PATCH',body)).status,400);
  }
  assert.equal((await call('/bad/publicar')).status,400);assert.equal((await call(`/${randomUUID()}/publicar`)).status,404);
  for(const action of ['publicar','pausar','reativar','encerrar']){
    const response=await call(`/${f.id}/${action}`);assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');
    assert.equal((await call(`/${f.id}/${action}`)).status,409);
  }
  const history=await call(`/meus/${f.id}/historico`,'GET');assert.equal(history.status,200);assert.equal((await history.json()).total,4);
  assert.equal((await call(`/meus/${f.id}/historico`,'GET',{},'other')).status,404);assert.equal((await call(`/meus/${f.id}/historico?page=0`,'GET')).status,400);
});
