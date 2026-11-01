import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { adminApi } from '../api/admin';
import { AdminError, AdminHeading, AdminPagination, ReviewStatus } from '../components/AdminUi';
export default function AdminVehicles() {
  const [params,setParams] = useSearchParams(), [search,setSearch] = useState(params.get('busca')||'');
  const [state,setState] = useState({ loading: true }), [revision,setRevision] = useState(0);
  const status=params.get('status')||'', page=Number(params.get('page')||1), order=params.get('order')||'desc', orderBy=params.get('orderBy')||'criado_em', busca=params.get('busca')||'';
  const update=patch=>setParams({ ...Object.fromEntries(params), page:'1', ...patch });
  useEffect(()=>{ let active=true; setState({ loading:true }); adminApi.list({page,limit:20,status,busca,orderBy,order}).then(data=>{if(active)setState({data});}).catch(error=>{if(active)setState({error:error.message});}); return()=>{active=false;}; },[page,status,busca,orderBy,order,revision]);
  return <div className="container page admin-page"><AdminHeading title="Análise de veículos" />
    <form className="panel admin-filters" onSubmit={e=>{e.preventDefault();update({busca:search.trim()});}}>
      <div className="field"><label htmlFor="admin-search">Buscar por UUID, placa, marca ou modelo</label><input id="admin-search" value={search} maxLength={100} onChange={e=>setSearch(e.target.value)}/></div>
      <div className="field"><label htmlFor="admin-status">Status</label><select id="admin-status" value={status} onChange={e=>update({status:e.target.value})}><option value="">Todos</option>{['PENDENTE','EM_ANALISE','APROVADO','REJEITADO'].map(v=><option key={v}>{v}</option>)}</select></div>
      <div className="field"><label htmlFor="admin-order">Ordenação</label><select id="admin-order" value={`${orderBy}:${order}`} onChange={e=>{const [field,direction]=e.target.value.split(':');update({orderBy:field,order:direction});}}><option value="criado_em:desc">Mais recentes</option><option value="criado_em:asc">Mais antigos</option><option value="marca:asc">Marca (A–Z)</option></select></div><button className="btn primary">Buscar</button>
    </form>
    {state.loading&&<p role="status">Carregando veículos...</p>}<AdminError error={state.error} retry={()=>setRevision(n=>n+1)}/>
    {state.data&&<div className="panel">{!state.data.items.length?<p>Nenhum veículo encontrado.</p>:<div className="anuncios-table-wrap"><table className="table admin-table"><thead><tr><th>Veículo</th><th>Proprietário</th><th>Cadastro</th><th>Documentação / fotos</th><th>Ação</th></tr></thead><tbody>{state.data.items.map(v=><tr key={v.id}><td><strong>{v.marca} {v.modelo}</strong><br/><span className="muted">{v.ano_modelo} · {v.placa}</span><br/><small>{v.id}</small></td><td>{v.usuario.nome}</td><td><ReviewStatus value={v.status_cadastro}/>{v.desativado_em&&<p className="muted">Desativado</p>}<br/><small>{new Date(v.criado_em).toLocaleDateString('pt-BR')}</small></td><td>{v._count.foto_veiculo} fotos · {v._count.documento_veiculo} documentos<br/><span className="muted">CRLV: {v.documento_veiculo[0]?.status_validacao||'Ausente'}</span></td><td><Link className="btn ghost small" to={`/admin/veiculos/${v.id}`}>Analisar</Link></td></tr>)}</tbody></table></div>}<AdminPagination label="Paginação de veículos" data={state.data} onPage={page=>update({page:String(page)})}/></div>}
  </div>;
}
