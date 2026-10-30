import { expect, it, vi } from 'vitest';
import { vehicleRepository, reservaRepository } from '../src/repositories';
import { API_CONFIG, isMockMode } from '../src/api/config';

it('configurar a API de autenticação preserva veículos e reservas em demonstração', async () => {
  const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
  expect(API_CONFIG.baseURL).toContain('/api'); expect(isMockMode()).toBe(true);
  const vehicles = await vehicleRepository.list(); const reservas = await reservaRepository.list();
  expect(vehicles.length).toBeGreaterThan(0); expect(reservas.length).toBeGreaterThan(0);
  expect(await vehicleRepository.getById(vehicles[0].id)).toEqual(vehicles[0]);
  const created = await reservaRepository.create({ veiculoId: vehicles[0].id, inicio: '2030-01-01', fim: '2030-01-03' });
  expect((await reservaRepository.list()).some(r => r.id === created.id)).toBe(true);
  expect(fetch).not.toHaveBeenCalled();
});
