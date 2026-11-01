import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { Module, UnauthorizedException } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Prisma } from '@prisma/client';
import { VeiculosController } from '../src/veiculos/veiculos.controller.ts';
import { VeiculosService } from '../src/veiculos/veiculos.service.ts';
import { PrismaService } from '../src/prisma/prisma.service.ts';
import { AuthService } from '../src/auth/auth.service.ts';
import { JwtAuthGuard } from '../src/auth/guards/jwt-auth.guard.ts';

test('vehicle HTTP contracts, validation and ownership (isolated persistence)', async t => {
  const rows = [];
  let reservations = 0, announcements = 0, documents = 0;
  const matches = (r, w) => Object.entries(w).every(([k,v]) => k === 'anuncio' ? r.anuncio?.status === v.is.status : r[k] === v);
  const project = (r, s) => r && Object.fromEntries(Object.entries(s).map(([k]) => [k, r[k] ?? null]));
  const db = {
    async $queryRaw() { return []; },
    veiculo: {
      async create({ data, select }) {
        if (rows.some(r => r.placa === data.placa)) throw new Prisma.PrismaClientKnownRequestError('duplicate', { code: 'P2002', clientVersion: '7' });
        const r = { id: randomUUID(), status_cadastro: 'PENDENTE', criado_em: new Date(), desativado_em: null, ...data };
        rows.push(r); return project(r, select);
      },
      async findFirst({ where, select }) { const r = rows.find(r => matches(r, where)); return select ? project(r, select) : r; },
      async findMany({ where, select, skip, take }) { return rows.filter(r => matches(r, where)).reverse().slice(skip, skip + take).map(r => project(r, select)); },
      async count({ where }) { return rows.filter(r => matches(r, where)).length; },
      async update({ where, data, select }) {
        if (data.placa && rows.some(r => r.id !== where.id && r.placa === data.placa)) throw new Prisma.PrismaClientKnownRequestError('duplicate', { code: 'P2002', clientVersion: '7' });
        const r = rows.find(r => matches(r, where)); Object.assign(r, data); return select ? project(r, select) : r;
      },
    },
    anuncio: { async count() { return announcements; }, async findFirst() { return null; } },
    documento_veiculo: { async count() { return documents; } },
    reserva: { async count() { return reservations; } },
    async $transaction(arg) { return typeof arg === 'function' ? arg(db) : Promise.all(arg); },
  };
  class TestModule {}
  Module({ controllers: [VeiculosController], providers: [VeiculosService, JwtAuthGuard,
    { provide: PrismaService, useValue: db }, { provide: AuthService, useValue: { authenticate: async token => {
      if (!['alice', 'bob'].includes(token)) throw new UnauthorizedException(); return { id: token };
    } } }] })(TestModule);
  const app = await NestFactory.create(TestModule, { logger: false });
  app.setGlobalPrefix('api'); await app.listen(0, '127.0.0.1'); t.after(() => app.close());
  const request = (path = '', method = 'GET', body, user = 'alice') => fetch(`${base}${path}`, {
    method, headers: { 'Content-Type': 'application/json', ...(user ? { Authorization: `Bearer ${user}` } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const base = `${await app.getUrl()}/api/veiculos`;
  const dto = { placa: 'abc-1234', marca: 'Toyota', modelo: 'Yaris', ano_fabricacao: 2022, ano_modelo: 2023, categoria: 'Hatch', cambio: 'Automático', combustivel: 'Flex', quantidade_lugares: 5 };
  for (const [method,path] of [['POST',''],['GET','/meus'],['PATCH',`/${randomUUID()}`],['DELETE',`/${randomUUID()}`]]) assert.equal((await request(path,method,undefined,null)).status,401);
  for (const body of [{}, { ...dto, placa: 'bad' }, { ...dto, marca: '' }, { ...dto, ano_modelo: 2050 }, { ...dto, quantidade_lugares: 0 }, { ...dto, quantidade_lugares: '5' }, { ...dto, ano_modelo: 2020 }, { ...dto, proprietario_id: 'bob' }, { ...dto, status_cadastro: 'APROVADO' }]) assert.equal((await request('', 'POST', body)).status,400);
  const created = await request('', 'POST', dto); assert.equal(created.status,201);
  const vehicle = await created.json(), id = vehicle.id;
  assert.equal(vehicle.placa,'ABC1234'); assert.equal(vehicle.status_cadastro,'PENDENTE'); assert.equal(vehicle.proprietario_id,undefined); assert.equal(rows[0].proprietario_id,'alice');
  assert.equal((await request('', 'POST', dto)).status,409);
  const second = await request('', 'POST', { ...dto, placa: 'DEF5678' }, 'bob'); assert.equal(second.status,201);
  assert.equal((await request(`/${id}`, 'PATCH', { placa: 'def-5678' })).status,409);
  assert.equal((await (await request('/meus')).json()).total,1);
  assert.equal((await (await request('/meus', 'GET',undefined,'bob')).json()).items[0].placa,'DEF5678');
  assert.equal((await request('/meus?page=0')).status,400);
  assert.equal((await request(`/meus/${id}`)).status,200);
  assert.equal((await request(`/meus/${id}`,'GET',undefined,'bob')).status,404);
  assert.equal((await request(`/${id}`)).status,404);
  assert.equal((await request('/invalid')).status,400);
  assert.equal((await request(`/${randomUUID()}`)).status,404);
  assert.equal((await request(`/${id}`,'PATCH',{ modelo:'Corolla' },'bob')).status,404);
  assert.equal((await request(`/${id}`,'DELETE',undefined,'bob')).status,404);
  for (const body of [{}, { placa:null }, { proprietario_id:'bob' }, { id:randomUUID() }, { status_cadastro:'APROVADO' }]) assert.equal((await request(`/${id}`,'PATCH',body)).status,400);
  assert.equal((await request(`/${id}`,'PATCH',{ modelo:'Corolla' })).status,200);
  assert.equal(rows[0].modelo,'Corolla');
  documents=1; assert.equal((await request(`/${id}`,'PATCH',{ placa:'DEF5678' })).status,409); documents=0;
  rows[0].status_cadastro='APROVADO'; assert.equal((await request(`/${id}`,'PATCH',{ modelo:'Outra' })).status,409);
  rows[0].anuncio={ id:randomUUID(),status:'ATIVO' };
  const publicVehicle=await (await request(`/${id}`)).json(); assert.equal(publicVehicle.placa,undefined); assert.equal(publicVehicle.proprietario_id,undefined);
  announcements=1; assert.equal((await request(`/${id}`,'DELETE')).status,409); announcements=0;
  reservations=1; assert.equal((await request(`/${id}`,'DELETE')).status,409); reservations=0;
  assert.equal((await request(`/${id}`,'DELETE')).status,204); assert.ok(rows[0].desativado_em); assert.equal(rows.length,2);
  assert.equal((await request(`/${id}`)).status,404);
  assert.equal((await request(`/${id}`,'DELETE')).status,204);
  assert.equal((await request(`/${id}`,'PATCH',{modelo:'Nova'})).status,409);
});
