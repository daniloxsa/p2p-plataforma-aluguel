import 'reflect-metadata';
import 'dotenv/config';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { request } from 'node:http';
import { AdminTestError, AdminTestCancelled, localTestConfig, validateDatabaseIdentity, safeHttpExplanation, loginSession } from './admin-test-safety.mjs';
import { readHidden } from './admin-test-input.mjs';

async function verifyDatabase(config) {
  const { Client } = await import('pg');
  const db = new Client({ connectionString: config.databaseUrl, connectionTimeoutMillis: 5000, query_timeout: 5000 });
  try {
    await db.connect();
    await db.query('BEGIN READ ONLY');
    const result = await db.query(`SELECT host(inet_server_addr()) AS server, host(inet_client_addr()) AS client,
      inet_server_port() AS port, current_database() AS database, pg_is_in_recovery() AS replica`);
    validateDatabaseIdentity(result.rows[0], config);
    const schema = await db.query(`SELECT EXISTS (SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'usuario' AND column_name = 'papel') AS role_ready,
      to_regclass('public.sessao_usuario') IS NOT NULL AS sessions_ready`);
    if (!schema.rows[0]?.role_ready || !schema.rows[0]?.sessions_ready) {
      throw new AdminTestError('Schema local incompleto para a Fase B.0. Nenhuma migration será executada pelo teste.');
    }
    await db.query('ROLLBACK');
  } finally { await db.end(); }
}

async function startLocalApi() {
  const [{ Module }, { NestFactory }, { AuthModule }, { AdminModule }, { PrismaService }, { setupApp }] = await Promise.all([
    import('@nestjs/common'), import('@nestjs/core'), import('../src/auth/auth.module.ts'),
    import('../src/admin/admin.module.ts'), import('../src/prisma/prisma.service.ts'), import('../src/setup-app.ts'),
  ]);
  // Real modules and providers. No overrides, mocks, token creation or guard bypass.
  // Exclude unrelated startup jobs (photo storage reconciliation) from this test.
  class AdminHttpIntegrationModule {}
  Module({ imports: [AuthModule, AdminModule] })(AdminHttpIntegrationModule);
  const app = await NestFactory.create(AdminHttpIntegrationModule, { logger: false, abortOnError: false });
  try {
    setupApp(app);
    await app.listen(0, '127.0.0.1');
    const address = app.getHttpServer().address();
    if (address.address !== '127.0.0.1') throw new AdminTestError('Listener HTTP não está restrito a loopback.');
    return { app, base: `http://127.0.0.1:${address.port}/api`, prisma: app.get(PrismaService) };
  } catch (error) { await app.close(); throw error; }
}

function http(base, path, { token, cookie, body } = {}) {
  const url = new URL(`${base}${path}`);
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || url.username || url.password) {
    throw new AdminTestError('Destino HTTP fora do listener local bloqueado.');
  }
  // node:http connects directly: no environment HTTP proxy or redirect following.
  return new Promise((resolve, reject) => {
    const req = request(url, {
      method: body === undefined ? 'GET' : 'POST', signal: AbortSignal.timeout(10000),
      headers: { 'Content-Type': 'application/json', ...(body === undefined ? {} : { 'X-UniVia-CSRF': '1' }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(cookie ? { Cookie: cookie } : {}) },
    }, response => {
      let text = '';
      response.setEncoding('utf8');
      response.on('data', chunk => { text += chunk; if (text.length > 1048576) req.destroy(new Error('Response too large')); });
      response.on('error', reject);
      response.on('end', () => {
        let data;
        try { data = JSON.parse(text); } catch { data = null; }
        resolve({ status: response.statusCode, data, cookies: response.headers['set-cookie'] || [] });
      });
    });
    req.on('error', reject);
    req.end(body === undefined ? undefined : JSON.stringify(body));
  });
}

