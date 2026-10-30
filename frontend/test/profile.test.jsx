import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import Profile from '../src/pages/Profile';
import { AppProvider, useApp } from '../src/store/AppContext';
import { authService } from '../src/services/authService';

const original = { id: 'profile-user', nome: 'João Silva', telefone: '79999999999', email: 'joao@example.com', status: 'PENDENTE_VERIFICACAO', criado_em: '2026-10-30T16:00:00.000Z' };
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
let stored, fetchMock, patchHandler;

function resetSession() {
  authService.clear();
  authService.restorePromise = null;
  authService.refreshPromise = null;
  authService.loginPromise = null;
  authService.logoutPromise = null;
  authService.update({ isAuthLoading: true });
}

beforeEach(() => {
  resetSession();
  stored = { ...original };
  patchHandler = async data => { stored = { ...stored, ...data }; return json(stored); };
  fetchMock = vi.fn(async (url, options) => {
    if (url.endsWith('/auth/refresh')) return json({ accessToken: 'profile-access', tokenType: 'Bearer', user: stored });
    if (url.endsWith('/auth/me')) return json(stored);
    if (url.endsWith('/usuarios/me')) {
      if (options.method === 'PATCH') return patchHandler(JSON.parse(options.body));
      return json(stored);
    }
    throw new Error('Unexpected request');
  });
  vi.stubGlobal('fetch', fetchMock);
});

const patches = () => fetchMock.mock.calls.filter(([, options]) => options.method === 'PATCH');
function Notifications() { const { toast } = useApp(); return <div data-testid="notification">{toast}</div>; }
async function mount() {
  const view = render(<AppProvider><Profile /><Notifications /></AppProvider>);
  await screen.findByRole('button', { name: 'Editar Perfil' });
  await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => url.endsWith('/usuarios/me'))).toBe(true));
  return view;
}

it('editar habilita nome/telefone e mostra salvar/cancelar sem PATCH ou sucesso', async () => {
  await mount();
  expect(screen.getByLabelText('Nome').disabled).toBe(true);
  expect(screen.getByLabelText('Telefone').disabled).toBe(true);
  const editButton = screen.getByRole('button', { name: 'Editar Perfil' });
  await userEvent.click(editButton);
  expect(screen.getByLabelText('Nome').disabled).toBe(false);
  expect(screen.getByLabelText('Telefone').disabled).toBe(false);
  expect(screen.getByRole('button', { name: 'Salvar Alterações' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Salvar Alterações' })).not.toBe(editButton);
  expect(screen.getByRole('button', { name: 'Cancelar' })).toBeTruthy();
  expect(patches()).toHaveLength(0);
  expect(screen.getByTestId('notification').textContent).toBe('');
  expect(screen.getAllByRole('textbox')).toHaveLength(2);
  expect(screen.getByText(original.email)).toBeTruthy();
  expect(screen.getByText(original.id)).toBeTruthy();
});

it('salvar envia os valores editados uma vez e aguarda HTTP 200 antes do sucesso', async () => {
  const gate = deferred();
  patchHandler = async data => { await gate.promise; stored = { ...stored, ...data }; return json(stored); };
  await mount();
  await userEvent.click(screen.getByRole('button', { name: 'Editar Perfil' }));
  fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'João Atualizado' } });
  fireEvent.change(screen.getByLabelText('Telefone'), { target: { value: '11988887777' } });
  await userEvent.click(screen.getByRole('button', { name: 'Salvar Alterações' }));
  expect(patches()).toHaveLength(1);
  const [url, options] = patches()[0];
  expect(url).toMatch(/\/api\/usuarios\/me$/);
  expect(options.headers.Authorization).toBe('Bearer profile-access');
  expect(JSON.parse(options.body)).toEqual({ nome: 'João Atualizado', telefone: '11988887777' });
  expect(screen.getByTestId('notification').textContent).toBe('');
  expect(screen.getByRole('button', { name: 'Salvando...' }).disabled).toBe(true);
  fireEvent.submit(screen.getByLabelText('Nome').closest('form'));
  expect(patches()).toHaveLength(1);
  await act(async () => { gate.resolve(); });
  await screen.findByRole('button', { name: 'Editar Perfil' });
  expect(screen.getByLabelText('Nome').value).toBe('João Atualizado');
  expect(screen.getByLabelText('Telefone').value).toBe('11988887777');
  expect(screen.getByLabelText('Telefone').disabled).toBe(true);
  expect(screen.getByTestId('notification').textContent).toBe('Perfil atualizado com sucesso!');
});

