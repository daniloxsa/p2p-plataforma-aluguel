import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import { adminApi } from '../src/api/admin';
import { apiClient, ApiError } from '../src/api/client';
import AdminRoute, { AdminAccessProvider } from '../src/components/AdminAccess';
import ProtectedRoute from '../src/components/ProtectedRoute';
import Admin from '../src/pages/Admin';
import AdminVehicles from '../src/pages/AdminVehicles';
import AdminVehicleReview from '../src/pages/AdminVehicleReview';
const { context }=vi.hoisted(()=>({context:{user:{id:'alice'},isAuthenticated:true,isAuthLoading:false,flash:vi.fn()}}));
vi.mock('../src/store/AppContext',()=>({useApp:()=>context}));
const document={id:'doc',tipo:'CRLV',status_validacao:'APROVADO',validade_ate:'2099-12-31T00:00:00Z',expirado:false};
const vehicle={id:'vehicle',marca:'Toyota',modelo:'Yaris',placa:'TST1A23',status_cadastro:'PENDENTE',criado_em:'2026-11-01T12:00:00Z',usuario:{id:'owner',nome:'Owner'},_count:{foto_veiculo:1,documento_veiculo:1},documento_veiculo:[document],fotos:[],fotos_expira_em:'2099-12-31T00:00:00Z'};
const paged=(items,total=items.length,page=1)=>({items,total,page,limit:20});
beforeEach(()=>{context.isAuthenticated=true;context.isAuthLoading=false;context.flash.mockClear();});
function mount(path='/admin',guard=true){return render(<MemoryRouter initialEntries={[path]}><AdminAccessProvider><Routes><Route element={<ProtectedRoute/>}><Route element={guard?<AdminRoute/>:null}>
  <Route path="/admin" element={<Admin/>}/><Route path="/admin/veiculos" element={<AdminVehicles/>}/><Route path="/admin/veiculos/:id" element={<AdminVehicleReview/>}/>
  </Route></Route><Route path="/login" element={<p>Login necessário</p>}/></Routes></AdminAccessProvider></MemoryRouter>);}
function ready(){vi.spyOn(adminApi,'me').mockResolvedValue({id:'alice',papel:'ADMIN'});vi.spyOn(adminApi,'detail').mockResolvedValue(vehicle);vi.spyOn(adminApi,'documents').mockResolvedValue(paged([document]));vi.spyOn(adminApi,'history').mockResolvedValue(paged([]));}

