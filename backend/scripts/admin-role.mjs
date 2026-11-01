import 'dotenv/config';
import { createHash } from 'node:crypto';
import { createInterface } from 'node:readline/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { AdminOperationError, changeUserRole, planRoleOperation, validateRoleOperation } from '../src/admin/admin-role-operation.ts';

const help = `Controle operacional de papel (nunca executado no startup).
Uso: npm run admin:papel -- --acao promover|revogar --usuario <UUID> --operador <identificação> --ambiente local|producao
Destino remoto, NODE_ENV=production ou Render: exige --ambiente producao e
--autorizar-producao <impressão-do-destino>, além da confirmação digitada no terminal.
Não há --yes nem promoção por HTTP. Apenas contas já cadastradas são alteradas.`;

export function parseOptions(args) {
  const allowed = ['acao', 'usuario', 'operador', 'ambiente', 'autorizar-producao'];
  const options = {};
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i]?.replace(/^--/, '');
    if (!args[i]?.startsWith('--') || !allowed.includes(key) || options[key] !== undefined || !args[i + 1] || args[i + 1].startsWith('--')) {
      throw new AdminOperationError('Argumentos inválidos ou repetidos. Use --help.');
    }
    options[key] = args[i + 1];
  }
  if (!['promover', 'revogar'].includes(options.acao) || !['local', 'producao'].includes(options.ambiente)) {
    throw new AdminOperationError('Informe --acao promover|revogar e --ambiente local|producao.');
  }
  const operation = { usuarioId: options.usuario, operador: options.operador,
    novoPapel: options.acao === 'promover' ? 'ADMIN' : 'USUARIO', ambiente: options.ambiente === 'local' ? 'LOCAL' : 'PRODUCAO' };
  validateRoleOperation(operation);
  return { operation, productionAuthorization: options['autorizar-producao'] };
}

export function connectionTarget(env, options) {
  let url;
  try { url = new URL(env.DATABASE_URL); } catch { throw new AdminOperationError('DATABASE_URL ausente ou inválida.'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname || url.pathname.length < 2) {
    throw new AdminOperationError('Configure uma conexão PostgreSQL com banco explícito.');
  }
  // pg supports host/port overrides in query parameters; never classify one
  // destination as local while the driver connects to another.
  if ([...url.searchParams.keys()].some(key => ['host', 'hostaddr', 'port', 'dbname', 'database', 'service'].includes(key.toLowerCase()))) {
    throw new AdminOperationError('Parâmetros que substituem o destino não são permitidos no script operacional.');
  }
  let database;
  try { database = decodeURIComponent(url.pathname.slice(1)); } catch { throw new AdminOperationError('Nome do banco inválido.'); }
  if (/\p{C}/u.test(database) || /\p{C}/u.test(url.hostname)) throw new AdminOperationError('Destino inválido.');
  const port = url.port || env.PGPORT || '5432';
  if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535) throw new AdminOperationError('Porta PostgreSQL inválida.');
  const label = `${url.hostname}:${port}/${database}`;
  const fingerprint = createHash('sha256').update(label).digest('hex').slice(0, 16);
  const loopback = ['localhost', '127.0.0.1', '::1', '[::1]'].includes(url.hostname);
  const production = !loopback || env.NODE_ENV === 'production' || env.RENDER === 'true' || Boolean(env.RENDER_SERVICE_ID);
  if (production && options.operation.ambiente !== 'PRODUCAO') {
    throw new AdminOperationError(`Destino exige --ambiente producao. Impressão do destino: ${fingerprint}.`);
  }
  if (options.operation.ambiente === 'PRODUCAO' && options.productionAuthorization !== fingerprint) {
    throw new AdminOperationError(`Autorização operacional adicional obrigatória: --autorizar-producao ${fingerprint}. Nenhuma alteração realizada.`);
  }
  return { label, fingerprint };
}

export async function runAdminRole(args, dependencies = {}) {
  const write = dependencies.write || console.log;
  if (args.length === 1 && args[0] === '--help') { write(help); return; }
  const options = parseOptions(args);
  const target = connectionTarget(dependencies.env || process.env, options);
  if (!(dependencies.terminal ?? (process.stdin.isTTY && process.stdout.isTTY))) {
    throw new AdminOperationError('É obrigatório um terminal interativo para confirmar a operação.');
  }
  write(`Ambiente: ${options.operation.ambiente}. Destino: ${target.label}. Impressão: ${target.fingerprint}.`);
  let readline, prisma;
  try {
    prisma = dependencies.open ? await dependencies.open() : new (await import('../src/prisma/prisma.service.ts')).PrismaService();
    await prisma.$connect();
    const plan = await planRoleOperation(prisma, options.operation);
    if (plan.papel === options.operation.novoPapel) { write(`Usuário ${plan.id}: papel já é ${plan.papel}. Nenhuma alteração ou auditoria adicional.`); return; }
    const text = `ALTERAR ${plan.id} ${plan.papel} ${options.operation.novoPapel} ${options.operation.ambiente} ${target.fingerprint}`;
    const ask = dependencies.ask || (readline = createInterface({ input: process.stdin, output: process.stdout })).question.bind(readline);
    const answer = await ask(`Operador: ${options.operation.operador}. Digite exatamente:\n${text}\n> `);
    if (answer !== text) throw new AdminOperationError('Confirmação divergente. Operação cancelada sem alterações.');
    const result = await changeUserRole(prisma, options.operation, plan.papel);
    write(`Usuário ${result.id}: papel ${result.papel}. ${result.changed ? 'Alteração e auditoria confirmadas na mesma transação.' : 'Nenhuma alteração necessária.'}`);
    return result;
  } finally {
    readline?.close();
    if (prisma) await prisma.$disconnect();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  runAdminRole(process.argv.slice(2)).catch(error => {
    // Prisma errors may contain connection details: never print raw errors/stacks.
    console.error(error instanceof AdminOperationError ? error.message : 'Operação não concluída. Verifique schema, conexão e privilégios do operador. Nenhuma mudança sem auditoria é confirmada.');
    process.exitCode = 1;
  });
}
