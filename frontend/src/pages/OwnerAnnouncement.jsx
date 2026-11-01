import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { anunciosApi } from '../api/anuncios';
import { useApp } from '../store/AppContext';
import { formatMoney, moneyFields, vehicleName } from '../services/anuncioValidation';
import AnuncioForm from '../components/AnuncioForm';

export default function OwnerAnnouncement() {
  const { id } = useParams();
  const { user, flash } = useApp();
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState({ loading: true });
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [version, setVersion] = useState(0);
  const pending = useRef(false);
  const generation = useRef(0);
  useEffect(() => {
    const request = ++generation.current;
    setState({ loading: true }); setError(''); setConfirm(false);
    anunciosApi.own(id).then(row => { if (request === generation.current) setState({ row }); })
      .catch(err => { if (request === generation.current) setState({ error: err.message }); });
    return () => { generation.current++; };
  }, [id, user?.id, revision]);

  async function refresh(request) {
    try {
      const row = await anunciosApi.own(id);
      if (request === generation.current) setState({ row });
    } catch (err) {
      if (request !== generation.current) return;
      if (err.status === 404) setState({ error: err.message });
      else setError(`Não foi possível atualizar os detalhes. ${err.message}`);
    }
  }
  async function mutate(data, closing = false) {
    if (pending.current) return;
    const request = generation.current;
    pending.current = true; setBusy(true); setError('');
    try {
      const row = closing ? await anunciosApi.close(id) : await anunciosApi.update(id, data);
      if (request !== generation.current) return;
      setState({ row }); setConfirm(false); setVersion(n => n + 1);
      flash(closing ? 'Anúncio encerrado. Histórico preservado.' : 'Anúncio atualizado com sucesso.');
      await refresh(request);
    } catch (err) {
      if (request !== generation.current) return;
      if ([404, 409].includes(err.status)) await refresh(request);
      setConfirm(false); setError(err.message);
      if (!closing) throw err;
    } finally { pending.current = false; setBusy(false); }
  }

  const row = state.row;
  const draft = row?.status === 'RASCUNHO';
  return <div className="container page anuncios-page anuncio-editor"><div className="panel">
    <Link className="owner-vehicle-back muted" to="/anuncios/meus">← Meus anúncios</Link>
    {state.loading && <p role="status">Carregando detalhes do anúncio...</p>}
    {state.error && <div className="alert err" role="alert">{state.error} <button className="btn ghost small" onClick={() => setRevision(n => n + 1)}>Tentar novamente</button></div>}
    {row && <>
      <header className="owner-vehicle-header">
        <div className="owner-vehicle-title"><h1>{row.titulo}</h1><span className={`status anuncio-status st-${row.status}`}>{row.status}</span></div>
        <p className="muted">{vehicleName(row.veiculo)} · Criado em {new Date(row.criado_em).toLocaleDateString('pt-BR')}</p>
        <Link className="muted" to={`/meus-veiculos/${row.veiculo_id}`}>Ver veículo</Link>
      </header>
      {error && <div className="alert err" role="alert">{error} <button className="btn ghost small" disabled={busy} onClick={() => { setError(''); void refresh(generation.current); }}>Atualizar dados</button></div>}
      {draft ? <>
        <p className="muted">Rascunho privado. Edite os dados antes da publicação futura.</p>
        <AnuncioForm key={`${user?.id}:${row.id}:${version}`} initial={row} onSave={data => mutate(data)} disabled={busy || confirm} />
        <div className="anuncio-close"><button className="btn danger" disabled={busy || confirm} onClick={() => setConfirm(true)}>Encerrar anúncio</button></div>
        {confirm && <section className="alert warn" role="dialog" aria-labelledby="encerrar-titulo" aria-describedby="encerrar-descricao">
          <h2 id="encerrar-titulo">Encerrar anúncio?</h2>
          <p id="encerrar-descricao">O rascunho será encerrado e não poderá mais ser editado. O histórico, o veículo e as fotografias serão preservados.</p>
          <div className="row"><button className="btn danger" autoFocus disabled={busy} onClick={() => mutate(undefined, true)}>{busy ? 'Encerrando anúncio...' : 'Confirmar encerramento'}</button>
            <button className="btn ghost" disabled={busy} onClick={() => setConfirm(false)}>Cancelar</button></div>
        </section>}
      </> : <>
        <div className="alert info">{row.status === 'ENCERRADO' ? 'Anúncio encerrado. O histórico foi preservado.' : 'Este anúncio está disponível apenas para consulta nesta fase.'}</div>
        <p className="anuncio-description">{row.descricao || 'Sem descrição.'}</p>
        {moneyFields.map(([key, label]) => <div className="kv" key={key}><span>{label}</span><strong>{formatMoney(row[key])}</strong></div>)}
        <div className="kv"><span>Aceitação automática de reservas</span><strong>{row.aceite_automatico ? 'Sim' : 'Não'}</strong></div>
      </>}
    </>}
  </div></div>;
}
