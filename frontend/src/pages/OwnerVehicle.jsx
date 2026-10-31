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
  return <div className={`container page owner-vehicle${editing ? ' owner-vehicle-edit' : ''}`}><div className="panel">
    <Link className="owner-vehicle-back muted" to="/painel?aba=veiculos">← Meus veículos</Link>
    {editing && <h2>Editar veículo</h2>}
    {state.loading && <p role="status">Carregando veículo...</p>}
    {state.error && <div className="alert err" role="alert">{state.error}</div>}
    {v && (editing ? v.desativado_em ? <div className="alert warn">Veículo desativado.</div> : <>
      <p className="muted">A edição de veículos já validados, com documentos ou anúncios depende de revisão.</p>
      <VehicleForm key={v.id} initial={v} editing onSave={save} />
    </> : <>
      <header className="owner-vehicle-header">
        <div className="owner-vehicle-title">
          <h2>{v.marca} {v.modelo}</h2>
          <span className="status owner-vehicle-status">{v.desativado_em ? 'DESATIVADO' : v.status_cadastro}</span>
        </div>
        <ul className="owner-vehicle-meta muted" aria-label="Informações do veículo">
          <li>{v.placa}</li><li>{v.ano_fabricacao}/{v.ano_modelo}</li><li>{v.categoria}</li>
          <li>{v.cambio}</li><li>{v.combustivel}</li><li>{v.quantidade_lugares} lugares</li>
        </ul>
        <div className="owner-vehicle-tools">
          <p className="muted">{v.anuncio ? `Anúncio: ${v.anuncio.titulo} (${v.anuncio.status})` : 'Sem anúncio publicado.'}</p>
          {!v.desativado_em && <Link className="btn ghost small" to={`/meus-veiculos/${v.id}/editar`}>Editar veículo</Link>}
        </div>
      </header>
      <VehiclePhotos key={`${user?.id}:${v.id}`} vehicle={v} />
    </>)}
  </div></div>;
}
