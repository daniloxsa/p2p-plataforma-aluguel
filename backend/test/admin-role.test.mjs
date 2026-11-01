import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { changeUserRole, planRoleOperation } from '../src/admin/admin-role-operation.ts';
import { connectionTarget, parseOptions, runAdminRole } from '../scripts/admin-role.mjs';

// Transactional mock: snapshots rollback on any error, including a failed audit insert.
function database(seed = [{ id: randomUUID(), papel: 'USUARIO', status: 'ATIVO', nome: 'Preserved', senha_hash: 'unchanged' }]) {
  const rows = structuredClone(seed), audit = [], writes = [], locks = [];
  let failAudit = false, queue = Promise.resolve();
  const tx = {
    async $executeRaw(query) { locks.push(query.join('')); },
    usuario: {
      async findUnique({ where }) { const row = rows.find(u => u.id === where.id); return row ? { ...row } : null; },
      async count({ where }) { return rows.filter(u => u.papel === where.papel && where.status.in.includes(u.status)).length; },
      async update({ where, data }) { const row = rows.find(u => u.id === where.id && u.papel === where.papel); assert.ok(row); writes.push(data); Object.assign(row, data); return { id: row.id, papel: row.papel }; },
    },
    auditoria_papel_usuario: { async create({ data }) { if (failAudit) throw new Error('audit unavailable'); const row = { id: randomUUID(), criado_em: new Date(), operador_banco: 'mock-role', ...data }; audit.push(row); return row; } },
  };
  const db = { ...tx, async $connect() {}, async $disconnect() {},
    async $transaction(fn) {
      const previous = queue; let release; queue = new Promise(r => { release = r; }); await previous;
      const snapshot = structuredClone(rows), length = audit.length;
      try { return await fn(tx); }
      catch (error) { rows.splice(0, rows.length, ...snapshot); audit.splice(length); throw error; }
      finally { release(); }
    },
  };
  return { db, rows, audit, writes, locks, failAudit: () => { failAudit = true; } };
}
const operation = (id, novoPapel = 'ADMIN') => ({ usuarioId: id, novoPapel, operador: 'operador-test', ambiente: 'LOCAL' });
const args = (id, action = 'promover', ambiente = 'local') => ['--acao', action, '--usuario', id, '--operador', 'operador-test', '--ambiente', ambiente];
const env = { DATABASE_URL: 'postgresql://test:do-not-print@localhost:5432/univia_test' };
const confirm = prompt => Promise.resolve(prompt.split('\n')[1]);

test('role promotion changes only role, writes audit and is idempotent', async () => {
  const { db, rows, audit, writes, locks } = database();
  const before = { ...rows[0] }, input = operation(rows[0].id);
  await planRoleOperation(db, input);
  assert.equal((await changeUserRole(db, input, 'USUARIO')).changed, true);
  assert.deepEqual(rows[0], { ...before, papel: 'ADMIN' }); assert.deepEqual(writes, [{ papel: 'ADMIN' }]);
  assert.deepEqual(audit.map(({ id, criado_em, operador_banco, ...record }) => record), [{ usuario_id: before.id,
    papel_anterior: 'USUARIO', papel_novo: 'ADMIN', operador: 'operador-test', ambiente: 'LOCAL' }]);
  assert.ok(audit[0].criado_em instanceof Date); assert.match(locks.join(' '), /LOCK TABLE public.usuario IN SHARE ROW EXCLUSIVE MODE/);
  assert.equal((await changeUserRole(db, input, 'ADMIN')).changed, false); assert.equal(audit.length, 1);
});

test('missing, ineligible, invalid and stale-confirmation targets cannot be promoted', async () => {
  const { db, rows, audit } = database();
  await assert.rejects(planRoleOperation(db, operation(randomUUID())), /não encontrado/);
  for (const status of ['SUSPENSO', 'EXCLUIDO', 'INVALIDO']) {
    rows[0].status = status; await assert.rejects(changeUserRole(db, operation(rows[0].id), 'USUARIO'), /não elegível/);
  }
  rows[0].status = 'PENDENTE_VERIFICACAO'; rows[0].papel = 'INVALIDO';
  await assert.rejects(planRoleOperation(db, operation(rows[0].id)), /Papel atual inválido/);
  rows[0].papel = 'ADMIN';
  await assert.rejects(changeUserRole(db, operation(rows[0].id, 'USUARIO'), 'USUARIO'), /desde a confirmação/);
  assert.equal(audit.length, 0);
});

test('audit insertion failure rolls the privilege change back', async () => {
  const { db, rows, audit, failAudit } = database(); failAudit();
  await assert.rejects(changeUserRole(db, operation(rows[0].id), 'USUARIO'), /audit unavailable/);
  assert.equal(rows[0].papel, 'USUARIO'); assert.equal(audit.length, 0);
});

