import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import VehiclePhotos from '../src/components/VehiclePhotos';
import { fotosVeiculosApi as api } from '../src/api/fotosVeiculos';
import { ApiClient } from '../src/api/client';

const vehicle = { id: 'vehicle', desativado_em: null };
const photos = [
  { id: 'a', veiculo_id: 'vehicle', url: 'https://test.invalid/a', ordem: 1, principal: true, expira_em: new Date(Date.now() + 300000).toISOString() },
  { id: 'b', veiculo_id: 'vehicle', url: 'https://test.invalid/b', ordem: 2, principal: false, expira_em: new Date(Date.now() + 300000).toISOString() },
];
beforeEach(() => {
  vi.spyOn(api, 'list').mockResolvedValue([]);
  URL.createObjectURL = vi.fn(() => 'blob:preview');
  URL.revokeObjectURL = vi.fn();
});
const file = (name = 'car.png', type = 'image/png', size = 30) => new File([new Uint8Array(size)], name, { type });
const select = files => fireEvent.change(screen.getByLabelText('Selecionar imagens'), { target: { files } });

it('renders empty state, validates types and size, previews and revokes removed selections', async () => {
  const view = render(<VehiclePhotos vehicle={vehicle} />);
  await screen.findByText('Nenhuma foto cadastrada.');
  select([file('x.svg', 'image/svg+xml')]); expect(screen.getByRole('alert').textContent).toContain('JPEG');
  select([file('x.png', 'image/png', 5 * 1024 * 1024 + 1)]); expect(screen.getByRole('alert').textContent).toContain('5 MB');
  const original = file(); select([original]); expect(screen.getByAltText('Prévia de car.png').src).toContain('blob:preview');
  select([original]); expect(screen.getByRole('alert').textContent).toContain('já selecionado');
  fireEvent.click(screen.getByRole('button', { name: 'Remover seleção de car.png' }));
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:preview');
  select([file()]); view.unmount(); expect(URL.revokeObjectURL).toHaveBeenCalledTimes(2);
});
it('enforces count and disables conflicting actions during a single upload', async () => {
  let resolve;
  const gate = new Promise(r => { resolve = r; });
  const upload = vi.spyOn(api, 'upload').mockReturnValue(gate);
  render(<VehiclePhotos vehicle={vehicle} />); await screen.findByText('Nenhuma foto cadastrada.');
  select(Array.from({ length: 11 }, (_, i) => file(`${i}.png`)));
  expect(screen.getByRole('alert').textContent).toContain('10 fotos');
  const selected = file(); select([selected]);
  const button = screen.getByRole('button', { name: 'Enviar 1 foto(s)' }); fireEvent.click(button); fireEvent.click(button);
  expect(upload).toHaveBeenCalledExactlyOnceWith('vehicle', [selected]); expect(button.disabled).toBe(true);
  expect(screen.getByText('Processando fotos. Aguarde...')).toBeTruthy();
  api.list.mockResolvedValue(photos);
  await act(async () => resolve(photos));
  expect(await screen.findByText('Fotos enviadas.')).toBeTruthy(); expect(screen.getAllByRole('img')).toHaveLength(2);
  expect(URL.revokeObjectURL).toHaveBeenCalled();
});
it('keeps selections on upload failure and displays session expiration', async () => {
  vi.spyOn(api, 'upload').mockRejectedValue(new Error('Falha de upload.'));
  render(<VehiclePhotos vehicle={vehicle} />); await screen.findByText('Nenhuma foto cadastrada.'); select([file()]);
  fireEvent.click(screen.getByRole('button', { name: 'Enviar 1 foto(s)' }));
  expect((await screen.findByRole('alert')).textContent).toContain('Falha de upload');
  expect(screen.getByAltText('Prévia de car.png')).toBeTruthy();
  api.list.mockRejectedValue(new Error('Sessão expirada. Entre novamente.'));
  fireEvent.click(screen.getByRole('button', { name: 'Atualizar galeria' }));
  expect((await screen.findByRole('alert')).textContent).toContain('Sessão expirada');
});
it('sets principal, reorders and waits for confirmed deletion before refreshing', async () => {
  api.list.mockResolvedValue(photos);
  const principal = vi.spyOn(api, 'principal').mockResolvedValue(photos);
  const reorder = vi.spyOn(api, 'reorder').mockResolvedValue(photos);
  const remove = vi.spyOn(api, 'remove').mockResolvedValue();
  render(<VehiclePhotos vehicle={vehicle} />); await screen.findByText('Principal');
  fireEvent.click(screen.getAllByRole('button', { name: 'Definir principal' })[1]);
  await screen.findByText('Foto principal atualizada.'); expect(principal).toHaveBeenCalledWith('vehicle', 'b');
  fireEvent.click(screen.getByRole('button', { name: 'Mover foto 2 para antes' }));
  await screen.findByText('Ordem atualizada.'); expect(reorder).toHaveBeenCalledWith('vehicle', ['b', 'a']);
  fireEvent.click(screen.getByRole('button', { name: 'Excluir foto 1' }));
  expect(remove).not.toHaveBeenCalled(); expect(screen.getByRole('dialog')).toBeTruthy();
  api.list.mockResolvedValue([photos[1]]); fireEvent.click(screen.getByRole('button', { name: 'Confirmar exclusão' }));
  await screen.findByText('Foto excluída.'); expect(remove).toHaveBeenCalledWith('vehicle', 'a'); expect(screen.getAllByRole('img')).toHaveLength(1);
});
it('preserves historical gallery while preventing disabled vehicle mutations', async () => {
  api.list.mockResolvedValue(photos);
  render(<VehiclePhotos vehicle={{ ...vehicle, desativado_em: '2026-10-31' }} />);
  await screen.findByText('Principal'); expect(screen.getAllByRole('img')).toHaveLength(2);
  expect(screen.queryByLabelText('Selecionar imagens')).toBeNull(); expect(screen.queryByRole('button', { name: 'Excluir foto 1' })).toBeNull();
});
it('renews signed URLs before expiry and on window focus', async () => {
  const expira_em = new Date(Date.now() + 40000).toISOString();
  api.list.mockImplementation(async () => [{ ...photos[0], expira_em }]);
  render(<VehiclePhotos vehicle={vehicle} />); await screen.findByText('Principal');
  vi.useFakeTimers();
  try {
    // A focus event also covers returning to a backgrounded tab after expiry.
    await act(async () => { window.dispatchEvent(new Event('focus')); });
    expect(api.list).toHaveBeenCalledTimes(2);
    await act(async () => { vi.advanceTimersByTime(10000); });
    expect(api.list.mock.calls.length).toBeGreaterThanOrEqual(3);
  } finally { vi.useRealTimers(); }
});
it('multipart preserves FormData and the shared refresh token flow without JSON content type', async () => {
  const client = new ApiClient('https://test.invalid/api'); let token = 'old';
  const refresh = vi.fn(async () => { token = 'new'; });
  client.configureAuth({ getToken: () => token, refresh, invalidate: vi.fn() });
  const fetchMock = vi.fn().mockResolvedValueOnce(new Response('{}', { status: 401 }))
    .mockResolvedValueOnce(new Response('[]', { status: 201, headers: { 'Content-Type': 'application/json' } }));
  vi.stubGlobal('fetch', fetchMock); const body = new FormData(); body.append('fotos', file());
  await client.multipart('/veiculos/id/fotos', body, { auth: true });
  expect(refresh).toHaveBeenCalledTimes(1);
  for (const [, options] of fetchMock.mock.calls) { expect(options.body).toBe(body); expect(options.headers['Content-Type']).toBeUndefined(); }
  expect(fetchMock.mock.calls[1][1].headers.Authorization).toBe('Bearer new');
});
