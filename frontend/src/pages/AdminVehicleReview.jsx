import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { adminApi } from '../api/admin';
import { useApp } from '../store/AppContext';
import { AdminError, AdminHeading, AdminPagination, ReviewStatus } from '../components/AdminUi';
const mutable = status => ['PENDENTE','EM_ANALISE','REJEITADO'].includes(status);

export default function AdminVehicleReview() {
  const { id } = useParams(), { flash } = useApp();
  const [state,setState] = useState({ loading:true }), [revision,setRevision] = useState(0);
  const [docPage,setDocPage] = useState(1), [historyPage,setHistoryPage] = useState(1);
  const [decision,setDecision] = useState(null), [reason,setReason] = useState(''), [validity,setValidity] = useState('');
  const [error,setError] = useState(''), [busy,setBusy] = useState(false), [file,setFile] = useState(null), [photo,setPhoto] = useState(null);
  const pending = useRef(false), generation = useRef(0);
  useEffect(()=>{setDocPage(1);setHistoryPage(1);setDecision(null);setFile(null);setPhoto(null);},[id]);
  useEffect(()=>{
    const request=++generation.current; setState({ loading:true }); setFile(null); setPhoto(null);
    Promise.all([adminApi.detail(id),adminApi.documents(id,docPage),adminApi.history(id,historyPage)]).then(([vehicle,documents,history])=>{
      if(request===generation.current)setState({vehicle,documents,history});
    }).catch(err=>{if(request===generation.current)setState({error:err.message});});
    return()=>{generation.current++;};
  },[id,docPage,historyPage,revision]);
  useEffect(()=>{
    const deadlines=[state.vehicle?.fotos_expira_em,file?.expira_em].filter(Boolean).map(Date.parse);
    if(!deadlines.length)return;
    const timer=setTimeout(()=>{setFile(null);setPhoto(null);if(!pending.current)setRevision(n=>n+1);},Math.min(2147483647,Math.max(1000,Math.min(...deadlines)-Date.now())));
    return()=>clearTimeout(timer);
  },[state.vehicle?.fotos_expira_em,file]);
  const v=state.vehicle;
  function choose(kind,entity,action){setDecision({kind,entity,action});setReason('');setValidity('');setError('');}
  async function submit(event){
    event.preventDefault();if(pending.current)return;
    if(decision.action==='rejeitar'&&(reason.trim().length<10||reason.trim().length>1000||/[<>\x00-\x08\x0b\x0c\x0e-\x1f]/.test(reason))){setError('Informe uma justificativa de 10 a 1000 caracteres, sem marcação HTML.');return;}
    if(decision.kind==='documentos'&&decision.action==='aprovar'&&(!/^\d{4}-\d{2}-\d{2}$/.test(validity)||validity<new Date().toISOString().slice(0,10))){setError('Confira o CRLV e informe uma validade atual ou futura.');return;}
    const request=generation.current;pending.current=true;setBusy(true);setError('');
    try{
      await adminApi.decide(decision.kind,decision.entity.id,decision.action,{
        status_esperado:decision.entity.status_validacao||decision.entity.status_cadastro,
        ...(decision.action==='rejeitar'?{justificativa:reason.trim()}:{}),
        ...(decision.kind==='documentos'&&decision.action==='aprovar'?{validade_ate:validity}:{}),
      });
      if(request!==generation.current)return;
      setDecision(null);flash('Decisão registrada no histórico.');setRevision(n=>n+1);
    }catch(err){if(request!==generation.current)return;setError(err.message);if([404,409].includes(err.status)){setDecision(null);setRevision(n=>n+1);}}
    finally{pending.current=false;setBusy(false);}
  }
  async function openFile(document){
    if(pending.current)return;const request=generation.current;pending.current=true;setBusy(true);setError('');setFile(null);
    try{const signed=await adminApi.file(document.id);if(request===generation.current)setFile({...signed,id:document.id});}
    catch(err){if(request===generation.current)setError(err.message);}finally{pending.current=false;setBusy(false);}
  }
  const latest=v?.documento_veiculo[0];
  const docReady=latest?.status_validacao==='APROVADO'&&latest.validade_ate&&latest.validade_ate.slice(0,10)>=new Date().toISOString().slice(0,10);
  return <div className="container page admin-page"><AdminHeading title="Análise do veículo"><Link className="muted" to="/admin/veiculos">Voltar à lista</Link></AdminHeading>
    {state.loading&&<p role="status">Carregando análise...</p>}<AdminError error={state.error} retry={()=>setRevision(n=>n+1)}/><AdminError error={error}/>
    {v&&<>
      <section className="panel"><div className="row"><h2>{v.marca} {v.modelo}</h2><ReviewStatus value={v.status_cadastro}/>{v.desativado_em&&<span className="tag">DESATIVADO</span>}</div>
        <p>{v.placa} · {v.ano_fabricacao}/{v.ano_modelo} · {v.categoria} · {v.cambio} · {v.combustivel} · {v.quantidade_lugares} lugares</p><p className="muted">Proprietário: {v.usuario.nome} · {v.usuario.id}</p>
        <div className="row">{!v.desativado_em&&mutable(v.status_cadastro)&&<>
          <button className="btn primary" disabled={busy||!!decision||!v._count.foto_veiculo||!docReady} onClick={()=>choose('veiculos',v,'aprovar')}>Aprovar veículo</button>
          {v.status_cadastro!=='REJEITADO'&&<button className="btn danger" disabled={busy||!!decision} onClick={()=>choose('veiculos',v,'rejeitar')}>Rejeitar veículo</button>}
          {v.status_cadastro==='REJEITADO'&&<button className="btn ghost" disabled={busy||!!decision} onClick={()=>choose('veiculos',v,'reabrir')}>Reabrir análise</button>}
        </>}</div><p className="muted">A aprovação exige o CRLV mais recente aprovado, válido e acessível e uma foto validada. Anúncios permanecem inalterados.</p>
      </section>
      {decision&&<form className="panel admin-decision" role="dialog" aria-label="Confirmar decisão" onSubmit={submit} noValidate>
        <h2>Confirmar {decision.action==='aprovar'?'aprovação':decision.action==='rejeitar'?'rejeição':'reanálise'} de {decision.kind==='documentos'?'documento':'veículo'}</h2><p>A decisão e o responsável serão registrados no histórico.</p>
        {decision.action==='rejeitar'&&<div className="field"><label htmlFor="review-reason">Justificativa</label><textarea id="review-reason" rows={4} autoFocus value={reason} maxLength={1000} disabled={busy} onChange={e=>setReason(e.target.value)}/></div>}
        {decision.kind==='documentos'&&decision.action==='aprovar'&&<div className="field"><label htmlFor="review-validity">Validade conferida no CRLV</label><input id="review-validity" type="date" value={validity} disabled={busy} onChange={e=>setValidity(e.target.value)}/><small>Confira o arquivo. Não estime a validade apenas pelo ano.</small></div>}
        <div className="row"><button className="btn primary" disabled={busy}>{busy?'Registrando decisão...':'Confirmar decisão'}</button><button className="btn ghost" type="button" disabled={busy} onClick={()=>{setDecision(null);setError('');}}>Cancelar</button></div>
      </form>}
      <section className="panel"><h2>Fotografias</h2>{!v.fotos.length&&<p>Nenhuma fotografia cadastrada.</p>}
        <div className="vehicle-photos-grid">{v.fotos.map(item=><div key={item.id} className="vehicle-photo-card">{item.url&&!item.indisponivel&&<button className="admin-photo" aria-label="Ampliar fotografia" onClick={()=>setPhoto(item.url)}><img src={item.url} referrerPolicy="no-referrer" alt="Fotografia do veículo" onError={e=>{e.currentTarget.hidden=true;e.currentTarget.parentElement.nextElementSibling.hidden=false;}}/></button>}<p className="muted" hidden={!!item.url&&!item.indisponivel}>Imagem indisponível. Atualize a análise.</p></div>)}</div>
        <button className="btn ghost small" disabled={busy} onClick={()=>setRevision(n=>n+1)}>Atualizar arquivos</button>
        {photo&&<div className="admin-preview" role="dialog" aria-label="Fotografia ampliada"><button className="btn ghost" onClick={()=>setPhoto(null)}>Fechar fotografia</button><img src={photo} alt="Fotografia ampliada do veículo" referrerPolicy="no-referrer" onError={()=>{setPhoto(null);setError('Fotografia indisponível. Atualize os arquivos.');}}/></div>}
      </section>
      <section className="panel"><h2>Documentação</h2>{!state.documents.total&&<div className="alert warn">CRLV ausente. A aprovação está bloqueada. O proprietário pode enviar o documento na área do veículo.</div>}
        {state.documents.items.map(doc=><article className="admin-document" key={doc.id}><div className="row"><strong>{doc.tipo} · {doc.ano_exercicio||'Ano não informado'}</strong><ReviewStatus value={doc.status_validacao}/>{doc.expirado&&<span className="tag">Validade ausente ou vencida</span>}</div>
          <p className="muted">Validade: {doc.validade_ate?.slice(0,10)||'Não conferida'} · {doc.id}</p>{doc.motivo_rejeicao&&<p className="admin-reason">{doc.motivo_rejeicao}</p>}
          <div className="row"><button className="btn ghost small" disabled={busy} onClick={()=>openFile(doc)}>Consultar arquivo privado</button>
            {!v.desativado_em&&mutable(v.status_cadastro)&&['PENDENTE','EM_ANALISE','REJEITADO','EXPIRADO'].includes(doc.status_validacao)&&<>
              <button className="btn primary small" disabled={busy||!!decision||file?.id!==doc.id} onClick={()=>choose('documentos',doc,'aprovar')}>Aprovar documento</button>
              {doc.status_validacao!=='REJEITADO'&&<button className="btn danger small" disabled={busy||!!decision} onClick={()=>choose('documentos',doc,'rejeitar')}>Rejeitar documento</button>}
            </>}</div>{file?.id===doc.id&&<p><a className="btn ghost small" href={file.url} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">Abrir arquivo (acesso temporário)</a></p>}
        </article>)}<AdminPagination label="Paginação de documentos" data={state.documents} onPage={setDocPage}/>
      </section>
      <section className="panel"><h2>Histórico de decisões</h2>{!state.history.total&&<p>Nenhuma decisão registrada.</p>}
        {state.history.items.map(item=><article key={item.id} className="admin-document"><strong>{item.alvo}: {item.status_anterior} → {item.status_novo}</strong><p className="muted">{new Date(item.criado_em).toLocaleString('pt-BR')} · {item.administrador.nome}{item.documento_id?` · Documento ${item.documento_id}`:''}</p>{item.justificativa&&<p className="admin-reason">{item.justificativa}</p>}{item.validade_ate&&<p className="muted">Validade conferida: {item.validade_ate.slice(0,10)}</p>}</article>)}
        <AdminPagination label="Paginação do histórico" data={state.history} onPage={setHistoryPage}/>
      </section>
    </>}
  </div>;
}