test('last login-enabled admin is protected, including concurrent revocations', async () => {
  const { db, rows, audit } = database([
    { id: randomUUID(), papel: 'ADMIN', status: 'PENDENTE_VERIFICACAO' },
    { id: randomUUID(), papel: 'ADMIN', status: 'ATIVO' },
    { id: randomUUID(), papel: 'ADMIN', status: 'SUSPENSO' },
  ]);
  const results = await Promise.allSettled(rows.slice(0, 2).map(row => changeUserRole(db, operation(row.id, 'USUARIO'), 'ADMIN')));
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.match(results.find(r => r.status === 'rejected').reason.message, /último administrador/);
  assert.equal(rows.filter(row => row.papel === 'ADMIN' && row.status !== 'SUSPENSO').length, 1);
  assert.equal(audit.length, 1);
  // A disabled ADMIN grants no access and may be demoted without consuming an active admin.
  await changeUserRole(db, operation(rows[2].id, 'USUARIO'), 'ADMIN'); assert.equal(audit.length, 2);
});

test('CLI requires explicit ID/operator/action/environment and rejects unsafe arguments', () => {
  const id = randomUUID();
  for (const values of [[], ['--acao', 'promover'], args('bad'), [...args(id), '--yes'], [...args(id), '--usuario', id],
    ['--acao', 'promover', '--usuario', id, '--operador', ' ', '--ambiente', 'local']]) {
    assert.throws(() => parseOptions(values));
  }
  assert.equal(parseOptions(args(id)).operation.novoPapel, 'ADMIN');
  assert.equal(parseOptions(args(id, 'revogar')).operation.novoPapel, 'USUARIO');
});

test('remote/production destinations require independent explicit production authorization', () => {
  const local = parseOptions(args(randomUUID())), production = parseOptions(args(randomUUID(), 'promover', 'producao'));
  const target = connectionTarget(env, local);
  assert.ok(!target.label.includes('do-not-print')); assert.ok(!target.label.includes('test:'));
  for (const current of [{ ...env, NODE_ENV: 'production' }, { ...env, RENDER: 'true' },
    { DATABASE_URL: 'postgresql://test:do-not-print@production.example/univia' }]) {
    assert.throws(() => connectionTarget(current, local), /exige --ambiente producao/);
  }
  assert.throws(() => connectionTarget(env, production), /Autorização operacional adicional/);
  assert.throws(() => connectionTarget(env, { ...production, productionAuthorization: 'wrong' }), /Autorização operacional adicional/);
  assert.equal(connectionTarget(env, { ...production, productionAuthorization: target.fingerprint }).fingerprint, target.fingerprint);
  assert.throws(() => connectionTarget({ DATABASE_URL: `${env.DATABASE_URL}?host=production.example` }, local), /substituem o destino/);
  assert.throws(() => connectionTarget({ DATABASE_URL: 'invalid-with-credentials' }, local), /ausente ou inválida/);
});

test('CLI changes nothing without exact interactive confirmation; confirmed change is audited', async () => {
  const { db, rows, audit } = database(); const id = rows[0].id; const output = [];
  const dependencies = { env, terminal: true, open: async () => db, write: line => output.push(line) };
  await assert.rejects(runAdminRole(args(id), { ...dependencies, terminal: false }), /terminal interativo/);
  await assert.rejects(runAdminRole(args(id), { ...dependencies, ask: async () => 'yes' }), /cancelada/);
  assert.equal(rows[0].papel, 'USUARIO'); assert.equal(audit.length, 0);
  const result = await runAdminRole(args(id), { ...dependencies, ask: confirm });
  assert.equal(result.papel, 'ADMIN'); assert.equal(audit.length, 1);
  assert.ok(output.every(line => !line.includes('do-not-print')));
  await runAdminRole(args(id), { ...dependencies, ask: async () => { assert.fail('No prompt for no-op'); } });
  assert.equal(audit.length, 1);
  await assert.rejects(runAdminRole(args(id, 'revogar'), { ...dependencies, ask: async () => 'no' }), /cancelada/);
  assert.equal(rows[0].papel, 'ADMIN');
  await assert.rejects(runAdminRole(args(id, 'revogar'), { ...dependencies, ask: confirm }), /último administrador/);
});

test('CLI rejects production execution before opening a database without additional authorization', async () => {
  let opened = false;
  await assert.rejects(runAdminRole(args(randomUUID(), 'promover', 'producao'), {
    env, terminal: true, open: async () => { opened = true; assert.fail('Must not connect'); },
  }), /Autorização operacional adicional/);
  assert.equal(opened, false);
});
