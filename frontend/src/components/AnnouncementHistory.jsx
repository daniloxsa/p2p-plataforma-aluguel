import { useEffect, useState } from 'react';
import { anunciosApi } from '../api/anuncios';
import { anuncioStatus } from '../services/anuncioValidation';

export default function AnnouncementHistory({ id, revision }) {
  const [open, setOpen] = useState(false), [page, setPage] = useState(1), [state, setState] = useState({ loading: true });
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!open) return;
    let active = true;
    anunciosApi.history(id, page).then(data => { if (active) setState({ data }); })
      .catch(error => { if (active) setState({ error: error.message }); });
    return () => { active = false; };
  }, [id, page, open, revision, retry]);
  return <section className="anuncio-history" aria-label="Histórico do anúncio">
    <button className="btn ghost small" aria-expanded={open} onClick={() => setOpen(value => !value)}>{open ? 'Ocultar histórico' : 'Ver histórico de transições'}</button>
    {open && <>
      <h2>Histórico de transições</h2>
      {state.loading && <p role="status">Carregando histórico...</p>}
      {state.error && <p className="alert err" role="alert">{state.error} <button className="btn ghost small" onClick={() => setRetry(n => n + 1)}>Atualizar histórico</button></p>}
      {state.data && <>
        {!state.data.items.length && <p className="muted">Nenhuma transição registrada.</p>}
        <ol>{state.data.items.map(item => <li key={item.id}><strong>{anuncioStatus[item.status_anterior]} → {anuncioStatus[item.status_novo]}</strong><br />
          <span className="muted">{new Date(item.criado_em).toLocaleString('pt-BR')} · {item.operacao}</span></li>)}</ol>
        <nav className="row" aria-label="Paginação do histórico do anúncio"><button className="btn ghost small" disabled={page <= 1} onClick={() => setPage(n => n - 1)}>Anterior</button>
          <span>Página {page} · {state.data.total} transições</span>
          <button className="btn ghost small" disabled={page * state.data.limit >= state.data.total} onClick={() => setPage(n => n + 1)}>Próxima</button></nav>
      </>}
    </>}
  </section>;
}
