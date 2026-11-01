import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { Module, UnauthorizedException, ServiceUnavailableException } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { VehicleReviewService } from '../src/admin/vehicle-review.service.ts';
import { VehicleReviewController } from '../src/admin/vehicle-review.controller.ts';
import { PrismaService } from '../src/prisma/prisma.service.ts';
import { StorageService } from '../src/veiculos/fotos/storage.service.ts';
import { JwtAuthGuard } from '../src/auth/guards/jwt-auth.guard.ts';
import { AdminGuard } from '../src/auth/guards/admin.guard.ts';
import { AuthService } from '../src/auth/auth.service.ts';
import { Prisma } from '@prisma/client';

function fixture() {
  const owner = randomUUID(), admin = randomUUID(), id = randomUUID(), docId = randomUUID(), photoId = randomUUID();
  const vehicle = { id, proprietario_id: owner, marca:'Toyota', modelo:'Yaris', placa:'TST1A23', ano_modelo:2023,
    status_cadastro:'PENDENTE', desativado_em:null, criado_em:new Date(), usuario:{id:owner,nome:'Owner'} };
  const docs = [{id:docId,veiculo_id:id,tipo:'CRLV',arquivo_url:`${id}/${docId}.pdf`,status_validacao:'APROVADO',validade_ate:new Date('2099-12-31'),criado_em:new Date()}];
  const photos = [{id:photoId,veiculo_id:id,arquivo_url:`${id}/${photoId}.jpg`,conteudo_hash:'a'.repeat(64),ordem:0}];
  const history = [], announcements = [{id:randomUUID(),veiculo_id:id,status:'RASCUNHO'}];
  let failAudit = false, queue = Promise.resolve(), lastList;
  const matches = (row,where={}) => Object.entries(where).every(([k,v])=>k==='OR'?v.some(w=>matches(row,w)):v&&typeof v==='object'&&'contains'in v?String(row[k]||'').toLowerCase().includes(v.contains.toLowerCase()):row[k]===v);
  function project(row, select) {
    if(!row)return null;if(!select)return {...row};
    return Object.fromEntries(Object.entries(select).map(([k,v])=>[k,k==='_count'?{foto_veiculo:photos.length,documento_veiculo:docs.length}:k==='documento_veiculo'?docs.slice().reverse().slice(0,v.take).map(d=>project(d,v.select)):v?.select?project(row[k],v.select):row[k]??null]));
  }
  const db = {
    veiculo:{
      async findUnique({where,select}){return matches(vehicle,where)?project(vehicle,select):null;},
      async findMany(args){lastList=args;return matches(vehicle,args.where)&&!args.skip?[project(vehicle,args.select)]:[];},
      async count({where}={}){return matches(vehicle,where)?1:0;},
      async groupBy(){return[{status_cadastro:vehicle.status_cadastro,_count:{_all:1}}];},
      async updateMany({where,data}){if(!matches(vehicle,where))return{count:0};Object.assign(vehicle,data);return{count:1};},
    },
    documento_veiculo:{
      async findUnique({where,select}){return project(docs.find(d=>matches(d,where)),select);},
      async findFirst({where}){return docs.filter(d=>matches(d,where)).at(-1)||null;},
      async findMany({where,select,skip=0,take=20}){return docs.filter(d=>matches(d,where)).reverse().slice(skip,skip+take).map(d=>project(d,select));},
      async count(){return docs.length;},
      async updateMany({where,data}){const rows=docs.filter(d=>matches(d,where));rows.forEach(d=>Object.assign(d,data));return{count:rows.length};},
    },
    foto_veiculo:{async findMany(){return photos.map(row=>({...row}));}},
    historico_revisao_veiculo:{
      async create({data}){if(failAudit)throw new Error('audit unavailable');history.push({id:randomUUID(),criado_em:new Date(),administrador:{id:admin,nome:'Admin'},...data});},
      async findMany({skip,take}){return history.slice().reverse().slice(skip,skip+take);},async count(){return history.length;},
    },
    async $queryRaw(){return[{id}];},
    async $transaction(fn){const previous=queue;let release;queue=new Promise(r=>{release=r;});await previous;
      const before=structuredClone({vehicle,docs,history});
      try{return await fn(db);}catch(error){Object.assign(vehicle,before.vehicle);docs.splice(0,docs.length,...before.docs);history.splice(0,history.length,...before.history);throw error;}finally{release();}},
  };
  const storage={config:{ttl:300},async sign(paths){return new Map(paths.map(p=>[p,'https://private.invalid/temporary']));},
    async verifyPhoto(){},async verifyDocument(){},async signDocument(){return{url:'https://private.invalid/temporary',expira_em:new Date(Date.now()+300000).toISOString()};}};
  const service=new VehicleReviewService(db,storage);
  return {db,storage,service,vehicle,docs,photos,history,announcements,admin,id,docId,failAudit:()=>{failAudit=true;},lastList:()=>lastList};
}

