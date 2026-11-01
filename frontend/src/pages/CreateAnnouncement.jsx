import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { anunciosApi } from '../api/anuncios';
import { veiculosApi } from '../api/veiculos';
import { ApiError } from '../api/client';
import { useApp } from '../store/AppContext';
import AnuncioForm from '../components/AnuncioForm';

export default function CreateAnnouncement() {
  const { user, flash } = useApp();
  const [params] = useSearchParams();
  const selected = params.get('veiculo') || '';
  const nav = useNavigate();
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState({ loading: true });
  const [moreBusy, setMoreBusy] = useState(false);
  const morePending = useRef(false);
  const activeRequest = useRef(0);

  useEffect(() => {
    const request = ++activeRequest.current;
    setState({ loading: true });
    (async () => {
      try {
        const data = await veiculosApi.mine(1, 20);
        let vehicle = null, warning = '';
        if (selected) {
          try {
            vehicle = await veiculosApi.own(selected);
            if (vehicle.desativado_em) { vehicle = null; warning = 'O veículo selecionado está desativado. Escolha outro veículo.'; }
          } catch (error) {
            if (error.status !== 404 && error.status !== 400) throw error;
            warning = 'O veículo selecionado está indisponível. Escolha outro veículo da sua conta.';
          }
        }
        const items = vehicle && !data.items.some(v => v.id === vehicle.id) ? [vehicle, ...data.items] : data.items;
        if (request === activeRequest.current) setState({ data: { ...data, items }, selected: vehicle?.id || '', warning });
      } catch (error) { if (request === activeRequest.current) setState({ error: error.message }); }
    })();
    return () => { activeRequest.current++; };
  }, [selected, user?.id, revision]);

  async function more() {
    if (morePending.current) return;
    const request = activeRequest.current;
    morePending.current = true; setMoreBusy(true);
    try {
      const data = await veiculosApi.mine(state.data.page + 1, 20);
      if (request === activeRequest.current) setState(current => ({ ...current, warning: '', data: { ...data,
        items: [...new Map([...current.data.items, ...data.items].map(v => [v.id, v])).values()] } }));
    } catch (error) { if (request === activeRequest.current) setState(current => ({ ...current, warning: error.message })); }
    finally { morePending.current = false; setMoreBusy(false); }
  }

  async function create(data) {
    const request = activeRequest.current;
    try {
      // Revalidate the preselection/ownership via the same private API immediately before creation.
      const vehicle = await veiculosApi.own(data.veiculo_id);
      if (request !== activeRequest.current) return;
      if (vehicle.desativado_em) throw new ApiError(409, 'Veículo desativado. Escolha outro veículo.');
      const created = await anunciosApi.create(data);
      if (request !== activeRequest.current) return;
      flash('Rascunho criado com sucesso.');
      nav(`/anuncios/meus/${created.id}`);
    } catch (error) {
      if (request !== activeRequest.current) return;
      if ([404, 409].includes(error.status)) {
        try {
          const vehicle = await veiculosApi.own(data.veiculo_id);
          if (request === activeRequest.current) setState(current => ({ ...current, data: { ...current.data,
            items: current.data.items.map(v => v.id === vehicle.id ? vehicle : v) } }));
        } catch (refreshError) {
          if (request === activeRequest.current && refreshError.status === 404) setState(current => ({ ...current, data: { ...current.data,
            items: current.data.items.filter(v => v.id !== data.veiculo_id) } }));
        }
      }
      throw error;
    }
  }

  const vehicles = state.data?.items.filter(v => !v.desativado_em) || [];
  return <div className="container page anuncios-page anuncio-editor"><div className="panel">
    <Link className="owner-vehicle-back muted" to="/anuncios/meus">← Meus anúncios</Link>
    <h1>Criar anúncio</h1><p className="muted">Salve um rascunho. O anúncio ainda não ficará disponível para locação.</p>
    {state.loading && <p role="status">Carregando seus veículos...</p>}
    {state.error && <div className="alert err" role="alert">{state.error} <button className="btn ghost small" onClick={() => setRevision(n => n + 1)}>Tentar novamente</button></div>}
    {state.warning && <div className="alert warn" role="alert">{state.warning}</div>}
    {state.data && <>
      {!vehicles.length && <div className="alert info">Nenhum veículo disponível entre os carregados. <Link to="/anunciar">Cadastrar veículo</Link></div>}
      <AnuncioForm key={`${user?.id}:${selected}:${revision}`} creating initial={{ veiculo_id: state.selected }} vehicles={vehicles} onSave={create}>
        {state.data.page * state.data.limit < state.data.total && state.data.page < 100000 && <button className="btn ghost small anuncio-more" type="button" disabled={moreBusy} onClick={more}>{moreBusy ? 'Carregando veículos...' : 'Carregar mais veículos'}</button>}
      </AnuncioForm>
    </>}
  </div></div>;
}
