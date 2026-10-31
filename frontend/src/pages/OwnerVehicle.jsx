import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { veiculosApi } from '../api/veiculos';
import { useApp } from '../store/AppContext';
import VehicleForm from '../components/VehicleForm';
import VehiclePhotos from '../components/VehiclePhotos';
export default function OwnerVehicle({ editing = false }) {
  const { id } = useParams();
  const { user, flash } = useApp();
  const nav = useNavigate();
  const [state, setState] = useState({ loading: true });
  useEffect(() => {
    let active = true;
    setState({ loading: true });
    veiculosApi.own(id).then(vehicle => { if (active) setState({ vehicle }); })
      .catch(error => { if (active) setState({ error: error.message }); });
    return () => { active = false; };
  }, [id, user?.id]);
  async function save(data) {
    await veiculosApi.update(id, data);
    flash('Veículo atualizado com sucesso!'); nav('/painel?aba=veiculos');
  }
  const v = state.vehicle;
  return <div className="container page" style={{ maxWidth: 720 }}><div className="panel">
    <Link to="/painel?aba=veiculos">← Meus veículos</Link>
    <h2>{editing ? 'Editar veículo' : 'Meu veículo'}</h2>
    {state.loading && <p role="status">Carregando veículo...</p>}
    {state.error && <div className="alert err" role="alert">{state.error}</div>}
    {v && (editing ? v.desativado_em ? <div className="alert warn">Veículo desativado.</div> : <>
      <p className="muted">A edição de veículos já validados, com documentos ou anúncios depende de revisão.</p>
      <VehicleForm key={v.id} initial={v} editing onSave={save} />
    </> : <>
      <h3>{v.marca} {v.modelo}</h3>
      <p>{v.placa} · {v.ano_fabricacao}/{v.ano_modelo} · {v.categoria}</p>
      <p>{v.cambio} · {v.combustivel} · {v.quantidade_lugares} lugares</p>
      <p>Status: {v.desativado_em ? 'DESATIVADO' : v.status_cadastro}</p>
      <p>{v.anuncio ? `Anúncio: ${v.anuncio.titulo} (${v.anuncio.status})` : 'Sem anúncio publicado.'}</p>
      {!v.desativado_em && <Link className="btn" to={`/meus-veiculos/${v.id}/editar`}>Editar</Link>}
      <a className="btn" href="#fotos" onClick={event => { event.preventDefault(); document.getElementById('fotos')?.scrollIntoView({ behavior: 'smooth' }); }}>Gerenciar fotos</a>
      <VehiclePhotos key={`${user?.id}:${v.id}`} vehicle={v} />
    </>)}
  </div></div>;
}