test('review: valid approval, explicit document review and history preserve announcements (mock persistence)',async()=>{
  const f=fixture(), original=structuredClone(f.announcements);
  f.docs[0].status_validacao='PENDENTE';f.docs[0].validade_ate=null;
  await assert.rejects(f.service.decideVehicle(f.admin,f.id,'APROVADO',{status_esperado:'PENDENTE'}),{status:409});
  await f.service.decideDocument(f.admin,f.docId,'APROVADO',{status_esperado:'PENDENTE',validade_ate:'2099-12-31'});
  assert.equal(f.vehicle.status_cadastro,'PENDENTE');assert.equal(f.history[0].alvo,'DOCUMENTO');
  await f.service.decideVehicle(f.admin,f.id,'APROVADO',{status_esperado:'PENDENTE'});
  assert.equal(f.vehicle.status_cadastro,'APROVADO');assert.equal(f.history.length,2);assert.equal(f.history[1].administrador_id,f.admin);
  assert.deepEqual(f.announcements,original);
  await assert.rejects(f.service.decideVehicle(f.admin,f.id,'REJEITADO',{status_esperado:'APROVADO',justificativa:'Motivo suficientemente claro.'}),{status:409});
});

test('review: approval rejects missing, pending, rejected, expired and newer unreviewed CRLV',async()=>{
  for(const status of ['PENDENTE','REJEITADO','EXPIRADO']){const f=fixture();f.docs[0].status_validacao=status;await assert.rejects(f.service.decideVehicle(f.admin,f.id,'APROVADO',{status_esperado:'PENDENTE'}),{status:409});}
  for(const validity of [null,new Date('2000-01-01')]){const f=fixture();f.docs[0].validade_ate=validity;await assert.rejects(f.service.decideVehicle(f.admin,f.id,'APROVADO',{status_esperado:'PENDENTE'}),{status:409});}
  const f=fixture();f.docs.length=0;await assert.rejects(f.service.decideVehicle(f.admin,f.id,'APROVADO',{status_esperado:'PENDENTE'}),{status:409});
  const newer=fixture();newer.docs.push({...newer.docs[0],id:randomUUID(),status_validacao:'PENDENTE'});await assert.rejects(newer.service.decideVehicle(newer.admin,newer.id,'APROVADO',{status_esperado:'PENDENTE'}),{status:409});
});

test('review: disabled vehicles, unavailable files and unvalidated photos cannot be approved',async()=>{
  const disabled=fixture();disabled.vehicle.desativado_em=new Date();await assert.rejects(disabled.service.decideVehicle(disabled.admin,disabled.id,'APROVADO',{status_esperado:'PENDENTE'}),{status:409});
  for(const mode of ['absent','hash','file']){const f=fixture();if(mode==='absent')f.photos.length=0;if(mode==='hash')f.photos[0].conteudo_hash=null;if(mode==='file')f.storage.verifyPhoto=async()=>{throw new ServiceUnavailableException();};await assert.rejects(f.service.decideVehicle(f.admin,f.id,'APROVADO',{status_esperado:'PENDENTE'}),{status:409});}
  const f=fixture();f.storage.verifyDocument=async()=>{throw new ServiceUnavailableException();};await assert.rejects(f.service.decideVehicle(f.admin,f.id,'APROVADO',{status_esperado:'PENDENTE'}),{status:503});assert.equal(f.history.length,0);
});

test('review: rejection needs a reason; rejected vehicles can be reopened and reanalysed',async()=>{
  const f=fixture();for(const justificativa of ['', ' ', 'short', 'x'.repeat(1001), '<script>invalid</script>'])await assert.rejects(f.service.decideVehicle(f.admin,f.id,'REJEITADO',{status_esperado:'PENDENTE',justificativa}),{status:400});
  await f.service.decideVehicle(f.admin,f.id,'REJEITADO',{status_esperado:'PENDENTE',justificativa:' Foto com dados incompatíveis. '});
  assert.equal(f.history[0].justificativa,'Foto com dados incompatíveis.');assert.equal(f.photos.length,1);assert.equal(f.docs.length,1);
  await f.service.decideVehicle(f.admin,f.id,'PENDENTE',{status_esperado:'REJEITADO'});
  await f.service.decideVehicle(f.admin,f.id,'APROVADO',{status_esperado:'PENDENTE'});assert.equal(f.history.length,3);
});