it('cancelar restaura os valores sem PATCH ou notificação de sucesso', async () => {
  await mount();
  await userEvent.click(screen.getByRole('button', { name: 'Editar Perfil' }));
  fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Rascunho' } });
  fireEvent.change(screen.getByLabelText('Telefone'), { target: { value: '11988887777' } });
  await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
  expect(screen.getByLabelText('Nome').value).toBe(original.nome);
  expect(screen.getByLabelText('Telefone').value).toBe(original.telefone);
  expect(screen.getByRole('button', { name: 'Editar Perfil' })).toBeTruthy();
  expect(patches()).toHaveLength(0);
  expect(screen.getByTestId('notification').textContent).toBe('');
});

it('erro no PATCH mantém edição e rascunho para nova tentativa', async () => {
  patchHandler = async () => json({}, 503);
  await mount();
  await userEvent.click(screen.getByRole('button', { name: 'Editar Perfil' }));
  fireEvent.change(screen.getByLabelText('Telefone'), { target: { value: '11988887777' } });
  await userEvent.click(screen.getByRole('button', { name: 'Salvar Alterações' }));
  await waitFor(() => expect(screen.getByTestId('notification').textContent).toContain('Erro ao atualizar'));
  expect(screen.getByLabelText('Telefone').value).toBe('11988887777');
  expect(screen.getByLabelText('Telefone').disabled).toBe(false);
  expect(screen.getByRole('button', { name: 'Cancelar' })).toBeTruthy();
  expect(stored.telefone).toBe(original.telefone);
  patchHandler = async data => { stored = { ...stored, ...data }; return json(stored); };
  await userEvent.click(screen.getByRole('button', { name: 'Salvar Alterações' }));
  await screen.findByRole('button', { name: 'Editar Perfil' });
  expect(stored.telefone).toBe('11988887777');
  expect(patches()).toHaveLength(2);
});

it('atualização do contexto durante edição preserva o rascunho e o modo de edição', async () => {
  await mount();
  await userEvent.click(screen.getByRole('button', { name: 'Editar Perfil' }));
  fireEvent.change(screen.getByLabelText('Telefone'), { target: { value: '11988887777' } });
  act(() => authService.update({ user: { ...original, nome: 'Nome recebido da API' } }));
  expect(screen.getByLabelText('Telefone').value).toBe('11988887777');
  expect(screen.getByRole('button', { name: 'Cancelar' })).toBeTruthy();
  expect(patches()).toHaveLength(0);
});

it('submissão fora do modo de edição não envia PATCH', async () => {
  await mount();
  fireEvent.submit(screen.getByLabelText('Nome').closest('form'));
  expect(patches()).toHaveLength(0);
  expect(screen.getByTestId('notification').textContent).toBe('');
});

it('remontar a página recarrega o telefone salvo via GET sem outro PATCH (API simulada)', async () => {
  const view = await mount();
  await userEvent.click(screen.getByRole('button', { name: 'Editar Perfil' }));
  fireEvent.change(screen.getByLabelText('Telefone'), { target: { value: '11988887777' } });
  await userEvent.click(screen.getByRole('button', { name: 'Salvar Alterações' }));
  await screen.findByRole('button', { name: 'Editar Perfil' });
  expect(patches()).toHaveLength(1);
  view.unmount();
  resetSession();
  await mount();
  expect(screen.getByLabelText('Telefone').value).toBe('11988887777');
  expect(patches()).toHaveLength(1);
});