it('ADMIN sees real API statistics and filtered links without repeated authorization loops',async()=>{
  ready();const stats=vi.spyOn(adminApi,'stats').mockResolvedValue({total:9,pendentes:4,aprovados:3,rejeitados:2});
  mount();expect(screen.getByRole('status').textContent).toContain('Verificando');
  expect(await screen.findByText('Total de veículos')).toBeTruthy();expect(screen.getByText('9')).toBeTruthy();
  expect(screen.getByRole('link',{name:/Pendentes/}).getAttribute('href')).toBe('/admin/veiculos?status=PENDENTE');
  expect(stats).toHaveBeenCalledTimes(1);expect(adminApi.me.mock.calls.length).toBeLessThanOrEqual(2);
});
it('USUARIO is denied and logged-out users follow the existing login flow',async()=>{
  vi.spyOn(adminApi,'me').mockRejectedValue(new ApiError(403));const stats=vi.spyOn(adminApi,'stats');
  const view=mount();expect((await screen.findByRole('alert')).textContent).toContain('negado');expect(stats).not.toHaveBeenCalled();
  view.unmount();context.isAuthenticated=false;mount();expect(await screen.findByText('Login necessário')).toBeTruthy();
});
it('dashboard handles zero totals and retry after network failure',async()=>{
  ready();const stats=vi.spyOn(adminApi,'stats').mockRejectedValue(new ApiError(0,'Conexão indisponível.'));mount();
  expect((await screen.findByRole('alert')).textContent).toContain('Conexão');stats.mockResolvedValue({total:0,pendentes:0,aprovados:0,rejeitados:0});
  fireEvent.click(screen.getByRole('button',{name:'Tentar novamente'}));expect(await screen.findByText('Nenhum veículo cadastrado para analisar.')).toBeTruthy();
});
it('list uses server-side filtering, search, pagination and detail navigation',async()=>{
  ready();const list=vi.spyOn(adminApi,'list').mockResolvedValue(paged([vehicle],21));mount('/admin/veiculos?status=PENDENTE');
  expect(await screen.findByText('Toyota Yaris')).toBeTruthy();expect(list).toHaveBeenLastCalledWith(expect.objectContaining({status:'PENDENTE',page:1,limit:20}));
  fireEvent.click(screen.getByRole('button',{name:'Próxima'}));await waitFor(()=>expect(list).toHaveBeenLastCalledWith(expect.objectContaining({page:2})));
  await screen.findByText('Toyota Yaris');fireEvent.change(screen.getByLabelText('Buscar por UUID, placa, marca ou modelo'),{target:{value:'Yaris'}});fireEvent.click(screen.getByRole('button',{name:'Buscar'}));
  await waitFor(()=>expect(list).toHaveBeenLastCalledWith(expect.objectContaining({busca:'Yaris',page:1})));
  fireEvent.click(await screen.findByRole('link',{name:'Analisar'}));expect(await screen.findByRole('heading',{name:'Documentação'})).toBeTruthy();
});
it('vehicle approval requires confirmation, sends once and updates only after API confirmation',async()=>{
  ready();let resolve;const promise=new Promise(r=>{resolve=r;});const decide=vi.spyOn(adminApi,'decide').mockReturnValue(promise);
  mount('/admin/veiculos/vehicle');fireEvent.click(await screen.findByRole('button',{name:'Aprovar veículo'}));
  expect(screen.getByRole('dialog')).toBeTruthy();expect(decide).not.toHaveBeenCalled();
  const form=screen.getByRole('dialog');fireEvent.submit(form);fireEvent.submit(form);
  expect(decide).toHaveBeenCalledExactlyOnceWith('veiculos','vehicle','aprovar',{status_esperado:'PENDENTE'});
  expect(screen.getByRole('button',{name:'Registrando decisão...'}).disabled).toBe(true);
  adminApi.detail.mockResolvedValue({...vehicle,status_cadastro:'APROVADO'});
  await act(async()=>resolve({id:'vehicle',status_cadastro:'APROVADO'}));
  await waitFor(()=>expect(screen.queryByRole('button',{name:'Aprovar veículo'})).toBeNull());expect(context.flash).toHaveBeenCalled();
});
it('rejection validates and preserves reason on 400, then records the decision',async()=>{
  ready();const decide=vi.spyOn(adminApi,'decide').mockRejectedValue(new ApiError(400,'Confira a justificativa.'));
  mount('/admin/veiculos/vehicle');fireEvent.click(await screen.findByRole('button',{name:'Rejeitar veículo'}));
  fireEvent.click(screen.getByRole('button',{name:'Confirmar decisão'}));expect(screen.getByRole('alert').textContent).toContain('10 a 1000');expect(decide).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText('Justificativa'),{target:{value:'Foto sem informação suficiente.'}});fireEvent.click(screen.getByRole('button',{name:'Confirmar decisão'}));
  expect((await screen.findByRole('alert')).textContent).toContain('Confira');expect(screen.getByLabelText('Justificativa').value).toBe('Foto sem informação suficiente.');
  decide.mockResolvedValue({});adminApi.detail.mockResolvedValue({...vehicle,status_cadastro:'REJEITADO'});fireEvent.click(screen.getByRole('button',{name:'Confirmar decisão'}));
  expect(await screen.findByRole('button',{name:'Reabrir análise'})).toBeTruthy();
});
it('document approval needs private file access and explicit validity; 409 refreshes the analysis',async()=>{
  ready();adminApi.documents.mockResolvedValue(paged([{...document,status_validacao:'PENDENTE',validade_ate:null,expirado:true}]));
  vi.spyOn(adminApi,'file').mockResolvedValue({url:'https://private.invalid/temporary',expira_em:'2099-12-31T00:00:00Z'});
  const decide=vi.spyOn(adminApi,'decide').mockRejectedValue(new ApiError(409,'Estado alterado.'));
  mount('/admin/veiculos/vehicle');expect((await screen.findByRole('button',{name:'Aprovar documento'})).disabled).toBe(true);
  fireEvent.click(screen.getByRole('button',{name:'Consultar arquivo privado'}));await screen.findByRole('link',{name:/Abrir arquivo/});
  fireEvent.click(screen.getByRole('button',{name:'Aprovar documento'}));fireEvent.click(screen.getByRole('button',{name:'Confirmar decisão'}));expect(screen.getByRole('alert').textContent).toContain('validade');
  fireEvent.change(screen.getByLabelText('Validade conferida no CRLV'),{target:{value:'2099-12-31'}});fireEvent.click(screen.getByRole('button',{name:'Confirmar decisão'}));
  await waitFor(()=>expect(adminApi.detail).toHaveBeenCalledTimes(2));expect(decide).toHaveBeenCalledWith('documentos','doc','aprovar',{status_esperado:'PENDENTE',validade_ate:'2099-12-31'});
});
it.each([401,404])('handles HTTP %s without exposing stale review data',async status=>{
  ready();adminApi.detail.mockRejectedValue(new ApiError(status,`Falha ${status}`));mount('/admin/veiculos/vehicle');
  expect((await screen.findByRole('alert')).textContent).toContain(`Falha ${status}`);expect(screen.queryByRole('button',{name:'Aprovar veículo'})).toBeNull();
});
it('real administrative client denial invalidates access while the page is open',async()=>{
  ready();vi.spyOn(adminApi,'stats').mockResolvedValue({total:0,pendentes:0,aprovados:0,rejeitados:0});mount();await screen.findByText('Total de veículos');
  const previous=apiClient.auth;apiClient.configureAuth(null);vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('{}',{status:403})));
  try{await act(async()=>{await expect(adminApi.file('doc')).rejects.toMatchObject({status:403});});expect((await screen.findByRole('alert')).textContent).toContain('negado');}
  finally{apiClient.configureAuth(previous);}
});
