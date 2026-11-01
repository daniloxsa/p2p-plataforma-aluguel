import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PassThrough, Writable } from 'node:stream';
import { AdminTestCancelled, localTestConfig, validateDatabaseIdentity, safeHttpExplanation, loginSession } from '../scripts/admin-test-safety.mjs';
import { readHidden } from '../scripts/admin-test-input.mjs';

const local = { DATABASE_URL: 'postgresql://test:not-a-real-password@localhost:5432/univia_local' };

test('admin HTTP runner: local configuration is explicit and fails closed without leaking URLs', () => {
  const config = localTestConfig(local);
  assert.equal(config.database, 'univia_local'); assert.equal(config.port, 5432);
  for (const values of [{}, { DATABASE_URL: 'not-a-url-with-secrets' },
    { DATABASE_URL: 'postgresql://test:secret@production.example/univia' },
    { DATABASE_URL: 'postgresql://test:secret@localhost.evil.example/univia' },
    { ...local, NODE_ENV: 'production' }, { ...local, RENDER: 'true' }, { ...local, RENDER_SERVICE_ID: 'service' },
    { ...local, PGSERVICE: 'production' }, { ...local, PGHOSTADDR: '198.51.100.2' },
    { DATABASE_URL: `${local.DATABASE_URL}?host=production.example` },
    { DATABASE_URL: `${local.DATABASE_URL}?port=6432` }, { DATABASE_URL: `${local.DATABASE_URL}?database=other` },
    { DATABASE_URL: 'postgresql://localhost/' }, { DATABASE_URL: 'https://localhost/univia' },
    { DATABASE_URL: 'postgresql://localhost/univia', PGPORT: 'bad' },
  ]) {
    assert.throws(() => localTestConfig(values), error => !/secret|password|production.example|not-a-url/.test(error.message));
  }
  // Storage config does not cause a connection: this test imports no storage module.
  assert.equal(localTestConfig({ ...local, SUPABASE_URL: 'https://storage.example' }).database, 'univia_local');
});

test('admin HTTP runner: PostgreSQL identity must match local connection, port and database', () => {
  const config = localTestConfig(local);
  const identity = { server: '::1', client: '::1', port: 5432, database: 'univia_local', replica: false };
  validateDatabaseIdentity(identity, config);
  for (const patch of [{ server: '10.0.0.2' }, { client: '172.17.0.1' }, { port: 6432 }, { database: 'other' }, { replica: true }]) {
    assert.throws(() => validateDatabaseIdentity({ ...identity, ...patch }, config), /não comprovou/);
  }
  assert.throws(() => validateDatabaseIdentity(null, config));
});

test('admin HTTP runner: known 401 bodies give bounded explanations and never echo arbitrary bodies', () => {
  const generic = { message: 'Credenciais ou sessao invalidas.' };
  assert.match(safeHttpExplanation('login', 401, generic, null), /não encontrou/);
  assert.match(safeHttpExplanation('login', 401, generic, { status: 'SUSPENSO' }), /não permite login/);
  assert.match(safeHttpExplanation('login', 401, generic, { status: 'ATIVO' }), /senha incorreta ou hash/);
  assert.match(safeHttpExplanation('admin', 401, generic), /não identifica qual/);
  assert.match(safeHttpExplanation('admin', 401, { message: 'Token de acesso obrigatorio.' }), /ausência de Bearer/);
  const secret = 'never-echo-token-cookie-password';
  for (const status of [400, 401, 403, 404, 429, 500]) {
    assert.ok(!safeHttpExplanation('login', status, { message: secret, token: secret }).includes(secret));
  }
});

test('admin HTTP runner: session parser requires real login contract and keeps only the expected cookie', () => {
  // Synthetic strings test parsing only; these are never used for authentication/HTTP.
  const body = { tokenType: 'Bearer', accessToken: 'segment.segment.segment', expiresIn: 900, user: { id: 'test-id' } };
  const cookies = ['other=unrelated; HttpOnly', `univia_refresh=${'a'.repeat(43)}; HttpOnly; Path=/api/auth`];
  assert.equal(loginSession(body, cookies).valid, true);
  assert.equal(loginSession(body, cookies).cookie, `univia_refresh=${'a'.repeat(43)}`);
  assert.equal(loginSession(body, []).valid, false);
  assert.equal(loginSession({ ...body, tokenType: 'other' }, cookies).valid, false);
  assert.equal(loginSession({ ...body, accessToken: null }, cookies).valid, false);
});

function terminal() {
  const input = new PassThrough(); input.isTTY = true; input.isRaw = false;
  input.setRawMode = value => { input.isRaw = value; };
  let text = '';
  const output = new Writable({ write(chunk, encoding, callback) { text += chunk.toString(); callback(); } });
  output.isTTY = true;
  return { input, output, text: () => text };
}

test('admin HTTP runner: terminal input is invisible, supports correction and restores raw mode', async () => {
  const t = terminal();
  const result = readHidden('Senha oculta: ', t);
  t.input.write('synthetic-secrex\x7ft\r');
  assert.equal(await result, 'synthetic-secret');
  assert.equal(t.text(), 'Senha oculta: \n');
  assert.equal(t.input.isRaw, false); assert.equal(t.input.isPaused(), true);
  assert.equal(t.input.listenerCount('keypress'), 0);
});

test('admin HTTP runner: cancellation, oversized input and non-TTY credentials fail safely', async () => {
  const t = terminal(); const before = process.listenerCount('SIGINT');
  const cancelled = readHidden('Senha: ', t); t.input.write('\x03');
  await assert.rejects(cancelled, AdminTestCancelled);
  assert.equal(t.input.isRaw, false); assert.equal(process.listenerCount('SIGINT'), before);
  const limited = readHidden('Senha: ', { ...t, maxLength: 3 }); t.input.write('toolong');
  await assert.rejects(limited, /limite/); assert.ok(!t.text().includes('toolong'));
  t.input.isTTY = false; await assert.rejects(readHidden('Senha: ', t), /terminal interativo/);
});
