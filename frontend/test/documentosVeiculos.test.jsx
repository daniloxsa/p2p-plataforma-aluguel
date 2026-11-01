import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import VehicleDocuments from '../src/components/VehicleDocuments';
import { documentosVeiculosApi as api } from '../src/api/documentosVeiculos';
import { apiClient } from '../src/api/client';
const vehicle = { id: 'vehicle', status_cadastro: 'PENDENTE' };
const empty = { documento: null, pode_enviar: true, bloqueio: null, limite_bytes: 10 * 1024 * 1024 };
const doc = { id: 'doc', status_validacao: 'PENDENTE', criado_em: '2026-11-01T12:00:00Z' };
const file = (name = 'crlv.pdf', type = 'application/pdf', size = 12) => new File([new Uint8Array(size)], name, { type });
const select = selected => fireEvent.change(screen.getByLabelText('Escolher CRLV'), { target: { files: [selected] } });
beforeEach(() => { vi.spyOn(api, 'list').mockResolvedValue(empty); URL.createObjectURL = vi.fn(() => 'blob:preview'); URL.revokeObjectURL = vi.fn(); });
it('renders empty state, validates extension/type/empty/limit and previews images', async () => {
  const view = render(<VehicleDocuments vehicle={vehicle} />); await screen.findByText('Nenhum documento enviado');
  for (const invalid of [file('x.svg','image/svg+xml'),file('x.pdf','image/png'),file('x.pdf','application/pdf',0),file('x.pdf','application/pdf',empty.limite_bytes+1)]) {
    select(invalid); expect(screen.getByRole('alert').textContent).toContain('Selecione'); expect(screen.queryByText('Enviar documento')).toBeNull();
  }
  select(file('crlv.png','image/png')); expect(await screen.findByAltText('Prévia do CRLV selecionado')).toBeTruthy(); view.unmount(); expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:preview');
});
it('uploads once, disables controls and displays the new pending document', async () => {
  let resolve; const gate = new Promise(r => { resolve = r; }); const upload = vi.spyOn(api, 'upload').mockReturnValue(gate);
  render(<VehicleDocuments vehicle={vehicle} />); await screen.findByText('Nenhum documento enviado'); const original = file(); select(original);
  const button = screen.getByText('Enviar documento'); fireEvent.click(button); fireEvent.click(button);
  expect(upload).toHaveBeenCalledExactlyOnceWith(vehicle.id, original); expect(button.closest('fieldset').disabled).toBe(true); expect(screen.getByText('Processando documento. Aguarde...')).toBeTruthy();
  await act(async () => resolve({ ...empty, documento: doc, pode_enviar: false, bloqueio: 'Aguarde a análise.' }));
  expect(await screen.findByText('Aguardando análise')).toBeTruthy(); expect(screen.queryByLabelText('Escolher CRLV')).toBeNull(); expect(screen.getByText('CRLV enviado. Aguardando nova análise administrativa.')).toBeTruthy();
});
it('keeps selected file after errors and handles expired sessions', async () => {
  vi.spyOn(api, 'upload').mockRejectedValue(new Error('Sessão expirada. Entre novamente.'));
  render(<VehicleDocuments vehicle={vehicle} />); await screen.findByText('Nenhum documento enviado'); select(file()); fireEvent.click(screen.getByText('Enviar documento'));
  expect((await screen.findByRole('alert')).textContent).toContain('Sessão expirada'); expect(screen.getByText(/crlv.pdf/)).toBeTruthy();
});
it.each(['PENDENTE','EM_ANALISE','APROVADO','REJEITADO','EXPIRADO'])('renders %s and allows only authorized resend', async status => {
  const allowed = ['REJEITADO','EXPIRADO'].includes(status);
  api.list.mockResolvedValue({ ...empty, documento: { ...doc, status_validacao: status, motivo_rejeicao: 'Documento ilegível.' }, pode_enviar: allowed, bloqueio: allowed ? null : 'Aguarde revisão.' });
  render(<VehicleDocuments vehicle={vehicle} />); await screen.findByText('CRLV mais recente');
  expect(Boolean(screen.queryByLabelText('Escolher CRLV'))).toBe(allowed);
  if (status === 'REJEITADO') expect(screen.getByText('Motivo da rejeição: Documento ilegível.')).toBeTruthy();
});
it('blocks uploads for approved/inactive vehicles and refreshes status on focus', async () => {
  const view = render(<VehicleDocuments vehicle={{ ...vehicle, status_cadastro: 'APROVADO' }} />); await screen.findByText('Nenhum documento enviado'); expect(screen.queryByLabelText('Escolher CRLV')).toBeNull();
  view.rerender(<VehicleDocuments vehicle={{ ...vehicle, desativado_em: '2026-11-01' }} />); expect(screen.queryByLabelText('Escolher CRLV')).toBeNull();
  api.list.mockResolvedValue({ ...empty, documento: { ...doc, status_validacao: 'APROVADO' }, pode_enviar: false });
  await act(async () => window.dispatchEvent(new Event('focus'))); expect(await screen.findByText('Documento aprovado')).toBeTruthy();
});
it('opens private documents only on request and removes expired signed links', async () => {
  api.list.mockResolvedValue({ ...empty, documento: doc, pode_enviar: false });
  const access = vi.spyOn(api, 'file').mockResolvedValue({ url: 'https://test.invalid/signed', expira_em: new Date(Date.now()+10000).toISOString() });
  render(<VehicleDocuments vehicle={vehicle} />); await screen.findByText('CRLV mais recente'); expect(access).not.toHaveBeenCalled(); fireEvent.click(screen.getByText('Consultar meu documento'));
  const link = await screen.findByRole('link', { name: /Abrir documento/ }); expect(link.href).toContain('https://test.invalid/signed'); expect(access).toHaveBeenCalledWith('vehicle','doc');
  // Arm the expiry timer while the fake clock is already active.
  vi.useFakeTimers(); try {
    access.mockResolvedValue({ url: 'https://test.invalid/renewed', expira_em: new Date(Date.now()+10000).toISOString() });
    await act(async () => fireEvent.click(screen.getByText('Consultar meu documento')));
    await act(async () => vi.advanceTimersByTime(10001)); expect(screen.queryByRole('link')).toBeNull();
  } finally { vi.useRealTimers(); }
});
it.each([400,401,403,404,409,413,429,503])('API preserves status %s and supplies useful messages', async status => {
  api.list.mockRestore();
  vi.spyOn(apiClient,'get').mockRejectedValue(Object.assign(new Error('Sessão expirada.'), { status }));
  await expect(api.list('vehicle')).rejects.toMatchObject({ status, message: expect.any(String) });
});
