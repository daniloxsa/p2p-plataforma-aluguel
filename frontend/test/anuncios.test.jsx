import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import MyAnnouncements from '../src/pages/MyAnnouncements';
import CreateAnnouncement from '../src/pages/CreateAnnouncement';
import OwnerAnnouncement from '../src/pages/OwnerAnnouncement';
import AnuncioForm from '../src/components/AnuncioForm';
import ProtectedRoute from '../src/components/ProtectedRoute';
import { anunciosApi } from '../src/api/anuncios';
import { veiculosApi } from '../src/api/veiculos';
import { apiClient, ApiError } from '../src/api/client';
import { anuncioPayload, anuncioStatus, decimal, formatMoney } from '../src/services/anuncioValidation';

const { context } = vi.hoisted(() => ({ context: { user: { id: 'alice' }, flash: vi.fn(), isAuthenticated: true, isAuthLoading: false } }));
vi.mock('../src/store/AppContext', () => ({ useApp: () => context }));
const vehicle = { id: 'v1', marca: 'Toyota', modelo: 'Yaris', ano_modelo: 2023, status_cadastro: 'PENDENTE', desativado_em: null };
const row = { id: 'a1', veiculo_id: vehicle.id, veiculo: vehicle, titulo: 'Yaris para viagens', descricao: 'Confortável.',
  preco_diaria: '150.90', valor_caucao: '1000.00', preco_seguro_dia: '25.50', aceite_automatico: false,
  status: 'RASCUNHO', criado_em: '2026-10-31T12:00:00Z' };
const listing = (items, total = items.length, page = 1) => ({ items, total, page, limit: 20 });
const gate = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
beforeEach(() => { context.flash.mockClear(); context.isAuthenticated = true; context.isAuthLoading = false; });

function routes(path = '/anuncios/meus') {
  return <MemoryRouter initialEntries={[path]}><Routes>
    <Route element={<ProtectedRoute />}>
      <Route path="/anuncios/meus" element={<MyAnnouncements />} />
      <Route path="/anuncios/novo" element={<CreateAnnouncement />} />
      <Route path="/anuncios/meus/:id" element={<OwnerAnnouncement />} />
    </Route>
    <Route path="/login" element={<p>Entrar novamente</p>} />
  </Routes></MemoryRouter>;
}
const change = (label, value) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

it('renders API rows, pagination, ordering and details navigation', async () => {
  const mine = vi.spyOn(anunciosApi, 'mine').mockResolvedValue(listing([row], 21));
  vi.spyOn(anunciosApi, 'own').mockResolvedValue(row);
  render(routes()); expect(screen.getByRole('status').textContent).toContain('Carregando');
  expect(await screen.findByText('Yaris para viagens')).toBeTruthy();
  expect(screen.getByText('R$ 150,90')).toBeTruthy(); expect(screen.getByText('Toyota Yaris · 2023')).toBeTruthy();
  expect(mine).toHaveBeenLastCalledWith(1, 20, 'criado_em', 'desc');
  fireEvent.click(screen.getByRole('button', { name: 'Próxima' }));
  await waitFor(() => expect(mine).toHaveBeenLastCalledWith(2, 20, 'criado_em', 'desc'));
  await screen.findByText('Yaris para viagens');
  change('Ordenar por', 'preco_diaria:asc');
  await waitFor(() => expect(mine).toHaveBeenLastCalledWith(1, 20, 'preco_diaria', 'asc'));
  fireEvent.click(await screen.findByRole('link', { name: 'Visualizar / editar' }));
  expect(await screen.findByLabelText('Título do anúncio')).toBeTruthy();
});

it('handles a connection failure, retry and empty list', async () => {
  const mine = vi.spyOn(anunciosApi, 'mine').mockRejectedValue(new ApiError(0));
  render(routes()); expect((await screen.findByRole('alert')).textContent).toContain('Não foi possível');
  mine.mockResolvedValue(listing([])); fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
  expect(await screen.findByText(/Você ainda não tem anúncios/)).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Próxima' }).disabled).toBe(true);
  expect(screen.getByRole('button', { name: 'Anterior' }).disabled).toBe(true);
});

