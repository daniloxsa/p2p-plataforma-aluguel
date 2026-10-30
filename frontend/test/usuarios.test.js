import { expect, it, vi } from 'vitest';
import { usuariosService, UsuariosService, vehicleService, reservaService } from '../src/services';
import { usuariosRepository } from '../src/repositories';
import { authService } from '../src/services/authService';
import { API_CONFIG, isMockMode } from '../src/api/config';

const profile = { id: 'profile-user', nome: 'João Silva', telefone: '79999999999', email: 'joao@example.com', status: 'PENDENTE_VERIFICACAO' };
const json = data => new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } });

it('exporta a instância de usuários e mantém os repositórios de demonstração disponíveis', () => {
  expect(usuariosService).toBeInstanceOf(UsuariosService);
  expect(usuariosRepository).toBeTruthy();
  expect(vehicleService.repository).toBeTruthy();
  expect(reservaService.repository).toBeTruthy();
  expect(isMockMode()).toBe(true);
});

it('GET de perfil usa a API real com um único /api e JWT automático mesmo no modo mock', async () => {
  authService.update({ accessToken: 'profile-access', user: profile, isAuthenticated: true });
  const fetch = vi.fn(async () => json(profile));
  vi.stubGlobal('fetch', fetch);
  try {
    expect(await usuariosService.getProfile()).toEqual(profile);
    expect(fetch).toHaveBeenCalledExactlyOnceWith(`${API_CONFIG.baseURL}/usuarios/me`, expect.objectContaining({
      method: 'GET', credentials: 'include', headers: expect.objectContaining({ Authorization: 'Bearer profile-access' }),
    }));
  } finally { authService.clear(); }
});

it('PATCH de perfil envia nome e telefone à API com JWT e usa a resposta do servidor', async () => {
  const data = { nome: 'João Atualizado', telefone: '11999998888' };
  const updated = { ...profile, ...data };
  authService.update({ accessToken: 'profile-access', user: profile, isAuthenticated: true });
  const fetch = vi.fn(async () => json(updated));
  vi.stubGlobal('fetch', fetch);
  try {
    expect(await usuariosService.updateProfile(data)).toEqual(updated);
    expect(fetch).toHaveBeenCalledExactlyOnceWith(`${API_CONFIG.baseURL}/usuarios/me`, expect.objectContaining({
      method: 'PATCH', body: JSON.stringify(data), credentials: 'include',
      headers: expect.objectContaining({ Authorization: 'Bearer profile-access' }),
    }));
  } finally { authService.clear(); }
});
