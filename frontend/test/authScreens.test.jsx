import { StrictMode } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { AppProvider } from '../src/store/AppContext';
import { authService } from '../src/services/authService';
import ProtectedRoute from '../src/components/ProtectedRoute';
import { Header } from '../src/components/ui';
import Login from '../src/pages/Login';
import Register from '../src/pages/Register';

const user = { id: 'user-1', nome: 'João Silva', email: 'joao@example.com', telefone: null, status: 'PENDENTE_VERIFICACAO' };
const session = { accessToken: 'test-access', tokenType: 'Bearer', expiresIn: 900, user };
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const change = (label, value) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

beforeEach(() => {
  authService.clear();
  authService.restorePromise = null; authService.refreshPromise = null; authService.loginPromise = null; authService.logoutPromise = null;
  authService.update({ isAuthLoading: true });
  localStorage.clear(); sessionStorage.clear();
});

function Location() { const location = useLocation(); return <span data-testid="location">{location.pathname}</span>; }
function mount(path = '/login', strict = false) {
  const app = <AppProvider><MemoryRouter initialEntries={[path]}><Header /><Location /><Routes>
    <Route path="/login" element={<Login />} /><Route path="/cadastro" element={<Register />} />
    <Route path="/" element={<h1>Página inicial</h1>} />
    <Route element={<ProtectedRoute />}><Route path="/painel" element={<h1>Área protegida</h1>} /></Route>
  </Routes></MemoryRouter></AppProvider>;
  return render(strict ? <StrictMode>{app}</StrictMode> : app);
}
const fetchWith = (handler) => {
  const mock = vi.fn(async (url, options) => handler(url, options)); vi.stubGlobal('fetch', mock); return mock;
};
const loginReady = async () => { await waitFor(() => expect(within(screen.getByLabelText('E-mail').closest('form')).getByRole('button', { name: 'Entrar', exact: true }).disabled).toBe(false)); };
function fillLogin() { change('E-mail', user.email); change('Senha', 'SenhaForte@123'); }
function fillRegister(cpf = '123.456.789-09') {
  change('Nome completo', 'João Silva'); change('CPF', cpf); change('E-mail', 'JOAO@example.com');
  change('Senha', 'SenhaForte@123'); change('Confirmar senha', 'SenhaForte@123');
}

it('rota protegida aguarda restauração e não confia em ds_user', async () => {
  let resolve;
  const gate = new Promise(r => { resolve = r; });
  localStorage.setItem('ds_user', JSON.stringify({ nome: 'Fake', status: 'Verificado' }));
  const fetch = fetchWith(async () => { await gate; return json({}, 401); });
  mount('/painel', true);
  expect(screen.getByTestId('location').textContent).toBe('/painel');
  expect(screen.getByRole('status').textContent).toContain('Verificando');
  resolve();
  await screen.findByRole('heading', { name: 'Entrar' });
  expect(fetch).toHaveBeenCalledTimes(1); expect(localStorage.getItem('ds_user')).toBeNull();
});

it('atualização com cookie válido restaura usuário pendente sem exigir KYC', async () => {
  const fetch = fetchWith(url => json(url.endsWith('/refresh') ? session : user));
  mount('/painel', true);
  await screen.findByRole('heading', { name: 'Área protegida' });
  expect(screen.getByText(/João Silva · PENDENTE_VERIFICACAO/)).toBeTruthy();
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(3));
  expect(fetch.mock.calls.filter(([url]) => url.endsWith('/usuarios/me'))).toHaveLength(1);
});

it('login confirma /me, impede envio duplicado e retorna à rota de destino', async () => {
  let resolve;
  const gate = new Promise(r => { resolve = r; });
  const fetch = fetchWith(async url => {
    if (url.endsWith('/refresh')) return json({}, 401);
    if (url.endsWith('/login')) { await gate; return json(session); }
    return json(user);
  });
  mount('/painel');
  await screen.findByRole('heading', { name: 'Entrar' }); await loginReady(); fillLogin();
  const form = screen.getByLabelText('E-mail').closest('form');
  fireEvent.submit(form); fireEvent.submit(form);
  expect(screen.getByRole('button', { name: 'Entrando...' }).disabled).toBe(true);
  expect(screen.queryByRole('heading', { name: 'Área protegida' })).toBeNull();
  resolve(); await screen.findByRole('heading', { name: 'Área protegida' });
  expect(fetch.mock.calls.filter(([url]) => url.endsWith('/login'))).toHaveLength(1);
  expect(fetch.mock.calls.filter(([url]) => url.endsWith('/auth/me'))).toHaveLength(1);
  expect(localStorage.getItem('ds_user')).toBeNull();
});

