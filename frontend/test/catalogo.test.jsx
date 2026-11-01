import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { expect, it, vi } from 'vitest';
import Home from '../src/pages/Home';
import VehicleDetail from '../src/pages/VehicleDetail';
import { catalogoApi } from '../src/api/catalogo';
import { apiClient, ApiError } from '../src/api/client';

const photo = n => ({ id: `photo-${n}`, url: `https://images.test/${n}`, expira_em: new Date(Date.now() + 60000).toISOString() });
const ad = () => ({ id: 'a1', titulo: 'Yaris publicado', descricao: 'Veículo real para conhecer.', preco_diaria: '150.99', valor_caucao: '1000.00', preco_seguro_dia: '20.10',
  veiculo: { marca: 'Toyota', modelo: 'Yaris', ano_fabricacao: 2022, ano_modelo: 2023, categoria: 'Hatch', cambio: 'Manual', combustivel: 'Flex', quantidade_lugares: 5 }, fotos: [photo(1), photo(2)] });
const listing = (items = [ad()], extra = {}) => ({ items, page: 1, limit: 12, total: items.length, pages: 1, ...extra });
const routes = (path = '/') => <MemoryRouter initialEntries={[path]}><Routes><Route path="/" element={<Home />} /><Route path="/veiculo/:id" element={<VehicleDetail />} /></Routes></MemoryRouter>;

it('anonymous catalog uses real HTTP client, no bearer/login, public URL and no-store', async () => {
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(listing()), { headers: { 'content-type': 'application/json' } }));
  vi.stubGlobal('fetch', fetch);
  render(routes()); expect(screen.getByRole('status').textContent).toContain('Carregando');
  expect(await screen.findByText('Yaris publicado')).toBeTruthy();
  expect(screen.getByText('R$ 150,99')).toBeTruthy();
  expect(fetch.mock.calls[0][0]).toContain('/api/catalogo/anuncios?');
  expect(fetch.mock.calls[0][1].cache).toBe('no-store'); expect(fetch.mock.calls[0][1].headers.Authorization).toBeUndefined();
});

it('search, filters, sorting, pagination and back navigation preserve URL state', async () => {
  const list = vi.spyOn(catalogoApi, 'list').mockImplementation(async query => listing([ad()], { total: 25, pages: 3, page: Number(new URLSearchParams(query).get('page') || 1) }));
  vi.spyOn(catalogoApi, 'detail').mockResolvedValue(ad()); render(routes()); await screen.findByText('Yaris publicado');
  for (const [label, value] of [['Marca, modelo ou título', 'Toyota'], ['Categoria', 'Hatch'], ['Câmbio', 'Manual'], ['Combustível', 'Flex'], ['Diária mínima (R$)', '100.01'], ['Diária máxima (R$)', '200.99'], ['Ordenar por', 'menor_preco']]) fireEvent.change(screen.getByLabelText(label), { target: { value } });
  fireEvent.click(screen.getByRole('button', { name: 'Buscar', exact: true }));
  await waitFor(() => { const query = new URLSearchParams(list.mock.lastCall[0]); expect(query.get('q')).toBe('Toyota'); expect(query.get('categoria')).toBe('Hatch'); expect(query.get('cambio')).toBe('Manual'); expect(query.get('combustivel')).toBe('Flex'); expect(query.get('preco_min')).toBe('100.01'); expect(query.get('preco_max')).toBe('200.99'); expect(query.get('ordem')).toBe('menor_preco'); expect(query.get('page')).toBe('1'); });
  fireEvent.click(screen.getByRole('button', { name: 'Próxima' })); await waitFor(() => expect(new URLSearchParams(list.mock.lastCall[0]).get('page')).toBe('2'));
  fireEvent.click(await screen.findByRole('link', { name: 'Ver detalhes de Yaris publicado' })); await screen.findByText('Sobre o veículo');
  fireEvent.click(screen.getByRole('link', { name: '← Voltar ao catálogo' })); await screen.findByText('Yaris publicado'); expect(screen.getByLabelText('Marca, modelo ou título').value).toBe('Toyota');
  fireEvent.click(screen.getByRole('button', { name: 'Limpar filtros' })); await waitFor(() => expect(list).toHaveBeenLastCalledWith(''));
});