it('keeps money as strings, validates limits and whitelists payload fields', () => {
  expect(decimal('9999999999,99', true)).toBe('9999999999.99');
  expect(decimal(' 0001,2 ')).toBe('1.20'); expect(decimal('0')).toBe('0.00');
  expect(formatMoney('9999999999.99')).toBe('R$ 9.999.999.999,99');
  for (const invalid of ['-1', 'NaN', 'Infinity', '1e2', '1.001', '1.234,56', '10000000000', '', 'abc']) {
    expect(() => decimal(invalid)).toThrow();
  }
  expect(() => decimal('0', true)).toThrow();
  for (const titulo of [' ', 'a'.repeat(151)]) expect(() => anuncioPayload({ ...row, titulo })).toThrow('título');
  expect(anuncioPayload({ ...row, titulo: ' Yaris ', descricao: ' ', proprietario_id: 'bob' }, true)).toEqual({
    veiculo_id: 'v1', titulo: 'Yaris', descricao: null, preco_diaria: '150.90', valor_caucao: '1000.00',
    preco_seguro_dia: '25.50', aceite_automatico: false,
  });
});

it('validates before submitting and preserves form values on recoverable error', async () => {
  const save = vi.fn().mockRejectedValue(new ApiError(400, 'Confira os valores.'));
  render(<AnuncioForm creating vehicles={[vehicle]} onSave={save} />);
  fireEvent.click(screen.getByRole('button', { name: 'Criar rascunho' }));
  expect(screen.getByRole('alert').textContent).toContain('título'); expect(save).not.toHaveBeenCalled();
  change('Título do anúncio', 'Meu rascunho'); change('Veículo', vehicle.id); change('Preço da diária (R$)', '-1');
  fireEvent.click(screen.getByRole('button')); expect(screen.getByRole('alert').textContent).toContain('diária');
  change('Preço da diária (R$)', '10,50'); fireEvent.click(screen.getByRole('button'));
  expect((await screen.findByRole('alert')).textContent).toContain('Confira os valores');
  expect(screen.getByLabelText('Preço da diária (R$)').value).toBe('10,50');
  expect(screen.getByLabelText('Título do anúncio').value).toBe('Meu rascunho');
});

it('validates vehicle preselection, filters disabled vehicles and loads further pages', async () => {
  const mine = vi.spyOn(veiculosApi, 'mine').mockResolvedValueOnce(listing([{ ...vehicle, id: 'disabled', desativado_em: '2026-01-01' }], 21))
    .mockResolvedValueOnce(listing([{ ...vehicle, id: 'next', modelo: 'Corolla' }], 21, 2));
  const own = vi.spyOn(veiculosApi, 'own').mockResolvedValue(vehicle);
  render(routes('/anuncios/novo?veiculo=v1'));
  const select = await screen.findByLabelText('Veículo'); expect(select.value).toBe('v1');
  expect(own).toHaveBeenCalledWith('v1'); expect(within(select).getAllByRole('option')).toHaveLength(2);
  fireEvent.click(screen.getByRole('button', { name: 'Carregar mais veículos' }));
  await screen.findByRole('option', { name: 'Toyota Corolla · 2023' });
  expect(mine).toHaveBeenLastCalledWith(2, 20);
});

it.each([404, 400])('rejects an unavailable preselected vehicle (%s) without creating', async status => {
  vi.spyOn(veiculosApi, 'mine').mockResolvedValue(listing([vehicle]));
  vi.spyOn(veiculosApi, 'own').mockRejectedValue(new ApiError(status));
  const create = vi.spyOn(anunciosApi, 'create');
  render(routes('/anuncios/novo?veiculo=other'));
  expect((await screen.findByRole('alert')).textContent).toContain('indisponível');
  expect(screen.getByLabelText('Veículo').value).toBe(''); expect(create).not.toHaveBeenCalled();
});

it('creates exactly one draft, checks ownership again and fetches actual details after success', async () => {
  vi.spyOn(veiculosApi, 'mine').mockResolvedValue(listing([vehicle]));
  const ownVehicle = vi.spyOn(veiculosApi, 'own').mockResolvedValue(vehicle);
  const pending = gate(); const create = vi.spyOn(anunciosApi, 'create').mockReturnValue(pending.promise);
  const own = vi.spyOn(anunciosApi, 'own').mockResolvedValue(row);
  render(routes('/anuncios/novo?veiculo=v1'));
  await screen.findByLabelText('Veículo');
  change('Título do anúncio', ' Yaris para viagens '); change('Preço da diária (R$)', '150,90');
  const form = screen.getByLabelText('Título do anúncio').closest('form');
  fireEvent.submit(form); fireEvent.submit(form);
  await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
  expect(create).toHaveBeenCalledWith({ veiculo_id: 'v1', titulo: row.titulo, descricao: null,
    preco_diaria: '150.90', valor_caucao: '0.00', preco_seguro_dia: '0.00', aceite_automatico: false });
  expect(ownVehicle).toHaveBeenCalledTimes(2); expect(screen.getByRole('button', { name: 'Criando anúncio...' }).disabled).toBe(true);
  await act(async () => pending.resolve(row));
  expect(await screen.findByText('Rascunho')).toBeTruthy(); expect(own).toHaveBeenCalledWith('a1');
  expect(context.flash).toHaveBeenCalledWith('Rascunho criado com sucesso.');
});