test('review: contradictory decisions use expected status; audit failures rollback (transactional mock)',async()=>{
  const f=fixture();const results=await Promise.allSettled([
    f.service.decideVehicle(f.admin,f.id,'APROVADO',{status_esperado:'PENDENTE'}),
    f.service.decideVehicle(f.admin,f.id,'REJEITADO',{status_esperado:'PENDENTE',justificativa:'Outra decisão concorrente.'}),
  ]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.find(r=>r.status==='rejected').reason.status,409);assert.equal(f.history.length,1);
  const failed=fixture();failed.failAudit();await assert.rejects(failed.service.decideVehicle(failed.admin,failed.id,'APROVADO',{status_esperado:'PENDENTE'}),/audit/);assert.equal(failed.vehicle.status_cadastro,'PENDENTE');assert.equal(failed.history.length,0);
  failed.docs[0].status_validacao='PENDENTE';await assert.rejects(failed.service.decideDocument(failed.admin,failed.docId,'APROVADO',{status_esperado:'PENDENTE',validade_ate:'2099-12-31'}),/audit/);assert.equal(failed.docs[0].status_validacao,'PENDENTE');
});

test('review: bounded queries, statistics and private projections',async()=>{
  const f=fixture();assert.equal((await f.service.stats()).pendentes,1);
  assert.equal((await f.service.list({page:1,limit:20,busca:'yaris',status:'PENDENTE'})).total,1);
  assert.deepEqual(f.lastList().orderBy,[{criado_em:'desc'},{id:'desc'}]);
  assert.equal((await f.service.list({page:2,limit:20})).items.length,0);
  for(const query of [{page:0,limit:20},{page:1,limit:101},{page:1,limit:20,orderBy:'senha_hash'}])await assert.rejects(f.service.list(query),{status:400});
  const detail=await f.service.detail(f.id);assert.equal(detail.fotos[0].arquivo_url,undefined);assert.equal(detail.fotos[0].conteudo_hash,undefined);assert.deepEqual(Object.keys(detail.usuario).sort(),['id','nome']);
  const docs=await f.service.documents(f.id,{page:1,limit:20});assert.equal(docs.items[0].arquivo_url,undefined);
  await assert.rejects(f.service.detail(randomUUID()),{status:404});
  const file=await f.service.documentFile(f.docId);assert.ok(file.expira_em);assert.equal(file.arquivo_url,undefined);
});

test('review: document validation is explicit, dated, and independently rejected',async()=>{
  const f=fixture();f.docs[0].status_validacao='PENDENTE';
  for(const validity of ['2000-01-01','2099-02-30','not-a-date'])await assert.rejects(f.service.decideDocument(f.admin,f.docId,'APROVADO',{status_esperado:'PENDENTE',validade_ate:validity}),{status:400});
  await f.service.decideDocument(f.admin,f.docId,'REJEITADO',{status_esperado:'PENDENTE',justificativa:'Documento com informação ilegível.'});assert.equal(f.vehicle.status_cadastro,'PENDENTE');
  await f.service.decideDocument(f.admin,f.docId,'APROVADO',{status_esperado:'REJEITADO',validade_ate:'2099-12-31'});assert.equal(f.docs[0].motivo_rejeicao,null);assert.equal(f.history.length,2);
  await assert.rejects(f.service.decideDocument(f.admin,randomUUID(),'APROVADO',{status_esperado:'PENDENTE',validade_ate:'2099-12-31'}),{status:404});
});

