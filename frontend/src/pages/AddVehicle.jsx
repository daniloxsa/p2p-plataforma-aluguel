import { useNavigate } from 'react-router-dom';
import { useApp } from '../store/AppContext';
import { veiculosApi } from '../api/veiculos';
import VehicleForm from '../components/VehicleForm';
export default function AddVehicle() {
  const { flash } = useApp();
  const nav = useNavigate();
  async function save(data) {
    await veiculosApi.create(data);
    flash('Veículo cadastrado com sucesso! Aguardando validação.');
    nav('/painel?aba=veiculos');
  }
  return <div className="container page" style={{ maxWidth: 720 }}><div className="panel">
    <h2 style={{ marginTop: 0 }}>Cadastrar veículo</h2>
    <div className="alert info">O cadastro é salvo na sua conta. Publicação de anúncio, preços, fotos e documentos terão fluxos próprios. Seu veículo não será publicado automaticamente.</div>
    <VehicleForm onSave={save} />
  </div></div>;
}
