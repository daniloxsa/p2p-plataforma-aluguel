import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import VehicleForm from '../src/components/VehicleForm';
import AddVehicle from '../src/pages/AddVehicle';
import OwnerVehicle from '../src/pages/OwnerVehicle';
import MyVehicles from '../src/components/MyVehicles';
import { veiculosApi } from '../src/api/veiculos';
import { apiClient } from '../src/api/client';
const { flash } = vi.hoisted(() => ({ flash: vi.fn() }));
vi.mock('../src/store/AppContext', () => ({ useApp: () => ({ user: { id: 'alice' }, flash }) }));
const dto = { placa: 'ABC1234', marca: 'Toyota', modelo: 'Yaris', ano_fabricacao: 2022, ano_modelo: 2023, categoria: 'Hatch', cambio: 'Automático', combustivel: 'Flex', quantidade_lugares: 5 };
const vehicle = { ...dto, id: 'vehicle-id', status_cadastro: 'PENDENTE', desativado_em: null };
beforeEach(() => flash.mockClear());
function fill() {
  for (const [label, value] of Object.entries({ Placa: 'abc-1234', Marca: 'Toyota', Modelo: 'Yaris', 'Ano de fabricação': '2022', 'Ano do modelo': '2023', Categoria: 'Hatch', 'Câmbio': 'Automático', 'Combustível': 'Flex', 'Quantidade de lugares': '5' })) {
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
  }
}
it('renders required fields and validates before sending', async () => {
  const save = vi.fn(); render(<VehicleForm onSave={save} />);
  fireEvent.click(screen.getByRole('button', { name: 'Cadastrar veículo' }));
  expect(screen.getByRole('alert').textContent).toContain('Preencha'); expect(save).not.toHaveBeenCalled();
  fill(); fireEvent.change(screen.getByLabelText('Placa'), { target: { value: 'BAD' } });
  fireEvent.click(screen.getByRole('button')); expect(screen.getByRole('alert').textContent).toContain('placa');
});
it('submits normalized data once, waits for success then navigates to the real list', async () => {
  let resolve; const gate = new Promise(r => { resolve = r; });
  const create = vi.spyOn(veiculosApi, 'create').mockReturnValue(gate);
  render(<MemoryRouter initialEntries={['/anunciar']}><Routes><Route path="/anunciar" element={<AddVehicle />} /><Route path="/painel" element={<p>Lista persistida</p>} /></Routes></MemoryRouter>);
  fill(); const form = screen.getByLabelText('Placa').closest('form');
  fireEvent.submit(form); fireEvent.submit(form);
  expect(create).toHaveBeenCalledExactlyOnceWith(dto); expect(flash).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Salvando...' }).disabled).toBe(true);
  await act(async () => resolve(vehicle));
  expect(await screen.findByText('Lista persistida')).toBeTruthy(); expect(flash).toHaveBeenCalledWith(expect.stringContaining('sucesso'));
});
it('keeps draft and displays API errors', async () => {
  render(<VehicleForm initial={dto} onSave={async () => { throw new Error('Placa já cadastrada.'); }} />);
  fireEvent.click(screen.getByRole('button')); expect((await screen.findByRole('alert')).textContent).toContain('Placa já cadastrada');
  expect(screen.getByLabelText('Modelo').value).toBe('Yaris');
});
it('loads owner details, sends only changed fields and returns after update', async () => {
  vi.spyOn(veiculosApi, 'own').mockResolvedValue(vehicle);
  const update = vi.spyOn(veiculosApi, 'update').mockResolvedValue({ ...vehicle, modelo: 'Corolla' });
  vi.spyOn(veiculosApi, 'mine').mockResolvedValue({ items: [{ ...vehicle, modelo: 'Corolla' }], total: 1, page: 1, limit: 20 });
  render(<MemoryRouter initialEntries={['/meus-veiculos/vehicle-id/editar']}><Routes><Route path="/meus-veiculos/:id/editar" element={<OwnerVehicle editing />} /><Route path="/painel" element={<MyVehicles />} /></Routes></MemoryRouter>);
  await screen.findByLabelText('Modelo'); fireEvent.change(screen.getByLabelText('Modelo'), { target: { value: 'Corolla' } }); fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }));
  expect(await screen.findByText('Toyota Corolla')).toBeTruthy(); expect(update).toHaveBeenCalledExactlyOnceWith(vehicle.id, { modelo: 'Corolla' });
});
it('renders persisted vehicles and reloads after logical deactivation', async () => {
  const mine = vi.spyOn(veiculosApi, 'mine').mockResolvedValue({ items: [vehicle], total: 1, page: 1, limit: 20 });
  const remove = vi.spyOn(veiculosApi, 'deactivate').mockResolvedValue(undefined);
  render(<MemoryRouter><MyVehicles /></MemoryRouter>);
  expect(screen.getByRole('status')).toBeTruthy(); expect(await screen.findByText('ABC1234')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Desativar' }));
  mine.mockResolvedValue({ items: [{ ...vehicle, desativado_em: '2026-10-31' }], total: 1, page: 1, limit: 20 });
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar desativação' }));
  expect(await screen.findByText('DESATIVADO')).toBeTruthy(); expect(remove).toHaveBeenCalledWith(vehicle.id);
});
it('handles empty lists and session errors with retry', async () => {
  const mine = vi.spyOn(veiculosApi, 'mine').mockRejectedValue(new Error('Sessão expirada. Entre novamente.'));
  render(<MemoryRouter><MyVehicles /></MemoryRouter>);
  expect((await screen.findByRole('alert')).textContent).toContain('Sessão expirada');
  mine.mockResolvedValue({ items: [], total: 0, page: 1, limit: 20 });
  fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' })); expect(await screen.findByText('Nenhum veículo nesta página.')).toBeTruthy();
});
it('shows a signed primary thumbnail and a placeholder without per-vehicle photo requests', async () => {
  vi.spyOn(veiculosApi, 'mine').mockResolvedValue({ items: [
    { ...vehicle, foto_principal: { url: 'https://test.invalid/temporary' } },
    { ...vehicle, id: 'second', placa: 'DEF5678', foto_principal: null },
  ], total: 2, page: 1, limit: 20 });
  render(<MemoryRouter><MyVehicles /></MemoryRouter>);
  expect(await screen.findByAltText('Foto principal de Toyota Yaris')).toBeTruthy();
  expect(screen.getByText('Sem foto')).toBeTruthy();
});
it('vehicle API reuses the existing authenticated client and its refresh flow', async () => {
  let token = 'old'; const refresh = vi.fn(async () => { token = 'new'; }); const invalidate = vi.fn();
  const previous = apiClient.auth;
  apiClient.configureAuth({ getToken: () => token, refresh, invalidate });
  const fetchMock = vi.fn().mockResolvedValueOnce(new Response('{}', { status: 401 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ items: [vehicle] }), { headers: { 'Content-Type': 'application/json' } }));
  vi.stubGlobal('fetch', fetchMock);
  try {
    expect((await veiculosApi.mine()).items[0]).toEqual(vehicle);
    expect(refresh).toHaveBeenCalledTimes(1); expect(fetchMock.mock.calls[1][1].headers.Authorization).toBe('Bearer new');
    fetchMock.mockResolvedValue(new Response('{}', { status: 401 }));
    await expect(veiculosApi.mine()).rejects.toMatchObject({ status: 401 }); expect(invalidate).toHaveBeenCalled();
  } finally { apiClient.configureAuth(previous); }
});