test('review HTTP: all routes require authenticated ADMIN, validation rejects protected fields',async t=>{
  const f=fixture();class TestModule{}
  Module({controllers:[VehicleReviewController],providers:[VehicleReviewService,JwtAuthGuard,AdminGuard,{provide:PrismaService,useValue:f.db},{provide:StorageService,useValue:f.storage},
    {provide:AuthService,useValue:{async authenticate(token){if(!['admin','user'].includes(token))throw new UnauthorizedException();return{id:f.admin,papel:token==='admin'?'ADMIN':'USUARIO'};}}}]})(TestModule);
  const app=await NestFactory.create(TestModule,{logger:false});app.setGlobalPrefix('api');await app.listen(0,'127.0.0.1');t.after(()=>app.close());
  const call=(path,method='GET',body,token='admin')=>fetch(`${base}${path}`,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},...(body&&method!=='GET'?{body:JSON.stringify(body)}:{})});
  const base=`${await app.getUrl()}/api/admin`;
  for(const [path,method] of [['/resumo','GET'],['/veiculos','GET'],[`/veiculos/${f.id}`,'GET'],[`/veiculos/${f.id}/documentos`,'GET'],[`/veiculos/${f.id}/historico`,'GET'],[`/documentos/${f.docId}/arquivo`,'GET'],[`/veiculos/${f.id}/aprovar`,'PATCH'],[`/veiculos/${f.id}/rejeitar`,'PATCH'],[`/veiculos/${f.id}/reabrir`,'PATCH'],[`/documentos/${f.docId}/aprovar`,'PATCH'],[`/documentos/${f.docId}/rejeitar`,'PATCH']]){
    assert.equal((await call(path,method,{},null)).status,401);assert.equal((await call(path,method,{},'user')).status,403);
  }
  assert.equal((await call('/resumo')).status,200);assert.equal((await call('/veiculos')).status,200);assert.equal((await call('/veiculos?page=0')).status,400);
  assert.equal((await call(`/veiculos/${f.id}/aprovar`,'PATCH',{status_esperado:'PENDENTE',proprietario_id:f.admin})).status,400);
  assert.equal((await call(`/veiculos/${f.id}/rejeitar`,'PATCH',{status_esperado:'PENDENTE'})).status,400);
  assert.equal((await call(`/veiculos/${randomUUID()}`)).status,404);
});

test('review storage: only canonical per-vehicle references in configured private document bucket',()=>{
  const previous=process.env.SUPABASE_VEHICLE_DOCUMENT_BUCKET,project=process.env.SUPABASE_URL;
  try{const vehicle=randomUUID(),doc=randomUUID(),object=`${vehicle}/${doc}.pdf`;process.env.SUPABASE_VEHICLE_DOCUMENT_BUCKET='documents';process.env.SUPABASE_URL='https://trusted.invalid';
    const check=reference=>StorageService.prototype.documentReference.call({},vehicle,doc,reference);
    assert.deepEqual(check(object),{bucket:'documents',path:object});
    assert.equal(check(`https://trusted.invalid/storage/v1/object/documents/${object}`).path,object);
    for(const reference of [`${randomUUID()}/${doc}.pdf`,'../secret.pdf',`https://evil.invalid/${object}`,`https://trusted.invalid/storage/v1/object/sign/documents/${object}?token=private`])assert.throws(()=>check(reference),{status:503});
    delete process.env.SUPABASE_VEHICLE_DOCUMENT_BUCKET;assert.throws(()=>check(object),{status:503});
  }finally{if(previous===undefined)delete process.env.SUPABASE_VEHICLE_DOCUMENT_BUCKET;else process.env.SUPABASE_VEHICLE_DOCUMENT_BUCKET=previous;if(project===undefined)delete process.env.SUPABASE_URL;else process.env.SUPABASE_URL=project;}
});

test('review storage: private bucket, present object and valid MIME/size are mandatory',async()=>{
  let publicBucket=false, info={contentType:'application/pdf',size:128};
  const storage=Object.create(StorageService.prototype);
  storage.client={storage:{async getBucket(){return{data:{public:publicBucket},error:null};},from(){return{async info(){return{data:info,error:null};}};}}};
  await storage.readableObject('documents','ignored',['application/pdf']);
  publicBucket=true;await assert.rejects(storage.readableObject('documents','ignored',['application/pdf']),{status:503});publicBucket=false;
  for(const invalid of [null,{contentType:'text/html',size:128},{contentType:'application/pdf'},{contentType:'application/pdf',size:0}]){
    info=invalid;await assert.rejects(storage.readableObject('documents','ignored',['application/pdf']),{status:503});
  }
});

test('review: raw PostgreSQL serialization/deadlock errors become HTTP conflicts',async()=>{
  for(const code of ['40001','40P01']){
    const f=fixture();f.db.$transaction=async()=>{throw new Prisma.PrismaClientKnownRequestError('transaction conflict',{code:'P2010',clientVersion:'7',meta:{code}});};
    await assert.rejects(f.service.decideVehicle(f.admin,f.id,'APROVADO',{status_esperado:'PENDENTE'}),{status:409});
  }
});
