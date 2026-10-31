import { useCallback, useEffect, useRef, useState } from 'react';
import { fotosVeiculosApi as api } from '../api/fotosVeiculos';

export default function VehiclePhotos({ vehicle }) {
  const [photos, setPhotos] = useState([]);
  const [selected, setSelected] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [confirm, setConfirm] = useState(null);
  const pending = useRef(false);
  const previews = useRef([]);
  const mounted = useRef(false);
  const disabled = Boolean(vehicle.desativado_em);
  const load = useCallback(async () => {
    const rows = await api.list(vehicle.id);
    if (mounted.current) setPhotos(rows);
  }, [vehicle.id]);
  useEffect(() => {
    mounted.current = true;
    load().catch(err => { if (mounted.current) setError(err.message); })
      .finally(() => { if (mounted.current) setLoading(false); });
    return () => { mounted.current = false; previews.current.forEach(item => URL.revokeObjectURL(item.url)); };
  }, [load]);
  // Refresh signed URLs before the earliest expiry; refresh again on tab focus.
  useEffect(() => {
    const expiry = Math.min(...photos.map(photo => Date.parse(photo.expira_em)).filter(Number.isFinite));
    const refresh = () => { if (!pending.current) load().catch(err => { if (mounted.current) setError(err.message); }); };
    const timer = Number.isFinite(expiry) ? setTimeout(refresh, Math.max(10000, expiry - Date.now() - 30000)) : null;
    window.addEventListener('focus', refresh);
    return () => { clearTimeout(timer); window.removeEventListener('focus', refresh); };
  }, [photos, load]);
  function updateSelection(items) { previews.current = items; setSelected(items); }
  function clearSelection() { previews.current.forEach(item => URL.revokeObjectURL(item.url)); updateSelection([]); }
  function choose(event) {
    const files = [...event.target.files]; event.target.value = '';
    setError(''); setMessage('');
    if (photos.length + selected.length + files.length > 10) { setError('Limite de 10 fotos por veículo. Remova imagens da seleção.'); return; }
    const invalid = files.find(file => !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024 || !file.size);
    if (invalid) { setError('Selecione JPEG, PNG ou WebP de até 5 MB por arquivo.'); return; }
    const keys = new Set(selected.map(item => item.key));
    const items = [];
    for (const file of files) {
      const key = `${file.name}:${file.size}:${file.lastModified}`;
      if (keys.has(key)) { setError('Arquivo já selecionado.'); continue; }
      keys.add(key); items.push({ file, key, url: URL.createObjectURL(file) });
    }
    updateSelection([...selected, ...items]);
  }
  async function action(operation, success) {
    if (pending.current || disabled) return;
    pending.current = true; setBusy(true); setError(''); setMessage('');
    try { await operation(); if (mounted.current) { await load(); setMessage(success); } }
    catch (err) { if (mounted.current) setError(err.message); }
    finally { pending.current = false; if (mounted.current) setBusy(false); }
  }
  function move(index, delta) {
    const ids = photos.map(photo => photo.id);
    [ids[index], ids[index + delta]] = [ids[index + delta], ids[index]];
    void action(() => api.reorder(vehicle.id, ids), 'Ordem atualizada.');
  }
  return <section aria-label="Gerenciar fotos" id="fotos" style={{ marginTop: 24 }}>
    <h3>Gerenciar fotos <small>({photos.length}/10)</small></h3>
    <p className="muted">JPEG, PNG ou WebP · até 5 MB por foto · {Math.max(0, 10 - photos.length - selected.length)} vagas restantes. As fotos não publicam o veículo.</p>
    {disabled && <div className="alert warn">Veículo desativado. Fotos preservadas para consulta privada.</div>}
    {error && <div className="alert err" role="alert">{error} <button className="btn small" disabled={busy} onClick={() => { setError(''); load().catch(err => setError(err.message)); }}>Atualizar galeria</button></div>}
    {message && <p className="alert ok" role="status">{message}</p>}
    {loading && <p role="status">Carregando fotos...</p>}
    {!loading && !photos.length && <p>Nenhuma foto cadastrada.</p>}
    {!disabled && <fieldset disabled={busy || loading} style={{ border: 0, padding: 0 }}>
      <label>Selecionar imagens <input aria-label="Selecionar imagens" type="file" multiple accept="image/jpeg,image/png,image/webp" onChange={choose} disabled={photos.length + selected.length >= 10} /></label>
      {selected.length > 0 && <>
        <div style={grid}>{selected.map(item => <figure key={item.key} style={{ margin: 0 }}>
          <img src={item.url} alt={`Prévia de ${item.file.name}`} style={imageStyle} />
          <figcaption>{item.file.name}</figcaption>
          <button className="btn small" onClick={() => { URL.revokeObjectURL(item.url); updateSelection(selected.filter(s => s.key !== item.key)); }}>Remover seleção de {item.file.name}</button>
        </figure>)}</div>
        <button className="btn primary" disabled={busy} onClick={() => action(async () => { await api.upload(vehicle.id, selected.map(item => item.file)); clearSelection(); }, 'Fotos enviadas.')}>Enviar {selected.length} foto(s)</button>
      </>}
    </fieldset>}
    {busy && <p role="status">Processando fotos. Aguarde...</p>}
    <div style={grid}>{photos.map((photo, index) => <figure key={photo.id} style={{ margin: 0 }}>
      <img src={photo.url} alt={photo.descricao || `Foto ${index + 1} do veículo`} referrerPolicy="no-referrer" style={imageStyle} />
      <figcaption>Foto {index + 1} {photo.principal && <strong className="tag">Principal</strong>}</figcaption>
      {!disabled && <div>
        <button className="btn small" disabled={busy || photo.principal} onClick={() => action(() => api.principal(vehicle.id, photo.id), 'Foto principal atualizada.')}>Definir principal</button>
        <button className="btn small" aria-label={`Mover foto ${index + 1} para antes`} disabled={busy || index === 0} onClick={() => move(index, -1)}>←</button>
        <button className="btn small" aria-label={`Mover foto ${index + 1} para depois`} disabled={busy || index === photos.length - 1} onClick={() => move(index, 1)}>→</button>
        <button className="btn danger small" disabled={busy} onClick={() => setConfirm(photo)}>Excluir foto {index + 1}</button>
      </div>}
    </figure>)}</div>
    {confirm && <div role="dialog" aria-modal="true" aria-label="Excluir foto" className="alert warn">
      <p>Excluir esta foto do veículo?</p>
      <button className="btn danger" disabled={busy} onClick={() => action(async () => { await api.remove(vehicle.id, confirm.id); setConfirm(null); }, 'Foto excluída.')}>Confirmar exclusão</button>
      <button className="btn ghost" disabled={busy} onClick={() => setConfirm(null)}>Cancelar</button>
    </div>}
  </section>;
}
const grid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, margin: '16px 0' };
const imageStyle = { width: '100%', height: 150, objectFit: 'cover', borderRadius: 10 };
