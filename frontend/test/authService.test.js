import { describe, expect, it, vi } from 'vitest';
import { ApiClient } from '../src/api/client';
import { AuthService } from '../src/services/authService';
import { registrationPayload } from '../src/services/authValidation';

const user = { id: 'user-1', nome: 'João Silva', email: 'joao@example.com', telefone: null, status: 'PENDENTE_VERIFICACAO' };
const session = (token = 'new-token') => ({ accessToken: token, tokenType: 'Bearer', expiresIn: 900, user });
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const make = () => { const client = new ApiClient('http://api.test/api'); return { client, auth: new AuthService(client) }; };
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };

describe('sessão e cliente HTTP', () => {
  it('normaliza cadastro, valida CPF e mantém senha intacta', () => {
    const form = { nome: ' João Silva ', cpf: '123.456.789-09', email: ' JOAO@EXAMPLE.COM ', telefone: '', senha: 'SenhaForte@123', confirmacao: 'SenhaForte@123' };
    expect(registrationPayload(form)).toEqual({ nome: 'João Silva', cpf: '12345678909', email: 'joao@example.com', senha: form.senha });
    expect(() => registrationPayload({ ...form, cpf: '11111111111' })).toThrow('CPF');
    expect(() => registrationPayload({ ...form, senha: 'weak' })).toThrow('12 a 128');
  });

  it('envia cadastro com CSRF/cookie e não autentica', async () => {
    const { auth } = make();
    const fetch = vi.fn(() => Promise.resolve(json(user, 201))); vi.stubGlobal('fetch', fetch);
    expect(await auth.register({ nome: user.nome })).toEqual(user);
    expect(fetch.mock.calls[0][1]).toMatchObject({ credentials: 'include', method: 'POST', headers: { 'X-UniVia-CSRF': '1' } });
    expect(auth.state.isAuthenticated).toBe(false);
  });

  it('confirma login somente depois de /me e armazena token apenas em memória', async () => {
    const { auth } = make(); const me = deferred();
    const fetch = vi.fn(url => url.endsWith('/login') ? Promise.resolve(json(session())) : me.promise); vi.stubGlobal('fetch', fetch);
    const pending = auth.login({ email: ' JOAO@EXAMPLE.COM ', senha: 'SenhaForte@123' });
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    expect(auth.state.isAuthenticated).toBe(false);
    expect(JSON.parse(fetch.mock.calls[0][1].body).email).toBe('joao@example.com');
    expect(fetch.mock.calls[1][1].headers.Authorization).toBe('Bearer new-token');
    me.resolve(json(user)); await pending;
    expect(auth.state).toMatchObject({ user, accessToken: 'new-token', isAuthenticated: true, isAuthLoading: false });
    expect(localStorage.getItem('accessToken')).toBeNull(); expect(sessionStorage.length).toBe(0);
  });

  it('recusa confirmação de identidade diferente', async () => {
    const { auth } = make();
    vi.stubGlobal('fetch', vi.fn(url => Promise.resolve(json(url.endsWith('/login') ? session() : { ...user, id: 'other' }))));
    await expect(auth.login({ email: user.email, senha: 'wrong' })).rejects.toMatchObject({ status: 401 });
    expect(auth.state.user).toBeNull();
  });

  it('restaura uma única sessão mesmo com chamadas simultâneas/StrictMode', async () => {
    const { auth } = make();
    const fetch = vi.fn(url => Promise.resolve(json(url.endsWith('/refresh') ? session() : user))); vi.stubGlobal('fetch', fetch);
    const first = auth.restore(); expect(auth.restore()).toBe(first); await first;
    await auth.restore();
    expect(fetch).toHaveBeenCalledTimes(2); expect(auth.state.isAuthenticated).toBe(true);
  });

  it('sem cookie válido termina restauração desautenticado e sem loop', async () => {
    const { auth } = make(); const fetch = vi.fn(() => Promise.resolve(json({}, 401))); vi.stubGlobal('fetch', fetch);
    await auth.restore(); expect(fetch).toHaveBeenCalledTimes(1);
    expect(auth.state).toMatchObject({ user: null, accessToken: null, isAuthenticated: false, isAuthLoading: false });
  });

  it('compartilha refresh e repete duas requisições protegidas com o novo token', async () => {
    const { auth, client } = make(); const gate = deferred(); let refreshes = 0;
    auth.update({ user, accessToken: 'old-token', isAuthenticated: true, isAuthLoading: false });
    const fetch = vi.fn(async (url, options) => {
      if (url.endsWith('/refresh')) { refreshes++; await gate.promise; return json(session()); }
      if (url.endsWith('/me')) return json(user);
      return options.headers.Authorization === 'Bearer new-token' ? json({ ok: true }) : json({}, 401);
    }); vi.stubGlobal('fetch', fetch);
    const a = client.get('/protected-a', { auth: true }); const b = client.get('/protected-b', { auth: true });
    await vi.waitFor(() => expect(refreshes).toBe(1)); gate.resolve();
    expect(await Promise.all([a, b])).toEqual([{ ok: true }, { ok: true }]);
    expect(refreshes).toBe(1); expect(fetch).toHaveBeenCalledTimes(6);
  });

  it('uma resposta 401 atrasada usa a renovação já concluída', async () => {
    const { auth, client } = make(); const delayed = deferred(); let refreshes = 0;
    auth.update({ user, accessToken: 'old-token', isAuthenticated: true });
    vi.stubGlobal('fetch', vi.fn(async (url, options) => {
      if (url.endsWith('/refresh')) { refreshes++; return json(session()); }
      if (url.endsWith('/me')) return json(user);
      if (options.headers.Authorization === 'Bearer new-token') return json({ ok: true });
      if (url.endsWith('/slow')) return delayed.promise;
      return json({}, 401);
    }));
    const slow = client.get('/slow', { auth: true });
    await client.get('/fast', { auth: true }); delayed.resolve(json({}, 401));
    await slow; expect(refreshes).toBe(1);
  });

  it('refresh inválido limpa sessão e nunca faz refresh recursivo', async () => {
    const { auth, client } = make(); auth.update({ user, accessToken: 'expired', isAuthenticated: true });
    const fetch = vi.fn(() => Promise.resolve(json({}, 401))); vi.stubGlobal('fetch', fetch);
    await expect(client.get('/protected', { auth: true })).rejects.toMatchObject({ status: 401 });
    expect(fetch).toHaveBeenCalledTimes(2); expect(auth.state.isAuthenticated).toBe(false);
  });

  it('repete a requisição no máximo uma vez', async () => {
    const { auth, client } = make(); auth.update({ user, accessToken: 'expired', isAuthenticated: true });
    const fetch = vi.fn(url => Promise.resolve(json(url.endsWith('/refresh') ? session() : url.endsWith('/me') ? user : {}, url.includes('/protected') ? 401 : 200))); vi.stubGlobal('fetch', fetch);
    await expect(client.get('/protected', { auth: true })).rejects.toMatchObject({ status: 401 });
    expect(fetch).toHaveBeenCalledTimes(4); expect(auth.state.accessToken).toBeNull();
  });

  it.each([400, 403, 409, 429, 500, 503])('trata HTTP %s sem tentar refresh ou expor detalhes', async status => {
    const { client } = make(); const fetch = vi.fn(() => Promise.resolve(json({ stack: 'secret-details' }, status))); vi.stubGlobal('fetch', fetch);
    const error = await client.get('/protected', { auth: true }).catch(e => e);
    expect(error.status).toBe(status); expect(error.message).not.toContain('secret'); expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('trata erro de conexão e logout indisponível limpando a sessão local', async () => {
    const { auth } = make(); auth.update({ user, accessToken: 'token', isAuthenticated: true });
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('Sensitive connection detail'))));
    await expect(auth.logout()).rejects.toMatchObject({ status: 0, message: expect.stringContaining('conectar') });
    expect(auth.state).toMatchObject({ user: null, accessToken: null, isAuthenticated: false });
  });

  it('logout aguarda refresh em curso e impede restauração tardia', async () => {
    const { auth } = make(); const gate = deferred(); const paths = [];
    vi.stubGlobal('fetch', vi.fn(async url => {
      paths.push(url.split('/').at(-1));
      if (url.endsWith('/refresh')) { await gate.promise; return json(session()); }
      if (url.endsWith('/logout')) return new Response(null, { status: 204 });
      return json(user);
    }));
    const refresh = auth.refresh().catch(() => {}); const logout = auth.logout();
    gate.resolve(); await Promise.all([refresh, logout]);
    expect(paths.at(-1)).toBe('logout'); expect(auth.state.isAuthenticated).toBe(false);
  });
});