it('detail gallery, broken-image fallback, exact prices and unavailable reservation', async () => {
  vi.spyOn(catalogoApi, 'detail').mockResolvedValue(ad()); render(routes('/veiculo/a1'));
  expect(screen.getByRole('status').textContent).toContain('Carregando'); await screen.findByText('Sobre o veículo');
  expect(screen.getByText('R$ 1.000,00')).toBeTruthy(); expect(screen.getByText('R$ 20,10')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Ver foto 2' }));
  expect(screen.getByRole('img', { name: 'Toyota Yaris' }).getAttribute('src')).toBe('https://images.test/2');
  fireEvent.error(screen.getByRole('img', { name: 'Toyota Yaris' })); expect(screen.getByRole('img', { name: 'Fotografia indisponível' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Reservas indisponíveis' }).disabled).toBe(true);
  expect(screen.queryByRole('link', { name: /checkout|solicitar|reservar/i })).toBeNull();
});

it('empty, error, retry and unavailable detail never show stale ads', async () => {
  const list = vi.spyOn(catalogoApi, 'list').mockRejectedValue(new ApiError(503)); render(routes());
  expect((await screen.findByRole('alert')).textContent).toContain('Não foi possível carregar');
  list.mockResolvedValue(listing([])); fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' })); expect(await screen.findByText(/Nenhum anúncio nesta página/)).toBeTruthy();
});

it('paused/deleted ad returns unavailable message and remains outside checkout', async () => {
  vi.spyOn(catalogoApi, 'detail').mockRejectedValue(new ApiError(404)); render(routes('/veiculo/a1'));
  expect((await screen.findByRole('alert')).textContent).toContain('Este anúncio não está mais disponível'); expect(screen.queryByText('Valores anunciados')).toBeNull();
});

it('refreshes on focus, removes withdrawn listings and ignores responses from old filters', async () => {
  let resolveOld; const old = new Promise(resolve => { resolveOld = resolve; });
  const list = vi.spyOn(catalogoApi, 'list').mockReturnValueOnce(old).mockResolvedValue(listing([]));
  render(routes()); fireEvent.change(screen.getByLabelText('Marca, modelo ou título'), { target: { value: 'Novo' } }); fireEvent.click(screen.getByRole('button', { name: 'Buscar', exact: true }));
  await screen.findByText(/Nenhum anúncio nesta página/); await act(async () => resolveOld(listing())); expect(screen.queryByText('Yaris publicado')).toBeNull();
  list.mockResolvedValue(listing()); fireEvent.focus(window); await screen.findByText('Yaris publicado');
  list.mockResolvedValue(listing([])); fireEvent.focus(window); await screen.findByText(/Nenhum anúncio nesta página/); expect(screen.queryByText('Yaris publicado')).toBeNull();
});

it('expired or missing photographs render a placeholder, and invalid range does not call API', async () => {
  const row = ad(); row.fotos = [{ ...photo(1), expira_em: '2000-01-01' }];
  const list = vi.spyOn(catalogoApi, 'list').mockResolvedValue(listing([row])); render(routes()); await screen.findByText('Yaris publicado');
  expect(screen.getByRole('img', { name: 'Fotografia indisponível' })).toBeTruthy();
  fireEvent.change(screen.getByLabelText('Diária mínima (R$)'), { target: { value: '200' } }); fireEvent.change(screen.getByLabelText('Diária máxima (R$)'), { target: { value: '100' } }); fireEvent.click(screen.getByRole('button', { name: 'Buscar', exact: true }));
  expect(screen.getByRole('alert').textContent).toContain('mínima'); expect(list).toHaveBeenCalledTimes(1);
});

it('detail API encodes identifiers and opts out of authentication', async () => {
  const get = vi.spyOn(apiClient, 'get').mockResolvedValue(ad()); await catalogoApi.detail('a/b');
  expect(get).toHaveBeenCalledWith('/catalogo/anuncios/a%2Fb', { cache: 'no-store', timeout: 45000 });
});
