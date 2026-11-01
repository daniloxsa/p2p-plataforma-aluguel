import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { anunciosApi } from '../api/anuncios';
import { useApp } from '../store/AppContext';
import { anuncioStatus, formatMoney, vehicleName } from '../services/anuncioValidation';

export default function MyAnnouncements() {
  const { user } = useApp();
  const [page, setPage] = useState(1);
  const [sorting, setSorting] = useState('criado_em:desc');
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState({ loading: true });
  useEffect(() => {
    let active = true;
    setState({ loading: true });
    const [orderBy, order] = sorting.split(':');
    anunciosApi.mine(page, 20, orderBy, order).then(data => { if (active) setState({ data }); })
      .catch(error => { if (active) setState({ error: error.message }); });
    return () => { active = false; };
  }, [page, sorting, revision, user?.id]);

  return <div className="container page anuncios-page">
    <Link className="owner-vehicle-back muted" to="/painel?aba=veiculos">← Painel</Link>
    <div className="panel">
      <div className="row"><h1>Meus anúncios</h1><span className="spacer" /><Link className="btn primary" to="/anuncios/novo">Criar anúncio</Link></div>
      <p className="muted">Gerencie a publicação, pause, reative ou encerre seus anúncios e consulte o histórico.</p>
      <div className="field anuncio-sort"><label htmlFor="anuncios-sort">Ordenar por</label>
        <select id="anuncios-sort" value={sorting} onChange={e => { setSorting(e.target.value); setPage(1); }}>
          <option value="criado_em:desc">Mais recentes</option><option value="criado_em:asc">Mais antigos</option>
          <option value="preco_diaria:asc">Menor diária</option><option value="preco_diaria:desc">Maior diária</option>
          <option value="titulo:asc">Título (A–Z)</option>
        </select>
      </div>
      {state.loading && <p role="status">Carregando anúncios...</p>}
      {state.error && <div className="alert err" role="alert">{state.error} <button className="btn ghost small" onClick={() => setRevision(n => n + 1)}>Tentar novamente</button></div>}
      {state.data && <>
        {!state.data.items.length ? <div className="alert info"><p>{state.data.total ? 'Nenhum anúncio nesta página.' : 'Você ainda não tem anúncios. Crie um rascunho para um veículo da sua conta.'}</p>
          <Link className="btn ghost small" to="/anuncios/novo">Criar primeiro anúncio</Link></div> : <div className="anuncios-table-wrap"><table className="table anuncios-table">
          <thead><tr><th>Anúncio / veículo</th><th>Diária</th><th>Status</th><th>Criado em</th><th>Ação</th></tr></thead>
          <tbody>{state.data.items.map(row => <tr key={row.id}>
            <td><strong>{row.titulo}</strong><br /><span className="muted">{vehicleName(row.veiculo)}{row.veiculo?.ano_modelo ? ` · ${row.veiculo.ano_modelo}` : ''}</span></td>
            <td className="anuncio-nowrap">{formatMoney(row.preco_diaria)}</td>
            <td><span className={`status anuncio-status st-${row.status}`}>{anuncioStatus[row.status] || row.status}</span></td>
            <td>{new Date(row.criado_em).toLocaleDateString('pt-BR')}</td>
            <td><Link className="btn ghost small" to={`/anuncios/meus/${row.id}`}>{['RASCUNHO','PAUSADO'].includes(row.status) ? 'Visualizar / editar' : 'Visualizar'}</Link></td>
          </tr>)}</tbody>
        </table></div>}
        <nav className="row anuncio-pagination" aria-label="Paginação de anúncios">
          <button className="btn ghost small" disabled={page <= 1} onClick={() => setPage(n => n - 1)}>Anterior</button>
          <span className="muted">Página {page} · {state.data.total} anúncios</span>
          <button className="btn ghost small" disabled={page * state.data.limit >= state.data.total || page >= 100000} onClick={() => setPage(n => n + 1)}>Próxima</button>
        </nav>
      </>}
    </div>
  </div>;
}
