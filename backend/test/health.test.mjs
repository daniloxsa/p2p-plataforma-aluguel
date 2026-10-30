import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module.ts';
import { PrismaService } from '../src/prisma/prisma.service.ts';

test('GET /api/health reports database availability', async (t) => {
  let databaseError;
  let queries = 0;
  const prisma = {
    async $queryRaw(strings) {
      assert.equal(strings.join(''), 'SELECT 1 AS connected');
      queries++;
      if (databaseError) throw databaseError;
      return [{ connected: 1 }];
    },
  };

  class TestModule {}
  Module({
    controllers: Reflect.getMetadata('controllers', AppModule),
    providers: [{ provide: PrismaService, useValue: prisma }],
  })(TestModule);

  const app = await NestFactory.create(TestModule, { logger: false });
  t.after(() => app.close());
  app.setGlobalPrefix('api');
  await app.listen(0, '127.0.0.1');
  const url = `${await app.getUrl()}/api/health`;

  await t.test('returns 200 when the query succeeds', async () => {
    const response = await fetch(url);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      status: 'ok', database: 'connected',
    });
    assert.equal(queries, 1);
  });

  await t.test('returns 503 when the query fails', async (t) => {
    databaseError = new Error('Database unavailable');
    t.mock.method(console, 'error', () => {});
    const response = await fetch(url);
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), {
      status: 'error', database: 'disconnected',
    });
    assert.equal(queries, 2);
  });
});
