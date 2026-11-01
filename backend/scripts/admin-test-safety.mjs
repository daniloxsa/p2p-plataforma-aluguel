export class AdminTestError extends Error {}
export class AdminTestCancelled extends AdminTestError {}
export const isLoopback = host => ['localhost', '127.0.0.1', '::1', '[::1]'].includes(host);

export function localTestConfig(env) {
  if (env.NODE_ENV === 'production' || env.RENDER || env.RENDER_SERVICE_ID) {
    throw new AdminTestError('Configuração de produção/Render detectada. Teste interrompido antes de conectar.');
  }
  let url;
  try { url = new URL(env.DATABASE_URL); } catch { throw new AdminTestError('DATABASE_URL ausente ou inválida.'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !isLoopback(url.hostname) || url.pathname.length < 2) {
    throw new AdminTestError('DATABASE_URL deve identificar explicitamente um PostgreSQL em loopback. Nenhuma conexão externa é permitida.');
  }
  const overrides = ['host', 'hostaddr', 'port', 'dbname', 'database', 'service'];
  if ([...url.searchParams.keys()].some(key => overrides.includes(key.toLowerCase())) || env.PGSERVICE || env.PGHOSTADDR) {
    throw new AdminTestError('Substituições de destino PostgreSQL não são permitidas neste teste.');
  }
  let database;
  try { database = decodeURIComponent(url.pathname.slice(1)); } catch { throw new AdminTestError('Nome do banco inválido.'); }
  if (/\p{C}/u.test(database)) throw new AdminTestError('Nome do banco inválido.');
  const port = Number(url.port || env.PGPORT || 5432);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new AdminTestError('Porta PostgreSQL inválida.');
  return { databaseUrl: env.DATABASE_URL, database, port };
}

export function validateDatabaseIdentity(row, config) {
  if (!row || !isLoopback(row.server) || !isLoopback(row.client) || row.database !== config.database || Number(row.port) !== config.port || row.replica !== false) {
    throw new AdminTestError('O PostgreSQL não comprovou uma conexão local direta com o banco/porta configurados. Teste interrompido.');
  }
}

export function safeHttpExplanation(stage, status, body, account) {
  // Never print arbitrary HTTP bodies: they may contain secrets or unexpected HTML.
  const message = typeof body?.message === 'string' ? body.message : '';
  if (status === 401) {
    if (message === 'Token de acesso obrigatorio.') return 'O guard informou ausência de Bearer. Confira o transporte do token obtido no login.';
    if (message === 'Credenciais ou sessao invalidas.') {
      if (stage === 'login') {
        if (account === null) return 'A resposta de login é genérica; a consulta local somente de leitura não encontrou a conta informada.';
        if (account && !['PENDENTE_VERIFICACAO', 'ATIVO', 'VERIFICADO'].includes(account.status)) return 'A resposta de login é genérica; o status atual da conta local não permite login.';
        return 'O login recusou as credenciais. Possíveis causas: senha incorreta ou hash de senha inválido. A mensagem pública não distingue essas causas.';
      }
      return 'O JWT ou a sessão foi recusado. O fluxo valida assinatura, expiração, issuer/audience, tipo, vínculo da sessão, revogação e status da conta. O corpo genérico não identifica qual verificação falhou; este teste usa um token recém-obtido do mesmo listener.';
    }
    return 'HTTP 401 com corpo não reconhecido. A causa exata não pode ser inferida com segurança. Nenhum corpo ou token foi registrado.';
  }
  if (status === 403) return stage === 'login' ? 'O login foi bloqueado por CSRF/origem; o teste envia X-UniVia-CSRF: 1.' : 'A sessão foi autenticada, mas o papel atual não recebeu acesso administrativo.';
  if (status === 400) return 'A API rejeitou o formato dos dados de login. Confira o e-mail e o limite de 128 caracteres da senha.';
  if (status === 429) return 'Limite de tentativas atingido. Aguarde antes de executar novamente.';
  if (status >= 500) return 'Erro interno da API. Verifique o schema/client local e a disponibilidade do banco, sem publicar segredos dos logs.';
  return 'A API retornou um status ou formato diferente do contrato esperado.';
}

export function loginSession(body, setCookies) {
  const cookie = setCookies.map(value => /^univia_refresh=([A-Za-z0-9_-]{43})(?:;|$)/.exec(value)?.[0]?.split(';')[0]).find(Boolean);
  const valid = body?.tokenType === 'Bearer' && typeof body.accessToken === 'string' &&
    /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(body.accessToken) &&
    typeof body.user?.id === 'string' && typeof body.expiresIn === 'number' && body.expiresIn > 0;
  return { valid: Boolean(valid && cookie), token: valid ? body.accessToken : null, userId: valid ? body.user.id : null, cookie };
}
