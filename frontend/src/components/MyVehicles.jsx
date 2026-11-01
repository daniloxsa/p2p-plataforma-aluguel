import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { veiculosApi } from '../api/veiculos';
import { useApp } from '../store/AppContext';
import { anuncioStatus, formatMoney } from '../services/anuncioValidation';
export default function MyVehicles() {
  const { user, flash } = useApp();
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState({ loading: true });
  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pending = useRef(false);
  useEffect(() => {
    let active = true;
    setState({ loading: true });
    veiculosApi.mine(page).then(data => { if (active) setState({ data }); })
      .catch(err => { if (active) setState({ error: err.message }); });
    return () => { active = false; };
  }, [page, revision, user?.id]);
  useEffect(() => {
    const expires = Math.min(...(state.data?.items || []).map(v => Date.parse(v.foto_principal?.expira_em)).filter(Number.isFinite));
    const refresh = () => { if (!pending.current) setRevision(n => n + 1); };
    const timer = Number.isFinite(expires) ? setTimeout(refresh, Math.max(10000, expires - Date.now() - 30000)) : null;
    window.addEventListener('focus', refresh);
    return () => { clearTimeout(timer); window.removeEventListener('focus', refresh); };
  }, [state.data]);
  async function deactivate() {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError('');
    try {
      await veiculosApi.deactivate(confirm.id); setConfirm(null);
      flash('Veículo desativado. Histórico preservado.'); setRevision(n => n + 1);
    } catch (err) { setError(err.message); }
    finally { pending.current = false; setBusy(false); }
  }
  return <div className="panel">
    <h3 style={{ marginTop: 0 }}>Meus veículos</h3>
    <Link className="btn primary" to="/anunciar">Cadastrar veículo</Link>
    {state.loading && <p role="status">Carregando meus veículos...</p>}
    {state.error && <div className="alert err" role="alert">{state.error} <button className="btn small" onClick={() => setRevision(n => n + 1)}>Tentar novamente</button></div>}
    {state.data && <>
      {state.data.fotos_indisponiveis && <div className="alert warn">Miniaturas indisponíveis no momento. Os dados dos veículos continuam disponíveis.</div>}
      {!state.data.items.length ? <p>Nenhum veículo nesta página.</p> : <div style={{ overflowX: 'auto' }}><table className="table">
        <thead><tr><th>Veículo</th><th>Placa</th><th>Status</th><th>Anúncio</th><th>Ações</th></tr></thead>
        <tbody>{state.data.items.map(v => <tr key={v.id}>
          <td>{v.foto_principal ? <img src={v.foto_principal.url} alt={`Foto principal de ${v.marca} ${v.modelo}`} referrerPolicy="no-referrer" style={{ width: 80, height: 55, objectFit: 'cover', borderRadius: 8 }} /> : <span className="muted">Sem foto</span>}<br />{v.marca} {v.modelo}<br /><small>{v.ano_modelo} · {v.categoria}</small></td><td>{v.placa}</td>
          <td>{v.desativado_em ? 'DESATIVADO' : v.status_cadastro}</td>
          <td>{v.anuncio ? <Link to={`/anuncios/meus/${v.anuncio.id}`}>{anuncioStatus[v.anuncio.status] || v.anuncio.status} · {formatMoney(v.anuncio.preco_diaria)}/dia</Link> : 'Sem anúncio'}</td>
          <td><Link className="btn small" to={`/meus-veiculos/${v.id}`}>Visualizar</Link>{!v.desativado_em && <>
            <Link className="btn ghost small" to={`/meus-veiculos/${v.id}/editar`}>Editar</Link>
            {(!v.anuncio || v.anuncio.status === 'ENCERRADO') && <Link className="btn ghost small" to={`/anuncios/novo?veiculo=${encodeURIComponent(v.id)}`}>Criar anúncio</Link>}
            <button className="btn danger small" disabled={busy} onClick={() => { setConfirm(v); setError(''); }}>Desativar</button>
          </>}</td>
        </tr>)}</tbody>
      </table></div>}
      <div className="row"><button className="btn small" disabled={page <= 1 || busy} onClick={() => setPage(n => n - 1)}>Anterior</button>
        <span>Página {page} · {state.data.total} veículos</span>
        <button className="btn small" disabled={page * state.data.limit >= state.data.total || busy} onClick={() => setPage(n => n + 1)}>Próxima</button></div>
    </>}
    {confirm && <div className="alert warn" role="dialog" aria-label="Desativar veículo">
      <p>Desativar {confirm.marca} {confirm.modelo}? O histórico será preservado. A reativação ainda não está disponível.</p>
      {error && <p role="alert">{error}</p>}
      <button className="btn danger" disabled={busy} onClick={deactivate}>{busy ? 'Desativando...' : 'Confirmar desativação'}</button>
      <button className="btn ghost" disabled={busy} onClick={() => setConfirm(null)}>Cancelar</button>
    </div>}
    <div className="alert info">Cadastrar um veículo não publica um anúncio. A frota da Home continua demonstrativa.</div>
  </div>;
}
