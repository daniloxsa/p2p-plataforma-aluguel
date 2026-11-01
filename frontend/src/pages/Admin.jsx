import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { adminApi } from '../api/admin';
import { AdminError } from '../components/AdminUi';
export default function Admin() {
  const [state,setState] = useState({ loading: true }), [revision,setRevision] = useState(0);
  useEffect(() => {
    let active = true; setState({ loading: true });
    adminApi.stats().then(data => { if (active) setState({ data }); }).catch(error => { if (active) setState({ error: error.message }); });
    return () => { active = false; };
  }, [revision]);
  return <div className="container page admin-page"><h1>Administração</h1><p className="muted">Análise de veículos e documentação. Indicadores do cadastro real.</p>
    {state.loading && <p role="status">Carregando indicadores...</p>}<AdminError error={state.error} retry={() => setRevision(n=>n+1)} />
    {state.data && <><div className="admin-indicators">{[['total','Total de veículos',''],['pendentes','Pendentes','PENDENTE'],['aprovados','Aprovados','APROVADO'],['rejeitados','Rejeitados','REJEITADO']].map(([key,label,status]) => <Link className="panel" key={key} to={`/admin/veiculos${status?`?status=${status}`:''}`}><span className="muted">{label}</span><strong>{state.data[key]}</strong></Link>)}</div>
      {state.data.total===0 && <div className="alert info">Nenhum veículo cadastrado para analisar.</div>}<Link className="btn primary" to="/admin/veiculos">Consultar veículos</Link></>}
  </div>;
}
