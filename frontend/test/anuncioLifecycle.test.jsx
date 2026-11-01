import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import OwnerAnnouncement from '../src/pages/OwnerAnnouncement';
import MyAnnouncements from '../src/pages/MyAnnouncements';
import { anunciosApi } from '../src/api/anuncios';
import { apiClient, ApiError } from '../src/api/client';
const { flash } = vi.hoisted(() => ({ flash: vi.fn() }));
vi.mock('../src/store/AppContext', () => ({ useApp: () => ({ user: { id: 'owner' }, flash }) }));
const row = { id:'listing',veiculo_id:'vehicle',veiculo:{id:'vehicle',marca:'Toyota',modelo:'Yaris',ano_modelo:2023,status_cadastro:'APROVADO'},
  titulo:'Yaris de teste',descricao:'Descrição',preco_diaria:'100.00',valor_caucao:'0.00',preco_seguro_dia:'0.00',aceite_automatico:false,status:'RASCUNHO',criado_em:'2026-11-01T12:00:00Z' };
beforeEach(() => { flash.mockClear(); vi.spyOn(anunciosApi,'own').mockResolvedValue(row); vi.spyOn(anunciosApi,'history').mockResolvedValue({items:[],total:0,page:1,limit:20}); });
function view() { return render(<MemoryRouter initialEntries={['/anuncios/meus/listing']}><Routes><Route path="/anuncios/meus/:id" element={<OwnerAnnouncement/>}/></Routes></MemoryRouter>); }
it.each([
  ['RASCUNHO','Rascunho',['Publicar anúncio','Encerrar anúncio'],true],
  ['ATIVO','Publicado',['Pausar anúncio','Encerrar anúncio'],false],
  ['PAUSADO','Pausado',['Reativar anúncio','Encerrar anúncio'],true],
  ['ENCERRADO','Encerrado',[],false],
])('renders %s with correct available actions and editability',async(status,label,actions,editable)=>{
  anunciosApi.own.mockResolvedValue({...row,status});view();await screen.findByText(label);
  for(const action of ['Publicar anúncio','Pausar anúncio','Reativar anúncio','Encerrar anúncio'])expect(Boolean(screen.queryByRole('button',{name:action}))).toBe(actions.includes(action));
  expect(Boolean(screen.queryByLabelText('Título do anúncio'))).toBe(editable);
});
it.each([
  ['RASCUNHO','publish','Publicar anúncio','Confirmar publicação','ATIVO','Publicado'],
  ['ATIVO','pause','Pausar anúncio','Confirmar pausa','PAUSADO','Pausado'],
  ['PAUSADO','reactivate','Reativar anúncio','Confirmar reativação','ATIVO','Publicado'],
  ['PAUSADO','close','Encerrar anúncio','Confirmar encerramento','ENCERRADO','Encerrado'],
])('confirms %s/%s, prevents repeated clicks and updates only after server success',async(status,method,buttonName,confirmName,nextStatus,label)=>{
  anunciosApi.own.mockResolvedValue({...row,status});let resolve;const gate=new Promise(r=>{resolve=r;});const call=vi.spyOn(anunciosApi,method).mockReturnValue(gate);
  view();await screen.findByRole('button',{name:buttonName});fireEvent.click(screen.getByRole('button',{name:buttonName}));
  const dialog=screen.getByRole('dialog');expect(dialog.getAttribute('aria-describedby')).toBeTruthy();expect(call).not.toHaveBeenCalled();
  if(method==='pause')expect(dialog.textContent).toContain('não serão canceladas');
  if(method==='reactivate')expect(dialog.textContent).toContain('CRLV');
  if(method==='close')expect(dialog.textContent).toContain('definitivo');
  const confirm=within(dialog).getByRole('button',{name:confirmName});fireEvent.click(confirm);fireEvent.click(confirm);
  expect(call).toHaveBeenCalledExactlyOnceWith('listing');expect(confirm.disabled).toBe(true);expect(flash).not.toHaveBeenCalled();
  anunciosApi.own.mockResolvedValue({...row,status:nextStatus});await act(async()=>resolve({...row,status:nextStatus}));
  expect(await screen.findByText(label)).toBeTruthy();expect(screen.queryByRole('dialog')).toBeNull();expect(flash).toHaveBeenCalledTimes(1);
});
it('allows keyboard cancellation and requires saving pending changes before publishing',async()=>{
  const publish=vi.spyOn(anunciosApi,'publish');view();await screen.findByRole('button',{name:'Publicar anúncio'});
  fireEvent.click(screen.getByRole('button',{name:'Publicar anúncio'}));fireEvent.keyDown(screen.getByRole('dialog'),{key:'Escape'});expect(screen.queryByRole('dialog')).toBeNull();expect(publish).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText('Título do anúncio'),{target:{value:'Não salvo'}});expect(screen.getByRole('button',{name:'Publicar anúncio'}).disabled).toBe(true);
  fireEvent.change(screen.getByLabelText('Título do anúncio'),{target:{value:row.titulo}});expect(screen.getByRole('button',{name:'Publicar anúncio'}).disabled).toBe(false);
});
it.each([
  [409,'Seu veículo precisa ser aprovado antes da publicação.'],[409,'O CRLV mais recente precisa estar aprovado e dentro da validade.'],
  [403,'Acesso não autorizado.'],[401,'Sessão expirada. Entre novamente.'],[503,'Não foi possível confirmar a disponibilidade da fotografia.'],
])('displays safe rejection %s without announcing success',async(status,message)=>{
  vi.spyOn(anunciosApi,'publish').mockRejectedValue(new ApiError(status,message));view();await screen.findByText('Rascunho');
  fireEvent.click(screen.getByRole('button',{name:'Publicar anúncio'}));fireEvent.click(screen.getByRole('button',{name:'Confirmar publicação'}));
  expect((await screen.findByRole('alert')).textContent).toContain(message);expect(flash).not.toHaveBeenCalled();expect(screen.getByText('Rascunho')).toBeTruthy();
});
it('history loads on request and refreshes after a transition; ownership errors are recoverable',async()=>{
  vi.spyOn(anunciosApi,'publish').mockResolvedValue({...row,status:'ATIVO'});view();await screen.findByText('Rascunho');expect(anunciosApi.history).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button',{name:'Ver histórico de transições'}));await screen.findByText('Nenhuma transição registrada.');
  anunciosApi.history.mockResolvedValue({items:[{id:'event',status_anterior:'RASCUNHO',status_novo:'ATIVO',operacao:'PUBLICAR',criado_em:row.criado_em}],total:1,page:1,limit:20});
  anunciosApi.own.mockResolvedValue({...row,status:'ATIVO'});fireEvent.click(screen.getByRole('button',{name:'Publicar anúncio'}));fireEvent.click(screen.getByRole('button',{name:'Confirmar publicação'}));
  expect(await screen.findByText('Rascunho → Publicado')).toBeTruthy();expect(anunciosApi.history).toHaveBeenCalledTimes(2);
});
it('list presents all lifecycle labels and links to existing management routes',async()=>{
  vi.spyOn(anunciosApi,'mine').mockResolvedValue({items:['RASCUNHO','ATIVO','PAUSADO','ENCERRADO'].map((status,index)=>({...row,id:`a${index}`,status})),total:4,page:1,limit:20});
  render(<MemoryRouter><MyAnnouncements/></MemoryRouter>);await screen.findByText('Publicado');expect(screen.getByText('Pausado')).toBeTruthy();expect(screen.getByText('Encerrado')).toBeTruthy();
  expect(screen.getAllByRole('link',{name:'Visualizar / editar'})).toHaveLength(2);
});
it('API maps finite lifecycle codes, discards arbitrary server messages and keeps shared session authentication',async()=>{
  anunciosApi.history.mockRestore();const previous=apiClient.auth;let token='old';const refresh=vi.fn(async()=>{token='new';});apiClient.configureAuth({getToken:()=>token,refresh,invalidate:vi.fn()});
  const json=(body,status)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
  const fetch=vi.fn().mockResolvedValueOnce(json({},401)).mockResolvedValueOnce(json({code:'CRLV_INVALIDO',message:'INTERNAL_SECRET'},409));vi.stubGlobal('fetch',fetch);
  try{
    await expect(anunciosApi.publish('listing')).rejects.toMatchObject({status:409,code:'CRLV_INVALIDO',message:'O CRLV mais recente precisa estar aprovado e dentro da validade.'});expect(refresh).toHaveBeenCalledTimes(1);
    expect(fetch.mock.lastCall[1].headers.Authorization).toBe('Bearer new');expect(fetch.mock.lastCall[1].body).toBe('{}');
    fetch.mockResolvedValue(json({code:'UNKNOWN',message:'INTERNAL_SECRET'},503));await expect(anunciosApi.reactivate('listing')).rejects.not.toHaveProperty('message','INTERNAL_SECRET');
    fetch.mockResolvedValue(json({},200));await anunciosApi.pause('listing');expect(fetch.mock.lastCall[0]).toContain('/anuncios/listing/pausar');
  }finally{apiClient.configureAuth(previous);}
});
