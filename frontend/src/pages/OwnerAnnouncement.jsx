import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { anunciosApi } from '../api/anuncios';
import { useApp } from '../store/AppContext';
import { anuncioStatus, formatMoney, moneyFields, vehicleName } from '../services/anuncioValidation';
import AnuncioForm from '../components/AnuncioForm';
import AnnouncementHistory from '../components/AnnouncementHistory';

const operations = {
  publish: { label: 'Publicar anúncio', confirm: 'Confirmar publicação', success: 'Anúncio publicado com sucesso.', description: 'A publicação verificará novamente a aprovação do veículo, o CRLV e as fotografias. Confira os dados salvos antes de confirmar.' },
  pause: { label: 'Pausar anúncio', confirm: 'Confirmar pausa', success: 'Anúncio pausado.', description: 'O anúncio será retirado de circulação. Reservas existentes não serão canceladas.' },
  reactivate: { label: 'Reativar anúncio', confirm: 'Confirmar reativação', success: 'Anúncio reativado.', description: 'A API verificará novamente a situação administrativa, o CRLV e as fotografias antes de reativar.' },
  close: { label: 'Encerrar anúncio', confirm: 'Confirmar encerramento', success: 'Anúncio encerrado. Histórico preservado.', description: 'O encerramento é definitivo: este anúncio não poderá ser reativado. Histórico, veículo e fotografias serão preservados. Reservas existentes não serão canceladas e obrigações pendentes podem impedir o encerramento.' },
};

export default function OwnerAnnouncement() {
  const { id } = useParams();
  const { user, flash } = useApp();
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState({ loading: true });
  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [version, setVersion] = useState(0);
  const [dirty, setDirty] = useState(false);
  const pending = useRef(false);
  const generation = useRef(0);
  const opener = useRef(null);
  useEffect(() => {
    const request = ++generation.current;
    setState({ loading: true }); setError(''); setConfirm(false); setDirty(false);
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
  async function mutate(data, action = null) {
    if (pending.current) return;
    const request = generation.current;
    pending.current = true; setBusy(true); setError('');
    try {
      const row = action ? await anunciosApi[action](id) : await anunciosApi.update(id, data);
      if (request !== generation.current) return;
      setState({ row }); setConfirm(false); setDirty(false); setVersion(n => n + 1);
      flash(action ? operations[action].success : 'Anúncio atualizado com sucesso.');
      await refresh(request);
    } catch (err) {
      if (request !== generation.current) return;
      if ([404, 409].includes(err.status)) await refresh(request);
      setConfirm(false); setError(err.message);
      if (!action) throw err;
    } finally { pending.current = false; setBusy(false); }
  }

  const row = state.row;
  const editable = ['RASCUNHO','PAUSADO'].includes(row?.status);
  const actions = { RASCUNHO: ['publish','close'], ATIVO: ['pause','close'], PAUSADO: ['reactivate','close'], ENCERRADO: [] }[row?.status] || [];
  function cancel() { setConfirm(null); requestAnimationFrame(() => opener.current?.focus()); }
  return <div className="container page anuncios-page anuncio-editor"><div className="panel">
    <Link className="owner-vehicle-back muted" to="/anuncios/meus">← Meus anúncios</Link>
    {state.loading && <p role="status">Carregando detalhes do anúncio...</p>}
    {state.error && <div className="alert err" role="alert">{state.error} <button className="btn ghost small" onClick={() => setRevision(n => n + 1)}>Tentar novamente</button></div>}
    {row && <>
      <header className="owner-vehicle-header">
        <div className="owner-vehicle-title"><h1>{row.titulo}</h1><span className={`status anuncio-status st-${row.status}`}>{anuncioStatus[row.status] || row.status}</span></div>
        <p className="muted">{vehicleName(row.veiculo)} · Criado em {new Date(row.criado_em).toLocaleDateString('pt-BR')}</p>
        <Link className="muted" to={`/meus-veiculos/${row.veiculo_id}`}>Ver veículo</Link>
      </header>
      {error && <div className="alert err" role="alert">{error} <button className="btn ghost small" disabled={busy} onClick={() => { setError(''); void refresh(generation.current); }}>Atualizar dados</button></div>}
      {editable ? <>
        <p className="muted">{row.status === 'RASCUNHO' ? 'Rascunho privado.' : 'Anúncio pausado.'} Salve as alterações antes de publicar ou reativar.</p>
        <AnuncioForm key={`${user?.id}:${row.id}:${version}`} initial={row} onSave={data => mutate(data)} onDirtyChange={setDirty} disabled={busy || !!confirm} />
      </> : <>
        <div className="alert info">{row.status === 'ENCERRADO' ? 'Anúncio encerrado. O histórico foi preservado.' : 'Anúncio publicado. Pause para editar os dados.'}</div>
        <p className="anuncio-description">{row.descricao || 'Sem descrição.'}</p>
        {moneyFields.map(([key, label]) => <div className="kv" key={key}><span>{label}</span><strong>{formatMoney(row[key])}</strong></div>)}
        <div className="kv"><span>Aceitação automática de reservas</span><strong>{row.aceite_automatico ? 'Sim' : 'Não'}</strong></div>
      </>}
      {editable && row.veiculo?.status_cadastro && row.veiculo.status_cadastro !== 'APROVADO' && <p className="alert warn">Seu veículo precisa ser aprovado antes da publicação.</p>}
      {dirty && <p className="muted">Salve as alterações antes de publicar ou reativar o anúncio.</p>}
      <div className="row anuncio-lifecycle-actions">{actions.map(action => <button key={action} className={`btn ${action === 'close' ? 'danger' : 'primary'}`} disabled={busy || !!confirm || (dirty && ['publish','reactivate'].includes(action))}
        onClick={event => { opener.current = event.currentTarget; setConfirm(action); setError(''); }}>{operations[action].label}</button>)}</div>
      {confirm && <section className="alert warn anuncio-lifecycle-dialog" role="dialog" aria-labelledby="anuncio-action-title" aria-describedby="anuncio-action-description"
        onKeyDown={event => { if (event.key === 'Escape' && !pending.current) cancel(); }}>
        <h2 id="anuncio-action-title">{operations[confirm].label}?</h2>
        <p id="anuncio-action-description">{operations[confirm].description}</p>
        <div className="row"><button className={`btn ${confirm === 'close' ? 'danger' : 'primary'}`} autoFocus disabled={busy} onClick={() => mutate(undefined, confirm)}>{busy ? 'Processando anúncio...' : operations[confirm].confirm}</button>
          <button className="btn ghost" disabled={busy} onClick={cancel}>Cancelar</button></div>
      </section>}
      {busy && <p role="status">Processando anúncio. Aguarde...</p>}
      <AnnouncementHistory key={`${user?.id}:${row.id}`} id={row.id} revision={version} />
    </>}
  </div></div>;
}