it('handles a deactivation between selection and submission without sending a creation', async () => {
  vi.spyOn(veiculosApi, 'mine').mockResolvedValue(listing([vehicle]));
  const own = vi.spyOn(veiculosApi, 'own').mockResolvedValue(vehicle);
  const create = vi.spyOn(anunciosApi, 'create');
  render(routes('/anuncios/novo?veiculo=v1')); await screen.findByLabelText('Veículo');
  change('Título do anúncio', 'Meu carro'); change('Preço da diária (R$)', '10');
  own.mockResolvedValue({ ...vehicle, desativado_em: '2026-10-31' });
  fireEvent.click(screen.getByRole('button', { name: 'Criar rascunho' }));
  expect((await screen.findByRole('alert')).textContent).toContain('desativado'); expect(create).not.toHaveBeenCalled();
  expect(screen.getByLabelText('Título do anúncio').value).toBe('Meu carro');
  expect(screen.getByRole('option', { name: 'Veículo indisponível' })).toBeTruthy();
});

it('edits only changed allowed fields once, then reloads details', async () => {
  const updated = { ...row, preco_diaria: '175.99' };
  const own = vi.spyOn(anunciosApi, 'own').mockResolvedValue(row);
  const pending = gate(); const update = vi.spyOn(anunciosApi, 'update').mockReturnValue(pending.promise);
  render(routes('/anuncios/meus/a1')); await screen.findByLabelText('Título do anúncio');
  expect(screen.queryByLabelText('Veículo')).toBeNull();
  change('Preço da diária (R$)', '175,99');
  const form = screen.getByLabelText('Título do anúncio').closest('form'); fireEvent.submit(form); fireEvent.submit(form);
  expect(update).toHaveBeenCalledExactlyOnceWith('a1', { preco_diaria: '175.99' });
  own.mockResolvedValue(updated); await act(async () => pending.resolve(updated));
  expect(own).toHaveBeenCalledTimes(2); expect(screen.getByLabelText('Preço da diária (R$)').value).toBe('175.99');
});

it.each(['ENCERRADO', 'ATIVO'])('renders %s as read only with precise currency', async status => {
  vi.spyOn(anunciosApi, 'own').mockResolvedValue({ ...row, status });
  render(routes('/anuncios/meus/a1')); expect(await screen.findByText(anuncioStatus[status])).toBeTruthy();
  expect(screen.getByText('Confortável.')).toBeTruthy(); expect(screen.getByText('R$ 150,90')).toBeTruthy();
  expect(screen.queryByLabelText('Título do anúncio')).toBeNull();
  expect(Boolean(screen.queryByRole('button', { name: 'Encerrar anúncio' }))).toBe(status !== 'ENCERRADO');
  expect(Boolean(screen.queryByRole('button', { name: 'Pausar anúncio' }))).toBe(status === 'ATIVO');
});