export async function runAdminTest(args = []) {
  const checkOnly = args.length === 1 && args[0] === '--verificar-local';
  if (args.length && !checkOnly) throw new AdminTestError('Use npm run admin:test, ou node --import tsx scripts/admin-test.mjs --verificar-local. Não forneça credenciais por argumentos.');
  const results = [];
  const record = (name, passed, detail) => { results.push({ name, passed, detail }); };
  let api;
  let interrupted = false;
  const onInterrupt = () => { interrupted = true; };
  process.on('SIGINT', onInterrupt);
  const checkInterrupted = () => { if (interrupted) throw new AdminTestCancelled('Execução cancelada; limpeza das sessões conhecidas será tentada.'); };
  try {
    const config = localTestConfig(process.env);
    if (!checkOnly && (!process.stdin.isTTY || !process.stdout.isTTY)) throw new AdminTestError('Execute o teste completo em um terminal interativo. Não envie senhas por arquivos, argumentos ou pipe.');
    await verifyDatabase(config);
    checkInterrupted();
    api = await startLocalApi();
    record('API e PostgreSQL locais', true, 'Conexão PostgreSQL conferida; módulos reais em listener próprio 127.0.0.1, sem redirecionamentos.');
    const anonymous = await http(api.base, '/admin/me');
    record('Sem autenticação → 401', anonymous.status === 401, `HTTP ${anonymous.status}.`);
    if (anonymous.status !== 401) throw new AdminTestError('A rota não confirmou a proteção anônima esperada; testes autenticados interrompidos.');
    if (!checkOnly) {
      console.log('Credenciais usadas somente neste processo e enviadas apenas ao listener local. E-mail e senha não aparecem ao digitar.');
      console.log('Os logins criam sessões normais; o teste tentará revogar apenas as sessões que ele criar. Ctrl+C cancela a entrada.');
      const seen = new Set();
      for (const role of ['USUARIO', 'ADMIN']) {
        let session, credentials, attempted = false, loginStatus;
        try {
          checkInterrupted();
          const email = (await readHidden(`E-mail da conta ${role} (oculto): `)).trim().toLowerCase();
          if (!/^\S+@\S+\.\S+$/.test(email)) throw new AdminTestError('Formato de e-mail inválido; nada foi enviado.');
          if (seen.has(email)) throw new AdminTestError('Informe contas diferentes para USUARIO e ADMIN.');
          seen.add(email);
          credentials = { email, senha: await readHidden(`Senha da conta ${role} (oculta): `, { maxLength: 128 }) };
          if (!credentials.senha) throw new AdminTestError('Senha vazia; nada foi enviado.');
          const account = await api.prisma.usuario.findUnique({ where: { email }, select: { id: true, papel: true, status: true } });
          attempted = true;
          const login = await http(api.base, '/auth/login', { body: credentials });
          loginStatus = login.status;
          credentials.senha = ''; credentials = null;
          session = loginSession(login.data, login.cookies);
          checkInterrupted();
          if (login.status !== 200 || !session.valid) {
            record(`Login ${role}`, false, `HTTP ${login.status}. ${login.status === 200 ? 'Resposta não contém a sessão Bearer/cookie esperada.' : safeHttpExplanation('login', login.status, login.data, account)}`);
            record(`${role} → ${role === 'ADMIN' ? '200 ADMIN' : '403'}`, false, 'Não executado: login não confirmou uma sessão válida.');
            continue;
          }
          record(`Login ${role}`, true, 'HTTP 200; access token e refresh cookie recebidos e mantidos apenas em memória.');
          const expected = role === 'ADMIN' ? 200 : 403;
          const result = await http(api.base, '/admin/me', { token: session.token });
          const minimalAdmin = role !== 'ADMIN' || (result.data?.papel === 'ADMIN' && result.data.id === session.userId &&
            typeof result.data.nome === 'string' && Object.keys(result.data).sort().join(',') === 'id,nome,papel');
          const correctAccount = account?.papel === role && account?.id === session.userId;
          const passed = result.status === expected && minimalAdmin && correctAccount;
          const detail = result.status === 401 ? safeHttpExplanation('admin', result.status, result.data) :
            !correctAccount ? 'A conta informada não tem o papel esperado no banco local ou a identidade retornada divergiu.' :
              !minimalAdmin ? 'A resposta ADMIN não corresponde ao contrato mínimo esperado.' : `HTTP ${result.status}; esperado ${expected}.`;
          record(`${role} → ${role === 'ADMIN' ? '200 ADMIN' : '403'}`, passed, `HTTP ${result.status}; esperado ${expected}. ${detail}`);
        } catch (error) {
          if (error instanceof AdminTestCancelled) throw error;
          record(`Cenário ${role}`, false, error instanceof AdminTestError ? error.message : 'Falha de conexão/consulta local. Detalhes brutos foram omitidos para proteger credenciais.');
        } finally {
          if (credentials) { credentials.senha = ''; credentials = null; }
          if (session?.cookie) {
            try {
              const logout = await http(api.base, '/auth/logout', { cookie: session.cookie, body: {} });
              record(`Logout da sessão de teste ${role}`, logout.status === 204, `HTTP ${logout.status}; esperado 204.`);
            } catch { record(`Logout da sessão de teste ${role}`, false, 'Não foi possível confirmar a revogação; a sessão de teste pode permanecer até expirar.'); }
          } else if (attempted && (loginStatus === undefined || loginStatus === 200 || loginStatus >= 500)) {
            record(`Limpeza da sessão ${role}`, false, 'Não houve cookie utilizável para logout. Se o login criou uma sessão antes de falhar, ela pode permanecer até expirar.');
          }
          if (session) { session.token = null; session.cookie = null; }
        }
      }
    }
  } catch (error) {
    record('Pré-condições / execução', false, error instanceof AdminTestError ? error.message : 'Não foi possível confirmar banco/API locais. Verifique a conexão, o schema/client e as configurações locais; nenhum detalhe sensível foi registrado.');
  } finally {
    if (api) {
      try { await api.app.close(); } catch { record('Encerramento do listener local', false, 'Falha ao encerrar recursos locais.'); }
    }
    process.removeListener('SIGINT', onInterrupt);
    if (interrupted && !results.some(item => !item.passed)) record('Cancelamento', false, 'Teste interrompido pelo operador.');
    if (!checkOnly) {
      for (const name of ['Sem autenticação → 401', 'USUARIO → 403', 'ADMIN → 200 ADMIN']) {
        if (!results.some(item => item.name === name)) record(name, false, 'Não executado: pré-condição, credenciais ou entrada não permitiram concluir o cenário.');
      }
    }
    console.log('\nRelatório admin:test');
    for (const item of results) console.log(`${item.passed ? 'PASSOU' : 'FALHOU'} — ${item.name}: ${item.detail}`);
    if (checkOnly) console.log('NÃO EXECUTADO — Login USUARIO/ADMIN e cenários autenticados: modo de verificação sem credenciais.');
    console.log('Nenhuma conta, papel, senha ou estrutura foi alterada. Login/logout podem criar/revogar sessões normais.');
  }
  return results.some(item => !item.passed) ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  runAdminTest(process.argv.slice(2)).then(code => { process.exitCode = code; }).catch(error => {
    console.error(`FALHOU — ${error instanceof AdminTestError ? error.message : 'Execução interrompida; detalhes sensíveis omitidos.'}`);
    process.exitCode = 1;
  });
}