it('senha incorreta mantém usuário no login e mostra erro amigável', async () => {
  fetchWith(() => json({ stack: 'secret' }, 401)); mount(); await loginReady(); fillLogin();
  fireEvent.submit(screen.getByLabelText('E-mail').closest('form'));
  expect((await screen.findByRole('alert')).textContent).toContain('Credenciais inválidas');
  expect(authService.state.isAuthenticated).toBe(false);
});

it('falha em /me não confirma login', async () => {
  fetchWith(url => url.endsWith('/login') ? json(session) : json({}, 401)); mount(); await loginReady(); fillLogin();
  fireEvent.submit(screen.getByLabelText('E-mail').closest('form'));
  await screen.findByRole('alert'); expect(authService.state.user).toBeNull();
  expect(screen.getByTestId('location').textContent).toBe('/login');
});

it('cadastro válido envia dados normalizados uma vez e redireciona sem autenticar', async () => {
  let resolve;
  const gate = new Promise(r => { resolve = r; });
  const fetch = fetchWith(async url => {
    if (url.endsWith('/register')) { await gate; return json(user, 201); }
    return json({}, 401);
  }); mount('/cadastro'); fillRegister();
  const form = screen.getByLabelText('E-mail').closest('form');
  fireEvent.submit(form); fireEvent.submit(form);
  expect(screen.getByRole('button', { name: 'Cadastrando...' }).disabled).toBe(true);
  resolve(); await screen.findByRole('heading', { name: 'Entrar' });
  const calls = fetch.mock.calls.filter(([url]) => url.endsWith('/register'));
  expect(calls).toHaveLength(1);
  expect(JSON.parse(calls[0][1].body)).toMatchObject({ cpf: '12345678909', email: 'joao@example.com' });
  expect(authService.state.isAuthenticated).toBe(false);
  expect(screen.getByText('Cadastro concluído. Entre com seu e-mail e senha.')).toBeTruthy();
});

it('CPF inválido não é enviado ao servidor', async () => {
  const fetch = fetchWith(() => json({}, 401)); mount('/cadastro'); fillRegister('11111111111');
  fireEvent.submit(screen.getByLabelText('E-mail').closest('form'));
  expect(screen.getByRole('alert').textContent).toContain('CPF válido');
  expect(fetch.mock.calls.some(([url]) => url.endsWith('/register'))).toBe(false);
});

it.each([400, 409, 429, 503])('cadastro trata HTTP %s sem redirecionar', async status => {
  fetchWith(url => json({}, url.endsWith('/register') ? status : 401)); mount('/cadastro'); fillRegister();
  fireEvent.submit(screen.getByLabelText('E-mail').closest('form'));
  const alert = await screen.findByRole('alert'); expect(alert.textContent).not.toBe('');
  expect(screen.getByTestId('location').textContent).toBe('/cadastro');
});

it('conexão indisponível no login mantém sessão encerrada', async () => {
  fetchWith(url => { if (url.endsWith('/refresh')) return json({}, 401); throw new TypeError('private backend address'); });
  mount(); await loginReady(); fillLogin(); fireEvent.submit(screen.getByLabelText('E-mail').closest('form'));
  expect((await screen.findByRole('alert')).textContent).toContain('conectar ao servidor');
  expect(authService.state.isAuthenticated).toBe(false);
});

it.each([true, false])('logout limpa sessão e redireciona; confirmação remota: %s', async online => {
  fetchWith(url => {
    if (url.endsWith('/refresh')) return json(session);
    if (url.endsWith('/logout')) { if (!online) throw new TypeError('offline'); return new Response(null, { status: 204 }); }
    return json(user);
  }); mount('/painel'); await screen.findByRole('heading', { name: 'Área protegida' });
  fireEvent.click(screen.getByRole('button', { name: 'Sair' })); await screen.findByRole('heading', { name: 'Entrar' });
  expect(authService.state).toMatchObject({ user: null, accessToken: null, isAuthenticated: false });
});