it('confirms logical closure, allows cancellation and prevents duplicate requests', async () => {
  const own = vi.spyOn(anunciosApi, 'own').mockResolvedValue(row);
  const pending = gate(); const close = vi.spyOn(anunciosApi, 'close').mockReturnValue(pending.promise);
  render(routes('/anuncios/meus/a1')); await screen.findByLabelText('Título do anúncio');
  fireEvent.click(screen.getByRole('button', { name: 'Encerrar anúncio' }));
  expect(screen.getByRole('dialog').textContent).toContain('fotografias serão preservados');
  expect(close).not.toHaveBeenCalled(); fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
  expect(screen.queryByRole('dialog')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Encerrar anúncio' }));
  const button = screen.getByRole('button', { name: 'Confirmar encerramento' }); fireEvent.click(button); fireEvent.click(button);
  expect(close).toHaveBeenCalledExactlyOnceWith('a1');
  expect(screen.getByRole('button', { name: 'Processando anúncio...' }).disabled).toBe(true);
  own.mockResolvedValue({ ...row, status: 'ENCERRADO' });
  await act(async () => pending.resolve({ ...row, status: 'ENCERRADO' }));
  expect(await screen.findByText('Encerrado')).toBeTruthy(); expect(screen.queryByLabelText('Título do anúncio')).toBeNull();
  expect(own).toHaveBeenCalledTimes(2);
});

it('refreshes after a 409, changes to read only and preserves recoverable drafts', async () => {
  const own = vi.spyOn(anunciosApi, 'own').mockResolvedValue(row);
  vi.spyOn(anunciosApi, 'update').mockRejectedValue(new ApiError(409, 'Estado alterado.'));
  render(routes('/anuncios/meus/a1')); await screen.findByLabelText('Título do anúncio');
  change('Título do anúncio', 'Texto a preservar'); fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }));
  await waitFor(() => expect(own).toHaveBeenCalledTimes(2));
  expect(screen.getByLabelText('Título do anúncio').value).toBe('Texto a preservar');
  own.mockResolvedValue({ ...row, status: 'ENCERRADO' });
  await waitFor(() => expect(screen.getByRole('button', { name: 'Salvar alterações' }).disabled).toBe(false));
  fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }));
  expect(await screen.findByText('Encerrado')).toBeTruthy(); expect(screen.queryByLabelText('Título do anúncio')).toBeNull();
});

it('shows 404 without revealing data and retries failed details', async () => {
  const own = vi.spyOn(anunciosApi, 'own').mockRejectedValue(new ApiError(404, 'Anúncio indisponível.'));
  render(routes('/anuncios/meus/a1')); expect((await screen.findByRole('alert')).textContent).toContain('indisponível');
  expect(screen.queryByText(row.titulo)).toBeNull(); own.mockResolvedValue(row);
  fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' })); expect(await screen.findByLabelText('Título do anúncio')).toBeTruthy();
});

it.each(['/anuncios/meus', '/anuncios/novo', '/anuncios/meus/a1'])('protects route %s through existing session flow', async path => {
  context.isAuthenticated = false;
  render(routes(path)); expect(await screen.findByText('Entrar novamente')).toBeTruthy();
});

it('uses shared API configuration, refreshes on 401, maps conflicts and hides server errors', async () => {
  const previous = apiClient.auth;
  let token = 'old'; const refresh = vi.fn(async () => { token = 'new'; }); const invalidate = vi.fn();
  apiClient.configureAuth({ getToken: () => token, refresh, invalidate });
  const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
  const fetch = vi.fn().mockResolvedValueOnce(json({}, 401)).mockResolvedValueOnce(json(listing([row])));
  vi.stubGlobal('fetch', fetch);
  try {
    expect((await anunciosApi.mine()).items[0]).toEqual(row);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[1][0]).toBe(`${apiClient.baseURL}/anuncios/meus?page=1&limit=20&orderBy=criado_em&order=desc`);
    expect(fetch.mock.calls[1][1].headers.Authorization).toBe('Bearer new');
    fetch.mockResolvedValue(json({}, 401)); await expect(anunciosApi.own('a1')).rejects.toMatchObject({ status: 401 });
    expect(invalidate).toHaveBeenCalled();
    fetch.mockResolvedValue(json({ message: 'SQL internal secret' }, 500));
    await expect(anunciosApi.close('a1')).rejects.toThrow('Ocorreu um erro interno');
    fetch.mockResolvedValue(json({}, 409)); await expect(anunciosApi.update('a1', { titulo: 'Novo' })).rejects.toThrow('dados serão atualizados');
    fetch.mockResolvedValue(json(row, 201)); await anunciosApi.create({ titulo: 'Novo' });
    expect(fetch.mock.lastCall[1]).toMatchObject({ method: 'POST', credentials: 'include', body: JSON.stringify({ titulo: 'Novo' }) });
    fetch.mockResolvedValue(json(row)); await anunciosApi.close('a1');
    expect(fetch.mock.lastCall[0]).toBe(`${apiClient.baseURL}/anuncios/a1/encerrar`);
    expect(fetch.mock.lastCall[1]).toMatchObject({ method: 'PATCH', body: '{}' });
  } finally { apiClient.configureAuth(previous); }
});
